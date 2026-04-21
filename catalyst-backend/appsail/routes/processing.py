"""
Processing pipeline endpoints — runs in-process on AppSail.
Uses threading for background processing (no Celery/Redis needed).

Pipeline:
1. Preprocessing (load, clean, binarize)
2. Wall detection (LSD + Hough)
3. Room segmentation (flood fill)
4. Object detection (doors/windows)
5. Spatial model construction
6. 3D geometry generation
"""

import uuid
import threading
import numpy as np
import cv2
import json as json_module
import logging
from datetime import datetime
from flask import Blueprint, jsonify, request
from catalyst_helper import (
    get_current_user_from_token,
    zcql_query,
    datastore_insert,
    datastore_update,
    download_file,
    serialize_json_field,
)
from config import settings

logger = logging.getLogger(__name__)

processing_bp = Blueprint("processing", __name__)


@processing_bp.route("/<project_id>/process", methods=["POST"])
def start_processing(project_id):
    """Start the processing pipeline for a project (runs in background thread)."""
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    # Verify project
    rows = zcql_query(
        f"SELECT ROWID, Status FROM {settings.TABLE_PROJECTS} "
        f"WHERE ProjectId = '{project_id}' AND OwnerId = '{user['user_id']}' LIMIT 1"
    )
    if not rows:
        return jsonify({"detail": "Project not found"}), 404

    project_row = rows[0].get(settings.TABLE_PROJECTS, rows[0])
    project_rowid = project_row.get("ROWID")

    # Check for existing active jobs
    active_rows = zcql_query(
        f"SELECT ROWID FROM {settings.TABLE_PROCESSING_JOBS} "
        f"WHERE ProjectId = '{project_id}' AND Status NOT IN ('completed', 'failed') LIMIT 1"
    )
    if active_rows:
        return jsonify({"detail": "A processing job is already active for this project"}), 409

    # Define stages
    stages = [
        {"name": "preprocessing", "status": "pending", "progress": 0},
        {"name": "wall_detection", "status": "pending", "progress": 0},
        {"name": "room_segmentation", "status": "pending", "progress": 0},
        {"name": "object_detection", "status": "pending", "progress": 0},
        {"name": "spatial_model_construction", "status": "pending", "progress": 0},
        {"name": "3d_geometry_generation", "status": "pending", "progress": 0},
    ]

    # Create job record
    job_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    job_result = datastore_insert(settings.TABLE_PROCESSING_JOBS, {
        "JobId": job_id,
        "ProjectId": project_id,
        "Status": "queued",
        "Progress": "0",
        "CurrentStage": "",
        "Stages": serialize_json_field(stages),
        "Error": "",
        "CreatedAt": now,
        "StartedAt": "",
        "CompletedAt": "",
    })
    job_rowid = str(job_result.get("ROWID", ""))

    # Update project status
    datastore_update(settings.TABLE_PROJECTS, {
        "ROWID": project_rowid,
        "Status": "processing",
        "UpdatedAt": now,
    })

    # Run processing in background thread
    thread = threading.Thread(
        target=_run_processing_pipeline,
        args=(project_id, job_id, job_rowid, str(project_rowid)),
        daemon=True,
    )
    thread.start()

    return jsonify({
        "id": job_id,
        "project_id": project_id,
        "status": "queued",
        "stages": stages,
        "progress": 0,
        "created_at": now,
    }), 202


@processing_bp.route("/<project_id>/jobs/<job_id>", methods=["GET"])
def get_job_status(project_id, job_id):
    """Get processing job status and progress."""
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    rows = zcql_query(
        f"SELECT ROWID, JobId, ProjectId, Status, Progress, CurrentStage, Stages, Error, "
        f"CreatedAt, StartedAt, CompletedAt FROM {settings.TABLE_PROCESSING_JOBS} "
        f"WHERE JobId = '{job_id}' AND ProjectId = '{project_id}' LIMIT 1"
    )
    if not rows:
        return jsonify({"detail": "Job not found"}), 404

    j = rows[0].get(settings.TABLE_PROCESSING_JOBS, rows[0])

    stages = []
    try:
        stages = json_module.loads(j.get("Stages", "[]"))
    except (json_module.JSONDecodeError, TypeError):
        pass

    return jsonify({
        "id": j.get("JobId", ""),
        "project_id": project_id,
        "status": j.get("Status", ""),
        "progress": float(j.get("Progress", 0)),
        "current_stage": j.get("CurrentStage", ""),
        "stages": stages,
        "error": j.get("Error", "") or None,
        "created_at": j.get("CreatedAt") or None,
        "started_at": j.get("StartedAt") or None,
        "completed_at": j.get("CompletedAt") or None,
    })


# ═══════════════════════════════════════════════════════════
#  BACKGROUND PROCESSING PIPELINE
# ═══════════════════════════════════════════════════════════

def _run_processing_pipeline(project_id: str, job_id: str, job_rowid: str, project_rowid: str):
    """
    Background processing pipeline — runs entirely in-process on AppSail.
    Uses Catalyst Data Store for status updates and File Store for file access.

    NOTE: This runs in a background thread, so we use direct REST/SDK calls
    (not Flask request context). We import zcatalyst_sdk directly.
    """
    import zcatalyst_sdk
    import time

    def _get_app():
        """Get Catalyst app for background thread (no Flask request context)."""
        return zcatalyst_sdk.initialize()

    def _update_job(stage: str, progress: float, status: str = None, error: str = None):
        """Update job status in Data Store."""
        for attempt in range(3):
            try:
                app = _get_app()
                table = app.datastore().table(settings.TABLE_PROCESSING_JOBS)
                now = datetime.utcnow().isoformat()

                update_data = {
                    "ROWID": job_rowid,
                    "CurrentStage": stage,
                    "Progress": str(progress),
                }

                s = status or stage
                if error:
                    s = "failed"
                    update_data["Error"] = error
                    update_data["CompletedAt"] = now
                if progress >= 100:
                    s = "completed"
                    update_data["CompletedAt"] = now
                if stage == "preprocessing" and progress <= 5:
                    update_data["StartedAt"] = now

                update_data["Status"] = s
                table.update_row(update_data)
                return
            except Exception as e:
                logger.warning(f"Job update attempt {attempt+1} failed: {e}")
                time.sleep(1)

    try:
        time.sleep(0.5)

        # ──── STAGE 1: PREPROCESSING ────
        _update_job("preprocessing", 5)

        # Load project files from Data Store
        app = _get_app()
        zcql_svc = app.zcql()
        file_rows = zcql_svc.execute_query(
            f"SELECT FileId, CatalystFileId, CatalystFolderId, OriginalFilename, MimeType "
            f"FROM {settings.TABLE_PROJECT_FILES} "
            f"WHERE ProjectId = '{project_id}' AND Status = 'uploaded'"
        )

        if not file_rows:
            _update_job("failed", 0, error="No uploaded files found")
            return

        # Download and decode the first image file
        image = None
        for fr in file_rows:
            f = fr.get(settings.TABLE_PROJECT_FILES, fr)
            try:
                catalyst_file_id = f.get("CatalystFileId")
                catalyst_folder_id = f.get("CatalystFolderId")
                mime_type = f.get("MimeType", "")
                filename = f.get("OriginalFilename", "")

                # Download from Catalyst File Store
                file_store = app.filestore()
                folder = file_store.folder(int(catalyst_folder_id))
                file_bytes = folder.download_file(int(catalyst_file_id))

                if mime_type and mime_type.startswith("image/"):
                    nparr = np.frombuffer(file_bytes, np.uint8)
                    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                elif filename.lower().endswith(".pdf"):
                    try:
                        import fitz
                        doc = fitz.open(stream=file_bytes, filetype="pdf")
                        page = doc[0]
                        pix = page.get_pixmap(dpi=200)
                        img_data = pix.tobytes("png")
                        nparr = np.frombuffer(img_data, np.uint8)
                        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        doc.close()
                    except ImportError:
                        pass

                if image is not None:
                    break
            except Exception as e:
                logger.warning(f"Failed to load file: {e}")
                continue

        if image is None:
            _update_job("failed", 0, error="Could not load any image from uploaded files")
            return

        _update_job("preprocessing", 15)

        # Resize if too large
        h, w = image.shape[:2]
        max_dim = 2000
        if max(h, w) > max_dim:
            scale_factor = max_dim / max(h, w)
            image = cv2.resize(image, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_AREA)
            h, w = image.shape[:2]

        # Grayscale + binary
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, blockSize=15, C=10
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

        scale_mpp = 12.0 / w  # meters per pixel

        _update_job("wall_detection", 25)
        time.sleep(0.3)

        # ──── STAGE 2: WALL DETECTION ────
        lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
        lsd_lines, widths, precs, nfas = lsd.detect(binary)

        detected_walls = []
        min_wall_length_px = 30

        if lsd_lines is not None:
            for i, line in enumerate(lsd_lines):
                x1, y1, x2, y2 = line[0]
                length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                if length < min_wall_length_px:
                    continue
                angle = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
                if angle < 3 or angle > 177:
                    avg_y = (y1 + y2) / 2
                    y1 = y2 = avg_y
                elif abs(angle - 90) < 3:
                    avg_x = (x1 + x2) / 2
                    x1 = x2 = avg_x
                conf = float(precs[i][0]) if precs is not None else 0.7
                detected_walls.append({
                    "x1": round(float(x1) * scale_mpp, 4),
                    "y1": round(float(y1) * scale_mpp, 4),
                    "x2": round(float(x2) * scale_mpp, 4),
                    "y2": round(float(y2) * scale_mpp, 4),
                    "confidence": round(conf, 3),
                    "length_m": round(length * scale_mpp, 4),
                })

        # Hough backup
        edges = cv2.Canny(binary, 50, 150, apertureSize=3)
        hough_lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 50,
                                       minLineLength=min_wall_length_px, maxLineGap=15)
        if hough_lines is not None:
            for line in hough_lines:
                x1, y1, x2, y2 = line[0]
                length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                if length < min_wall_length_px:
                    continue
                detected_walls.append({
                    "x1": round(float(x1) * scale_mpp, 4),
                    "y1": round(float(y1) * scale_mpp, 4),
                    "x2": round(float(x2) * scale_mpp, 4),
                    "y2": round(float(y2) * scale_mpp, 4),
                    "confidence": round(min(length / 200.0, 1.0), 3),
                    "length_m": round(length * scale_mpp, 4),
                })

        # Deduplicate
        merged_walls = []
        used = set()
        for i, w1 in enumerate(detected_walls):
            if i in used:
                continue
            best = w1
            for j, w2 in enumerate(detected_walls):
                if j <= i or j in used:
                    continue
                mid1 = ((w1["x1"] + w1["x2"]) / 2, (w1["y1"] + w1["y2"]) / 2)
                mid2 = ((w2["x1"] + w2["x2"]) / 2, (w2["y1"] + w2["y2"]) / 2)
                dist = np.sqrt((mid1[0] - mid2[0]) ** 2 + (mid1[1] - mid2[1]) ** 2)
                if dist < 0.3:
                    used.add(j)
                    if w2["length_m"] > best["length_m"]:
                        best = w2
            merged_walls.append(best)
            used.add(i)
        detected_walls = merged_walls

        _update_job("room_segmentation", 40)
        time.sleep(0.3)

        # ──── STAGE 3: ROOM SEGMENTATION ────
        wall_mask = binary.copy()
        kernel_dilate = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        wall_mask = cv2.dilate(wall_mask, kernel_dilate, iterations=2)
        room_mask = cv2.bitwise_not(wall_mask)

        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(room_mask, connectivity=4)

        detected_rooms = []
        min_room_area_px = 500
        max_room_area_px = (h * w) * 0.6

        for label_idx in range(1, num_labels):
            area_px = stats[label_idx, cv2.CC_STAT_AREA]
            if area_px < min_room_area_px or area_px > max_room_area_px:
                continue

            component_mask = (labels == label_idx).astype(np.uint8) * 255
            contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue

            contour = max(contours, key=cv2.contourArea)
            epsilon = 0.02 * cv2.arcLength(contour, True)
            simplified = cv2.approxPolyDP(contour, epsilon, True)
            if len(simplified) < 3:
                continue

            vertices = []
            for point in simplified:
                px, py = point[0]
                vertices.append({
                    "x": round(float(px) * scale_mpp, 4),
                    "y": round(float(py) * scale_mpp, 4),
                })

            area_sqm = area_px * (scale_mpp ** 2)
            cx = sum(v["x"] for v in vertices) / len(vertices)
            cy = sum(v["y"] for v in vertices) / len(vertices)

            if area_sqm < 4:
                room_type = "closet"
            elif area_sqm < 8:
                room_type = "bathroom"
            elif area_sqm < 15:
                room_type = "bedroom"
            elif area_sqm < 25:
                room_type = "living_room"
            else:
                room_type = "living_room"

            room_labels = {
                "living_room": "Living Room", "bedroom": "Bedroom",
                "bathroom": "Bathroom", "kitchen": "Kitchen",
                "hallway": "Hallway", "closet": "Closet",
            }

            detected_rooms.append({
                "id": f"room-{label_idx}",
                "polygon": {"vertices": vertices},
                "area_sqm": round(area_sqm, 2),
                "type": room_type,
                "label": room_labels.get(room_type, f"Room {len(detected_rooms) + 1}"),
                "confidence": round(0.7 + (area_sqm / 200), 3),
                "centroid": {"x": round(cx, 4), "y": round(cy, 4)},
            })

        _update_job("object_detection", 55)
        time.sleep(0.3)

        # ──── STAGE 4: OBJECT DETECTION ────
        detected_doors = []
        detected_windows = []

        circles = cv2.HoughCircles(
            binary, cv2.HOUGH_GRADIENT, dp=1, minDist=20,
            param1=50, param2=30, minRadius=10, maxRadius=80
        )
        if circles is not None:
            for circle in circles[0]:
                cx_c, cy_c, r = circle
                width_m = r * scale_mpp
                if 0.3 <= width_m <= 1.5:
                    detected_doors.append({
                        "id": f"door-{len(detected_doors) + 1}",
                        "position": {
                            "x": round(float(cx_c) * scale_mpp, 4),
                            "y": round(float(cy_c) * scale_mpp, 4),
                        },
                        "width_m": round(width_m, 2),
                        "type": "single",
                        "confidence": 0.75,
                    })

        bbox_max_x = w * scale_mpp
        bbox_max_y = h * scale_mpp
        for wall in detected_walls:
            length = wall["length_m"]
            if 0.8 <= length <= 2.5:
                mid_x = (wall["x1"] + wall["x2"]) / 2
                mid_y = (wall["y1"] + wall["y2"]) / 2
                on_perimeter = (
                    mid_x < 0.5 or mid_x > bbox_max_x - 0.5 or
                    mid_y < 0.5 or mid_y > bbox_max_y - 0.5
                )
                if on_perimeter and len(detected_windows) < 10:
                    detected_windows.append({
                        "id": f"win-{len(detected_windows) + 1}",
                        "position": {"x": round(mid_x, 4), "y": round(mid_y, 4)},
                        "width_m": round(min(length, 1.5), 2),
                        "type": "casement",
                        "wall_id": None,
                        "confidence": 0.65,
                    })

        _update_job("spatial_model_construction", 70)
        time.sleep(0.3)

        # ──── STAGE 5: BUILD SPATIAL MODEL ────
        bmx = round(w * scale_mpp, 2)
        bmy = round(h * scale_mpp, 2)

        wall_objects = []
        for i, wall in enumerate(detected_walls[:50]):
            is_exterior = (
                (abs(wall["x1"]) < 0.5 and abs(wall["x2"]) < 0.5) or
                (abs(wall["y1"]) < 0.5 and abs(wall["y2"]) < 0.5) or
                (abs(wall["x1"] - bmx) < 0.5 and abs(wall["x2"] - bmx) < 0.5) or
                (abs(wall["y1"] - bmy) < 0.5 and abs(wall["y2"] - bmy) < 0.5)
            )
            wall_objects.append({
                "id": f"w{i + 1}",
                "start": {"x": wall["x1"], "y": wall["y1"]},
                "end": {"x": wall["x2"], "y": wall["y2"]},
                "thickness_m": 0.3 if is_exterior else 0.15,
                "type": "exterior" if is_exterior else "interior",
                "confidence": wall["confidence"],
            })

        spatial_model = {
            "version": "1.0.0",
            "metadata": {
                "source": "maptix-pipeline",
                "created_at": datetime.utcnow().isoformat(),
                "coordinate_system": "cartesian",
                "unit": "meters",
                "bounding_box": {
                    "min": {"x": 0, "y": 0},
                    "max": {"x": bmx, "y": bmy},
                },
            },
            "floors": [{
                "id": "floor-0",
                "level": 0,
                "label": "Ground Floor",
                "elevation_m": 0,
                "height_m": settings.DEFAULT_WALL_HEIGHT_M,
                "walls": wall_objects,
                "rooms": detected_rooms,
                "doors": detected_doors,
                "windows": detected_windows,
            }],
        }

        total_area = sum(r["area_sqm"] for r in detected_rooms)
        all_confs = (
            [w_o["confidence"] for w_o in wall_objects] +
            [r["confidence"] for r in detected_rooms] +
            [d["confidence"] for d in detected_doors] +
            [win["confidence"] for win in detected_windows]
        )
        avg_conf = sum(all_confs) / len(all_confs) if all_confs else 0

        _update_job("3d_geometry_generation", 85)
        time.sleep(0.3)

        # ──── STAGE 6: SAVE SPATIAL MODEL TO DATA STORE ────
        now = datetime.utcnow().isoformat()
        model_json = json_module.dumps(spatial_model)

        app = _get_app()
        zcql_svc = app.zcql()

        # Check if model already exists
        existing = zcql_svc.execute_query(
            f"SELECT ROWID, Version FROM {settings.TABLE_SPATIAL_MODELS} "
            f"WHERE ProjectId = '{project_id}' LIMIT 1"
        )

        if existing:
            ex = existing[0].get(settings.TABLE_SPATIAL_MODELS, existing[0])
            ex_rowid = ex.get("ROWID")
            version = int(ex.get("Version", 1)) + 1
            table = app.datastore().table(settings.TABLE_SPATIAL_MODELS)
            table.update_row({
                "ROWID": ex_rowid,
                "Version": str(version),
                "ModelData": model_json,
                "WallCount": str(len(wall_objects)),
                "RoomCount": str(len(detected_rooms)),
                "DoorCount": str(len(detected_doors)),
                "WindowCount": str(len(detected_windows)),
                "TotalAreaSqm": str(round(total_area, 2)),
                "AverageConfidence": str(round(avg_conf, 3)),
                "FloorCount": "1",
                "UpdatedAt": now,
            })
        else:
            model_id = str(uuid.uuid4())
            table = app.datastore().table(settings.TABLE_SPATIAL_MODELS)
            table.insert_row({
                "ModelId": model_id,
                "ProjectId": project_id,
                "Version": "1",
                "ModelData": model_json,
                "WallCount": str(len(wall_objects)),
                "RoomCount": str(len(detected_rooms)),
                "DoorCount": str(len(detected_doors)),
                "WindowCount": str(len(detected_windows)),
                "TotalAreaSqm": str(round(total_area, 2)),
                "AverageConfidence": str(round(avg_conf, 3)),
                "FloorCount": "1",
                "Model3dPath": "",
                "CreatedAt": now,
                "UpdatedAt": now,
            })

        # Update project status
        proj_table = app.datastore().table(settings.TABLE_PROJECTS)
        proj_table.update_row({
            "ROWID": project_rowid,
            "Status": "completed",
            "UpdatedAt": now,
        })

        _update_job("completed", 100)

    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(f"Processing pipeline error: {error_msg}")
        traceback.print_exc()
        try:
            _update_job("failed", 0, error=error_msg)
            app = _get_app()
            proj_table = app.datastore().table(settings.TABLE_PROJECTS)
            proj_table.update_row({
                "ROWID": project_rowid,
                "Status": "failed",
                "UpdatedAt": datetime.utcnow().isoformat(),
            })
        except Exception:
            pass
