"""
Demo-mode endpoints — NO AUTH REQUIRED.
Handles all three input modes:
  1. Prompt-based generation (text → AI Llama 3 → layout)
  2. Manual form generation (structured spec → layout)
  3. File upload + processing (image/PDF → CV pipeline + AI analysis → layout)

AI Integration:
- Meta Llama 3 (via Cloudflare Workers AI) for prompt parsing
- Meta Llama 3 for floor plan image analysis enhancement
- Falls back to rule-based parser if AI is unavailable
"""

import uuid
import numpy as np
import cv2
import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from app.api.v1.endpoints.generate import (
    GenerateRequest,
    FloorSpec,
    RoomSpec,
    parse_prompt,
    LayoutGenerator,
)
from app.services.ai.cloudflare_llm import (
    ai_parse_prompt_to_layout,
    ai_analyze_floor_plan_image,
)
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


# ── 1. Prompt + Manual Form Endpoint ──

@router.post("")
async def demo_generate(request: GenerateRequest):
    """
    Generate a spatial model from prompt or structured specs — NO AUTH REQUIRED.

    For PROMPT mode:
      1. Tries AI (Meta Llama 3) to parse the prompt into structured rooms
      2. Falls back to rule-based parser if AI is unavailable

    For MANUAL mode:
      Uses the provided floor specs directly.
    """
    ai_used = False

    if request.floors and len(request.floors) > 0:
        # Manual form — use provided specs directly
        floors_spec = request.floors
        plot_width = request.plot_width_m or 12.0
        plot_length = request.plot_length_m or 15.0
    elif request.prompt:
        # ── Try AI-powered prompt parsing first ──
        ai_result = ai_parse_prompt_to_layout(
            prompt=request.prompt,
            building_type=request.building_type,
        )

        if ai_result and ai_result.get("floors"):
            logger.info("Using AI-parsed layout from Meta Llama 3")
            ai_used = True

            # Convert AI response to FloorSpec objects
            floors_spec = []
            for ai_floor in ai_result["floors"]:
                rooms = []
                for ai_room in ai_floor.get("rooms", []):
                    rooms.append(RoomSpec(
                        name=ai_room.get("name", "Room"),
                        type=ai_room.get("type", "unknown"),
                        count=ai_room.get("count", 1),
                        width_m=ai_room.get("width_m"),
                        length_m=ai_room.get("length_m"),
                        area_sqm=ai_room.get("area_sqm"),
                    ))
                floors_spec.append(FloorSpec(
                    level=ai_floor.get("level", len(floors_spec)),
                    label=ai_floor.get("label", f"Floor {len(floors_spec)}"),
                    rooms=rooms,
                    height_m=ai_floor.get("height_m", 3.0),
                ))

            plot_width = ai_result.get("plot_width_m", 12.0)
            plot_length = ai_result.get("plot_length_m", 15.0)
        else:
            # ── Fallback to rule-based parser ──
            logger.info("AI unavailable, using rule-based prompt parser")
            floors_spec, plot_width, plot_length = parse_prompt(
                request.prompt, request.building_type
            )
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either a 'prompt' or 'floors' specification",
        )

    if request.plot_width_m:
        plot_width = request.plot_width_m
    if request.plot_length_m:
        plot_length = request.plot_length_m

    generator = LayoutGenerator(
        plot_width=plot_width,
        plot_length=plot_length,
        wall_height=request.wall_height_m,
        wall_thickness=request.wall_thickness_m,
        ext_wall_thickness=request.exterior_wall_thickness_m,
    )

    floor_data_list = []
    for floor_spec in floors_spec:
        floor_data = generator.generate_floor(floor_spec)
        floor_data_list.append(floor_data)

    response = _build_response(
        floor_data_list, request.building_type, request.prompt,
        plot_width, plot_length
    )
    # Tag response with AI usage info
    response["ai_powered"] = ai_used
    response["ai_model"] = "Meta Llama 3 (Cloudflare Workers AI)" if ai_used else None
    return response


# ── 2. File Upload + CV Processing Endpoint ──

@router.post("/upload")
async def demo_upload_and_process(
    file: UploadFile = File(...),
    building_type: str = Form("residential"),
):
    """
    Upload a floor plan image/PDF → run CV pipeline + AI analysis → return spatial model.
    NO AUTH REQUIRED.

    Pipeline:
    1. Decode image (or extract from PDF)
    2. Run OpenCV processing (wall detection, room segmentation, object detection)
    3. Enhance results with AI analysis (Meta Llama 3 for room labeling)
    4. Build and return spatial model
    """
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()
    allowed = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp", ".pdf"}
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {list(allowed)}")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 50MB)")

    image = None
    is_pdf = ext == ".pdf"

    if is_pdf:
        image = _extract_image_from_pdf(content)
    else:
        nparr = np.frombuffer(content, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(400, "Could not decode the uploaded file as an image")

    # Run the full CV + AI pipeline
    spatial_model, ai_used = _run_cv_ai_pipeline(image, building_type, is_pdf)

    floors = spatial_model.get("floors", [])
    total_walls = sum(len(f.get("walls", [])) for f in floors)
    total_rooms = sum(len(f.get("rooms", [])) for f in floors)
    total_doors = sum(len(f.get("doors", [])) for f in floors)
    total_windows = sum(len(f.get("windows", [])) for f in floors)
    total_area = sum(
        r.get("area_sqm", 0) for f in floors for r in f.get("rooms", [])
    )
    bbox = spatial_model.get("metadata", {}).get("bounding_box", {})

    return {
        "status": "generated",
        "model_data": spatial_model,
        "stats": {
            "wall_count": total_walls,
            "room_count": total_rooms,
            "door_count": total_doors,
            "window_count": total_windows,
            "total_area_sqm": round(total_area, 2),
            "floor_count": len(floors),
            "plot_width_m": bbox.get("max", {}).get("x", 0),
            "plot_length_m": bbox.get("max", {}).get("y", 0),
        },
        "ai_powered": ai_used,
        "ai_model": "Meta Llama 3 (Cloudflare Workers AI)" if ai_used else None,
    }


# ── CV + AI Pipeline ──

def _extract_image_from_pdf(pdf_bytes: bytes):
    """Extract the first page of a PDF as an image."""
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        pix = page.get_pixmap(dpi=200)
        img_data = pix.tobytes("png")
        doc.close()
        nparr = np.frombuffer(img_data, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed — PDF support disabled")
        return None
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        return None


def _run_cv_ai_pipeline(image: np.ndarray, building_type: str, is_pdf: bool = False) -> tuple:
    """
    Full processing pipeline:
    1. Preprocessing (resize, grayscale, denoise, binarize)
    2. Wall detection (LSD + Hough)
    3. Room segmentation (flood fill + connected components)
    4. Object detection (doors via arcs, windows via perimeter gaps)
    5. AI Enhancement — Meta Llama 3 analyzes and improves room labels
    6. Spatial model construction

    Returns: (spatial_model_dict, ai_was_used_bool)
    """
    h, w = image.shape[:2]
    ai_used = False

    # ── PREPROCESSING ──
    max_dim = 2000
    if max(h, w) > max_dim:
        sf = max_dim / max(h, w)
        image = cv2.resize(image, None, fx=sf, fy=sf, interpolation=cv2.INTER_AREA)
        h, w = image.shape[:2]

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize=15, C=10
    )
    kern = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kern, iterations=1)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kern, iterations=1)

    scale_mpp = 12.0 / w

    # ── WALL DETECTION ──
    min_wl = 30
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    lsd_lines, widths, precs, nfas = lsd.detect(binary)

    raw_walls = []
    if lsd_lines is not None:
        for i, line in enumerate(lsd_lines):
            x1, y1, x2, y2 = line[0]
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < min_wl:
                continue
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
            if angle < 3 or angle > 177:
                avg = (y1 + y2) / 2.0
                y1 = y2 = avg
            elif abs(angle - 90) < 3:
                avg = (x1 + x2) / 2.0
                x1 = x2 = avg
            conf = float(precs[i][0]) if precs is not None else 0.7
            raw_walls.append({
                "x1": float(x1), "y1": float(y1),
                "x2": float(x2), "y2": float(y2),
                "confidence": conf, "length_px": length,
            })

    edges = cv2.Canny(binary, 50, 150, apertureSize=3)
    hough = cv2.HoughLinesP(edges, 1, np.pi / 180, 50, minLineLength=min_wl, maxLineGap=15)
    if hough is not None:
        for line in hough:
            x1, y1, x2, y2 = line[0]
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < min_wl:
                continue
            raw_walls.append({
                "x1": float(x1), "y1": float(y1),
                "x2": float(x2), "y2": float(y2),
                "confidence": min(length / 200.0, 1.0), "length_px": length,
            })

    # Dedup
    merged = []
    used = set()
    for i, w1 in enumerate(raw_walls):
        if i in used:
            continue
        best = w1
        for j, w2 in enumerate(raw_walls):
            if j <= i or j in used:
                continue
            dist = np.sqrt(
                ((w1["x1"] + w1["x2"]) / 2 - (w2["x1"] + w2["x2"]) / 2) ** 2 +
                ((w1["y1"] + w1["y2"]) / 2 - (w2["y1"] + w2["y2"]) / 2) ** 2
            ) * scale_mpp
            if dist < 0.3:
                used.add(j)
                if w2["length_px"] > best["length_px"]:
                    best = w2
        merged.append(best)
        used.add(i)
    raw_walls = merged

    det_walls = []
    for wl in raw_walls:
        det_walls.append({
            "x1": round(wl["x1"] * scale_mpp, 4),
            "y1": round(wl["y1"] * scale_mpp, 4),
            "x2": round(wl["x2"] * scale_mpp, 4),
            "y2": round(wl["y2"] * scale_mpp, 4),
            "confidence": round(wl["confidence"], 3),
            "length_m": round(wl["length_px"] * scale_mpp, 4),
        })

    # ── ROOM SEGMENTATION ──
    wm = binary.copy()
    kd = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    wm = cv2.dilate(wm, kd, iterations=2)
    rm = cv2.bitwise_not(wm)
    nl, lb, st, ct = cv2.connectedComponentsWithStats(rm, connectivity=4)

    det_rooms = []
    for li in range(1, nl):
        ap = st[li, cv2.CC_STAT_AREA]
        if ap < 500 or ap > int(h * w * 0.6):
            continue
        cm = (lb == li).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(cm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        cnt = max(cnts, key=cv2.contourArea)
        eps = 0.02 * cv2.arcLength(cnt, True)
        simp = cv2.approxPolyDP(cnt, eps, True)
        if len(simp) < 3:
            continue
        verts = [
            {"x": round(float(p[0][0]) * scale_mpp, 4), "y": round(float(p[0][1]) * scale_mpp, 4)}
            for p in simp
        ]
        area = ap * (scale_mpp ** 2)
        cx_r = sum(v["x"] for v in verts) / len(verts)
        cy_r = sum(v["y"] for v in verts) / len(verts)

        # Basic heuristic labeling (will be enhanced by AI)
        if area < 4:
            rt = "closet"
        elif area < 8:
            rt = "bathroom"
        elif area < 15:
            rt = "bedroom"
        elif area < 25:
            rt = "living_room"
        else:
            rt = "hall"

        rl = {
            "living_room": "Living Room", "bedroom": "Bedroom",
            "bathroom": "Bathroom", "closet": "Closet", "hall": "Hall",
        }
        det_rooms.append({
            "id": f"room-{uuid.uuid4().hex[:8]}",
            "polygon": {"vertices": verts},
            "area_sqm": round(area, 2),
            "type": rt,
            "label": rl.get(rt, f"Room {len(det_rooms) + 1}"),
            "confidence": round(min(0.7 + area / 200, 0.95), 3),
            "centroid": {"x": round(cx_r, 4), "y": round(cy_r, 4)},
        })

    # ── AI ENHANCEMENT — Improve room labels using Meta Llama 3 ──
    try:
        image_desc = f"{'PDF blueprint' if is_pdf else 'Image'} floor plan, {w}x{h} pixels, {building_type} building"
        ai_analysis = ai_analyze_floor_plan_image(
            image_description=image_desc,
            detected_rooms=det_rooms,
            detected_walls=len(det_walls),
            building_type=building_type,
        )

        if ai_analysis and "rooms" in ai_analysis:
            ai_used = True
            logger.info("AI analysis enhancing room labels")

            for ai_room in ai_analysis["rooms"]:
                idx = ai_room.get("index", -1)
                if 0 <= idx < len(det_rooms):
                    suggested_type = ai_room.get("suggested_type")
                    suggested_label = ai_room.get("suggested_label")
                    ai_confidence = ai_room.get("confidence", 0.5)

                    # Only override if AI is reasonably confident
                    if suggested_type and ai_confidence >= 0.5:
                        det_rooms[idx]["type"] = suggested_type
                        det_rooms[idx]["label"] = suggested_label or suggested_type.replace("_", " ").title()
                        # Blend confidences
                        original_conf = det_rooms[idx]["confidence"]
                        det_rooms[idx]["confidence"] = round(
                            (original_conf + ai_confidence) / 2, 3
                        )
                        det_rooms[idx]["ai_enhanced"] = True

            building_analysis = ai_analysis.get("building_analysis", "")
            logger.info(f"AI building analysis: {building_analysis}")
        else:
            logger.info("AI analysis unavailable, using CV-only results")
    except Exception as e:
        logger.warning(f"AI enhancement failed (non-critical): {e}")

    # ── OBJECT DETECTION ──
    det_doors = []
    det_windows = []
    circles = cv2.HoughCircles(
        binary, cv2.HOUGH_GRADIENT, dp=1, minDist=20,
        param1=50, param2=30, minRadius=10, maxRadius=80
    )
    if circles is not None:
        for c in circles[0]:
            cx_p, cy_p, r = c
            wm_val = float(r) * scale_mpp
            if 0.3 <= wm_val <= 1.5:
                det_doors.append({
                    "id": f"door-{uuid.uuid4().hex[:8]}",
                    "position": {
                        "x": round(float(cx_p) * scale_mpp, 4),
                        "y": round(float(cy_p) * scale_mpp, 4),
                    },
                    "width_m": round(wm_val, 2),
                    "height_m": 2.1,
                    "type": "single",
                    "confidence": 0.75,
                })

    bmx = w * scale_mpp
    bmy = h * scale_mpp
    for wl in det_walls:
        ll = wl["length_m"]
        if 0.8 <= ll <= 2.5:
            mx = (wl["x1"] + wl["x2"]) / 2
            my = (wl["y1"] + wl["y2"]) / 2
            if (mx < 0.5 or mx > bmx - 0.5 or my < 0.5 or my > bmy - 0.5) and len(det_windows) < 12:
                det_windows.append({
                    "id": f"win-{uuid.uuid4().hex[:8]}",
                    "position": {"x": round(mx, 4), "y": round(my, 4)},
                    "width_m": round(min(ll, 1.5), 2),
                    "height_m": 1.2,
                    "sill_height_m": 0.9,
                    "type": "casement",
                    "confidence": 0.65,
                })

    # ── BUILD SPATIAL MODEL ──
    bmxm = round(bmx, 2)
    bmym = round(bmy, 2)
    wobj = []
    for wl in det_walls[:60]:
        ie = (
            (abs(wl["x1"]) < 0.5 and abs(wl["x2"]) < 0.5) or
            (abs(wl["y1"]) < 0.5 and abs(wl["y2"]) < 0.5) or
            (abs(wl["x1"] - bmxm) < 0.5 and abs(wl["x2"] - bmxm) < 0.5) or
            (abs(wl["y1"] - bmym) < 0.5 and abs(wl["y2"] - bmym) < 0.5)
        )
        wobj.append({
            "id": f"w-{uuid.uuid4().hex[:8]}",
            "start": {"x": wl["x1"], "y": wl["y1"]},
            "end": {"x": wl["x2"], "y": wl["y2"]},
            "thickness_m": 0.25 if ie else 0.15,
            "type": "exterior" if ie else "interior",
            "confidence": wl["confidence"],
        })

    ta = sum(r["area_sqm"] for r in det_rooms)
    ac = (
        [o["confidence"] for o in wobj] +
        [r["confidence"] for r in det_rooms] +
        [d["confidence"] for d in det_doors] +
        [w_o["confidence"] for w_o in det_windows]
    )
    avg_c = sum(ac) / len(ac) if ac else 0

    spatial_model = {
        "version": "1.0.0",
        "metadata": {
            "building_name": "Uploaded Floor Plan",
            "building_type": building_type,
            "total_floors": 1,
            "total_area_sqm": round(ta, 2),
            "source": "cv-ai-pipeline" if ai_used else "cv-pipeline",
            "ai_enhanced": ai_used,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "coordinate_system": "cartesian",
            "unit": "meters",
            "bounding_box": {
                "min": {"x": 0, "y": 0},
                "max": {"x": bmxm, "y": bmym},
            },
            "average_confidence": round(avg_c, 3),
        },
        "floors": [{
            "id": "floor-0",
            "level": 0,
            "label": "Ground Floor",
            "elevation_m": 0,
            "height_m": settings.DEFAULT_WALL_HEIGHT_M,
            "walls": wobj,
            "rooms": det_rooms,
            "doors": det_doors,
            "windows": det_windows,
        }],
    }

    return spatial_model, ai_used


# ── Helpers ──

def _build_response(floor_data_list, building_type, prompt, plot_width, plot_length):
    """Build the standard generation response."""
    all_rooms = [r for f in floor_data_list for r in f.get("rooms", [])]
    total_area = sum(r.get("area_sqm", 0) for r in all_rooms)
    total_walls = sum(len(f.get("walls", [])) for f in floor_data_list)
    total_rooms = sum(len(f.get("rooms", [])) for f in floor_data_list)
    total_doors = sum(len(f.get("doors", [])) for f in floor_data_list)
    total_windows = sum(len(f.get("windows", [])) for f in floor_data_list)

    spatial_model = {
        "version": "1.0.0",
        "metadata": {
            "building_name": "Generated Building",
            "building_type": building_type,
            "total_floors": len(floor_data_list),
            "total_area_sqm": round(total_area, 2),
            "source": "ai-prompt-generator",
            "prompt": prompt,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "coordinate_system": "cartesian",
            "unit": "meters",
            "bounding_box": {
                "min": {"x": 0, "y": 0},
                "max": {"x": round(plot_width, 2), "y": round(plot_length, 2)},
            },
            "average_confidence": 1.0,
        },
        "floors": floor_data_list,
    }

    return {
        "status": "generated",
        "model_data": spatial_model,
        "stats": {
            "wall_count": total_walls,
            "room_count": total_rooms,
            "door_count": total_doors,
            "window_count": total_windows,
            "total_area_sqm": round(total_area, 2),
            "floor_count": len(floor_data_list),
            "plot_width_m": round(plot_width, 2),
            "plot_length_m": round(plot_length, 2),
        },
    }
