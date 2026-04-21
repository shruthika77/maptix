"""
Cloudflare Workers AI — Meta Llama 3 integration.

Used for:
1. AI Prompt → Structured room layout (parse natural language into floor specs)
2. PDF/Image Analysis → Room identification and labeling

Uses the Cloudflare Workers AI REST API with @cf/meta/llama-3-8b-instruct.
"""

import json
import os
import re
import logging
from typing import Optional, List, Dict, Any

import requests

logger = logging.getLogger(__name__)

# ── Cloudflare API Configuration ──
# These can be overridden via environment variables
CF_ACCOUNT_ID = os.environ.get(
    "CF_ACCOUNT_ID",
    ""  # Set via environment variable
)
CF_API_TOKEN = os.environ.get(
    "CF_API_TOKEN",
    ""  # Set via environment variable
)
CF_API_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/"

CF_HEADERS = {
    "Authorization": f"Bearer {CF_API_TOKEN}",
    "Content-Type": "application/json",
}

# Models
LLAMA_MODEL = "@cf/meta/llama-3-8b-instruct"


def _call_llama(messages: List[Dict[str, str]], max_tokens: int = 2048) -> Optional[str]:
    """
    Call Cloudflare Workers AI Llama 3 model.
    Returns the generated text or None on failure.
    """
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,  # Low temperature for structured output
    }

    try:
        response = requests.post(
            f"{CF_API_BASE}{LLAMA_MODEL}",
            headers=CF_HEADERS,
            json=payload,
            timeout=15,
        )
        if response.status_code != 200:
            logger.warning(
                f"Cloudflare AI API returned {response.status_code}: "
                f"{response.text[:200]}"
            )
            return None

        data = response.json()

        if data.get("success"):
            result = data.get("result", {})
            return result.get("response", "")
        else:
            errors = data.get("errors", [])
            logger.warning(f"Cloudflare AI API error: {errors}")
            return None

    except requests.exceptions.Timeout:
        logger.warning("Cloudflare AI API timeout — will use fallback")
        return None
    except requests.exceptions.ConnectionError:
        logger.warning("Cloudflare AI API unreachable — will use fallback")
        return None
    except requests.exceptions.RequestException as e:
        logger.warning(f"Cloudflare AI API request failed: {e}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error calling Cloudflare AI: {e}")
        return None


def _extract_json_from_response(text: str) -> Optional[dict]:
    """
    Extract JSON from LLM response text.
    The model may wrap JSON in markdown code blocks or include extra text.
    """
    if not text:
        return None

    # Try direct parse first
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code block ```json ... ```
    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try finding first { ... } or [ ... ] block
    brace_match = re.search(r'\{.*\}', text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    bracket_match = re.search(r'\[.*\]', text, re.DOTALL)
    if bracket_match:
        try:
            parsed = json.loads(bracket_match.group(0))
            return {"floors": parsed} if isinstance(parsed, list) else parsed
        except json.JSONDecodeError:
            pass

    return None


# ── PUBLIC API ──

def ai_parse_prompt_to_layout(
    prompt: str,
    building_type: str = "residential",
) -> Optional[Dict[str, Any]]:
    """
    Use Meta Llama 3 to parse a natural language prompt into structured
    floor plan specifications.

    Returns a dict like:
    {
        "floors": [
            {
                "level": 0,
                "label": "Ground Floor",
                "rooms": [
                    {"name": "Living Room", "type": "living_room", "count": 1},
                    {"name": "Bedroom", "type": "bedroom", "count": 2},
                    ...
                ]
            }
        ],
        "plot_width_m": 12.0,
        "plot_length_m": 15.0
    }

    Returns None if the AI call fails (caller should fall back to rule-based parser).
    """
    system_prompt = """You are an expert architectural floor plan designer. 
Your job is to parse a user's natural language description of a building layout and convert it into a structured JSON specification.

RULES:
1. Extract all rooms mentioned with their types and counts
2. If the user mentions multiple floors (ground floor, first floor, etc.), create separate floor entries
3. Use these standard room types ONLY: living_room, bedroom, master_bedroom, kitchen, bathroom, toilet, dining_room, hallway, corridor, closet, study, balcony, garage, laundry, porch, office, guest_room, operation_theater, icu_room, private_room, ward, general_ward, labor_room, nurse_station, reception, waiting_area, pharmacy, store, sterilization_room, nicu_room, lab, x_ray_room, conference_room, cafeteria, lift, staircase
4. Estimate reasonable plot dimensions based on the rooms described
5. If a BHK number is given (e.g., "3BHK"), ensure the correct number of bedrooms and at minimum: living room, kitchen, bathrooms
6. Always include a corridor or hallway for layouts with 4+ rooms

You MUST respond with ONLY valid JSON, no explanation text. Use this exact format:
{
    "floors": [
        {
            "level": 0,
            "label": "Ground Floor",
            "rooms": [
                {"name": "Living Room", "type": "living_room", "count": 1},
                {"name": "Kitchen", "type": "kitchen", "count": 1}
            ]
        }
    ],
    "plot_width_m": 12.0,
    "plot_length_m": 15.0
}"""

    user_message = f"Building type: {building_type}\nLayout description: {prompt}\n\nRespond with JSON only."

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    raw_response = _call_llama(messages, max_tokens=1500)
    if not raw_response:
        return None

    parsed = _extract_json_from_response(raw_response)
    if not parsed:
        logger.warning(f"Could not parse JSON from AI response: {raw_response[:200]}")
        return None

    # Validate structure
    if "floors" not in parsed or not isinstance(parsed["floors"], list):
        logger.warning("AI response missing 'floors' array")
        return None

    for floor in parsed["floors"]:
        if "rooms" not in floor or not isinstance(floor["rooms"], list):
            logger.warning("Floor missing 'rooms' array")
            return None
        # Ensure each room has required fields
        for room in floor["rooms"]:
            if "name" not in room or "type" not in room:
                room.setdefault("name", room.get("type", "Room"))
                room.setdefault("type", "unknown")
            room.setdefault("count", 1)

    logger.info(f"AI successfully parsed prompt into {len(parsed['floors'])} floor(s)")
    return parsed


def ai_analyze_floor_plan_image(
    image_description: str,
    detected_rooms: List[Dict],
    detected_walls: int,
    building_type: str = "residential",
) -> Optional[Dict[str, Any]]:
    """
    Use Meta Llama 3 to enhance CV pipeline results with AI analysis.
    
    Given the raw CV detection results (room counts, basic shapes), the AI:
    1. Assigns better room labels/types based on size and position
    2. Suggests room functions (bedroom vs living room based on area)
    3. Identifies likely building layout patterns
    
    Returns enhanced room labels and analysis, or None on failure.
    """
    room_summaries = []
    for i, room in enumerate(detected_rooms):
        area = room.get("area_sqm", 0)
        rtype = room.get("type", "unknown")
        room_summaries.append(f"Room {i+1}: ~{area:.1f} sqm, currently labeled '{rtype}'")

    rooms_text = "\n".join(room_summaries) if room_summaries else "No rooms detected"

    system_prompt = """You are an expert at analyzing floor plans. Given computer vision detection results from a floor plan image, improve the room labels and types.

RULES:
1. Assign room types based on area: <5 sqm = bathroom/toilet/closet, 5-10 sqm = kitchen/study/small bedroom, 10-20 sqm = bedroom/office, 20+ sqm = living room/hall
2. A residential floor plan typically has: living room (largest), kitchen, bedrooms, bathrooms
3. Hospital/commercial plans have: reception, offices, wards, corridors
4. Consider room positions: entrance rooms are often reception/hallway, central rooms are living/corridor

Respond ONLY with valid JSON:
{
    "rooms": [
        {"index": 0, "suggested_type": "living_room", "suggested_label": "Living Room", "confidence": 0.8},
        {"index": 1, "suggested_type": "kitchen", "suggested_label": "Kitchen", "confidence": 0.7}
    ],
    "building_analysis": "Brief description of the detected layout",
    "estimated_building_type": "residential"
}"""

    user_message = f"""Building type hint: {building_type}
Total walls detected: {detected_walls}
Total rooms detected: {len(detected_rooms)}

Room details:
{rooms_text}

Additional context: {image_description}

Respond with JSON only."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    raw_response = _call_llama(messages, max_tokens=1000)
    if not raw_response:
        return None

    parsed = _extract_json_from_response(raw_response)
    if not parsed:
        logger.warning(f"Could not parse AI analysis response: {raw_response[:200]}")
        return None

    logger.info("AI floor plan analysis completed successfully")
    return parsed
