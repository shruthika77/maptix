'use strict';

/**
 * Cloudflare Workers AI — Meta Llama 3 Integration (Node.js)
 * 
 * Ported from Python backend to work with Zoho Catalyst serverless functions.
 * Uses the Cloudflare Workers AI REST API with @cf/meta/llama-3-8b-instruct.
 */

const fetch = require('node-fetch');

// ── Cloudflare API Configuration ──
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';  // Set via environment variable
const CF_API_TOKEN = process.env.CF_API_TOKEN || '';  // Set via environment variable
const CF_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/`;
const LLAMA_MODEL = '@cf/meta/llama-3-8b-instruct';

const CF_HEADERS = {
  'Authorization': `Bearer ${CF_API_TOKEN}`,
  'Content-Type': 'application/json',
};

/**
 * Call Cloudflare Workers AI Llama 3 model.
 * Returns the generated text or null on failure.
 */
async function callLlama(messages, maxTokens = 2048) {
  const payload = {
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${CF_API_BASE}${LLAMA_MODEL}`, {
      method: 'POST',
      headers: CF_HEADERS,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status !== 200) {
      const text = await response.text();
      console.warn(`Cloudflare AI API returned ${response.status}: ${text.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();

    if (data.success) {
      return (data.result && data.result.response) || '';
    } else {
      console.warn('Cloudflare AI API error:', data.errors);
      return null;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('Cloudflare AI API timeout — will use fallback');
    } else {
      console.warn(`Cloudflare AI request failed: ${err.message}`);
    }
    return null;
  }
}

/**
 * Extract JSON from LLM response text.
 * Handles markdown code blocks and mixed text.
 */
function extractJsonFromResponse(text) {
  if (!text) return null;

  // Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch (e) { /* continue */ }

  // Try markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) { /* continue */ }
  }

  // Try finding first { ... } block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch (e) { /* continue */ }
  }

  // Try finding first [ ... ] block
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch) {
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      return Array.isArray(parsed) ? { floors: parsed } : parsed;
    } catch (e) { /* continue */ }
  }

  return null;
}

// ── PUBLIC API ──

/**
 * Use Meta Llama 3 to parse a natural language prompt into structured floor plan specs.
 */
async function aiParsePromptToLayout(prompt, buildingType = 'residential') {
  const systemPrompt = `You are an expert architectural floor plan designer. 
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
}`;

  const userMessage = `Building type: ${buildingType}\nLayout description: ${prompt}\n\nRespond with JSON only.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const rawResponse = await callLlama(messages, 1500);
  if (!rawResponse) return null;

  const parsed = extractJsonFromResponse(rawResponse);
  if (!parsed) {
    console.warn(`Could not parse JSON from AI response: ${rawResponse.substring(0, 200)}`);
    return null;
  }

  // Validate structure
  if (!parsed.floors || !Array.isArray(parsed.floors)) {
    console.warn('AI response missing "floors" array');
    return null;
  }

  for (const floor of parsed.floors) {
    if (!floor.rooms || !Array.isArray(floor.rooms)) {
      console.warn('Floor missing "rooms" array');
      return null;
    }
    for (const room of floor.rooms) {
      room.name = room.name || room.type || 'Room';
      room.type = room.type || 'unknown';
      room.count = room.count || 1;
    }
  }

  console.log(`AI successfully parsed prompt into ${parsed.floors.length} floor(s)`);
  return parsed;
}

/**
 * Use Meta Llama 3 to enhance CV pipeline results with AI analysis.
 */
async function aiAnalyzeFloorPlanImage(imageDescription, detectedRooms, detectedWalls, buildingType = 'residential') {
  const roomSummaries = detectedRooms.map((room, i) => {
    const area = room.area_sqm || 0;
    const rtype = room.type || 'unknown';
    return `Room ${i + 1}: ~${area.toFixed(1)} sqm, currently labeled '${rtype}'`;
  });

  const roomsText = roomSummaries.length > 0 ? roomSummaries.join('\n') : 'No rooms detected';

  const systemPrompt = `You are an expert at analyzing floor plans. Given computer vision detection results from a floor plan image, improve the room labels and types.

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
}`;

  const userMessage = `Building type hint: ${buildingType}
Total walls detected: ${detectedWalls}
Total rooms detected: ${detectedRooms.length}

Room details:
${roomsText}

Additional context: ${imageDescription}

Respond with JSON only.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const rawResponse = await callLlama(messages, 1000);
  if (!rawResponse) return null;

  const parsed = extractJsonFromResponse(rawResponse);
  if (!parsed) {
    console.warn(`Could not parse AI analysis response: ${rawResponse.substring(0, 200)}`);
    return null;
  }

  console.log('AI floor plan analysis completed successfully');
  return parsed;
}

module.exports = {
  callLlama,
  extractJsonFromResponse,
  aiParsePromptToLayout,
  aiAnalyzeFloorPlanImage,
};
