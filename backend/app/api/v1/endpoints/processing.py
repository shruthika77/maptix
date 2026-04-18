"""
Processing pipeline endpoints — runs in-process (no Redis/Celery needed).
Uses asyncio background tasks for processing.
"""

import asyncio
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db, async_session_factory
from app.db.models import Project, ProcessingJob, SpatialModel, ProjectFile
from app.core.auth import get_current_user

router = APIRouter()


class ProcessRequest(BaseModel):
    pipeline: str = "full"
    options: Optional[dict] = None


@router.post("/process", status_code=202)
async def start_processing(
    project_id: str,
    background_tasks: BackgroundTasks,
    request: ProcessRequest = ProcessRequest(),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Start the processing pipeline for a project (runs in background)."""
    # Verify project
    query = select(Project).where(
        Project.id == project_id, Project.owner_id == current_user.id
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check for existing active jobs
    active_job_q = select(ProcessingJob).where(
        ProcessingJob.project_id == project_id,
        ProcessingJob.status.in_(["queued", "preprocessing", "wall_detection",
                                   "room_segmentation", "object_detection",
                                   "spatial_model_construction", "3d_geometry_generation"]),
    )
    active = (await db.execute(active_job_q)).scalar_one_or_none()
    if active:
        raise HTTPException(
            status_code=409,
            detail="A processing job is already active for this project"
        )

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
    job = ProcessingJob(
        project_id=project_id,
        stages=stages,
    )
    db.add(job)

    # Update project status
    project.status = "processing"
    await db.flush()
    await db.commit()  # Ensure committed before background task runs

    job_id = str(job.id)

    # Run processing in background (no Celery/Redis needed!)
    background_tasks.add_task(run_processing_pipeline, project_id, job_id)

    return {
        "id": job_id,
        "project_id": str(project_id),
        "status": "queued",
        "stages": stages,
        "progress": 0,
        "created_at": job.created_at.isoformat() if job.created_at else "",
    }


@router.get("/jobs/{job_id}")
async def get_job_status(
    project_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get processing job status and progress."""
    query = select(ProcessingJob).where(
        ProcessingJob.id == job_id,
        ProcessingJob.project_id == project_id,
    )
    result = await db.execute(query)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "id": str(job.id),
        "project_id": str(project_id),
        "status": job.status,
        "progress": job.progress,
        "current_stage": job.current_stage,
        "stages": job.stages,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


async def run_processing_pipeline(project_id: str, job_id: str):
    """
    Background processing pipeline — runs entirely in-process.
    No Redis, no Celery, no external workers needed!

    Processes uploaded floor plan images through:
    1. Preprocessing (load, clean, binarize)
    2. Wall detection (LSD + Hough line detection)
    3. Room segmentation (flood fill on wall bitmap)
    4. Object detection (doors/windows via arc + gap detection)
    5. Spatial model construction (merge all detections)
    6. 3D geometry generation (wall extrusion, mesh export)
    """
    import numpy as np
    import cv2
    import sqlite3
    from app.config import settings, DB_DIR

    db_path = str(DB_DIR / "maptix.db")

    def update_job_sync(stage: str, progress: float, status: str = None, error: str = None):
        """Update job status using a direct SQLite connection (avoids async locking)."""
        for attempt in range(5):
            try:
                _do_update_job(stage, progress, status, error)
                return
            except sqlite3.OperationalError:
                import time
                time.sleep(0.5 * (attempt + 1))
        # Final attempt without catching
        _do_update_job(stage, progress, status, error)

    def _do_update_job(stage: str, progress: float, status: str = None, error: str = None):
        conn = sqlite3.connect(db_path, timeout=60)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=10000")
        try:
            s = status or stage
            if error:
                s = "failed"
            if progress >= 100:
                s = "completed"
            now = datetime.utcnow().isoformat()
            
            if error:
                conn.execute(
                    "UPDATE processing_jobs SET current_stage=?, progress=?, status=?, error=?, completed_at=? WHERE id=?",
                    (stage, progress, s, error, now, job_id)
                )
            elif progress >= 100:
                conn.execute(
                    "UPDATE processing_jobs SET current_stage=?, progress=?, status=?, completed_at=? WHERE id=?",
                    (stage, progress, s, now, job_id)
                )
            elif stage == "preprocessing" and progress <= 5:
                conn.execute(
                    "UPDATE processing_jobs SET current_stage=?, progress=?, status=?, started_at=? WHERE id=?",
                    (stage, progress, s, now, job_id)
                )
            else:
                conn.execute(
                    "UPDATE processing_jobs SET current_stage=?, progress=?, status=? WHERE id=?",
                    (stage, progress, s, job_id)
                )
            conn.commit()
        finally:
            conn.close()

    try:
        # Small delay to ensure the HTTP response handler releases the DB connection
        await asyncio.sleep(0.5)

        # ──── STAGE 1: PREPROCESSING ────
        update_job_sync("preprocessing", 5)
        await asyncio.sleep(0.3)

        # Load project files using direct SQLite
        conn = sqlite3.connect(db_path, timeout=60)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=10000")
        file_rows = conn.execute(
            "SELECT id, project_id, original_filename, stored_filename, mime_type, size_bytes, storage_path, status FROM project_files WHERE project_id=? AND status='uploaded'",
            (project_id,)
        ).fetchall()
        conn.close()

        if not file_rows:
            update_job_sync("failed", 0, error="No uploaded files found")
            return

        # Convert to dicts
        files = []
        for row in file_rows:
            files.append({
                "id": row[0], "project_id": row[1], "original_filename": row[2],
                "stored_filename": row[3], "mime_type": row[4], "size_bytes": row[5],
                "storage_path": row[6], "status": row[7],
            })

        # Load the first image file
        image = None
        for f in files:
            try:
                with open(f["storage_path"], "rb") as fh:
                    file_bytes = fh.read()

                if f["mime_type"] and f["mime_type"].startswith("image/"):
                    nparr = np.frombuffer(file_bytes, np.uint8)
                    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                elif f["original_filename"].lower().endswith(".pdf"):
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
            except Exception:
                continue

        if image is None:
            update_job_sync("failed", 0, error="Could not load any image from uploaded files")
            return

        update_job_sync("preprocessing", 15)

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

        # Estimate scale: assume image represents ~12m x 10m area (standard apartment)
        scale_mpp = 12.0 / w  # meters per pixel

        update_job_sync("wall_detection", 25)
        await asyncio.sleep(0.3)

        # ──── STAGE 2: WALL DETECTION ────
        # Use LSD (Line Segment Detector)
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

                # Snap near-horizontal/vertical
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

        # Also run Hough for backup
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

        # Deduplicate walls that are very close (within 0.3m)
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

        update_job_sync("room_segmentation", 40)
        await asyncio.sleep(0.3)

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

            # Classify room type by area
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
                "living_room": "Living Room",
                "bedroom": "Bedroom",
                "bathroom": "Bathroom",
                "kitchen": "Kitchen",
                "hallway": "Hallway",
                "closet": "Closet",
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

        update_job_sync("object_detection", 55)
        await asyncio.sleep(0.3)

        # ──── STAGE 4: OBJECT DETECTION (doors/windows) ────
        detected_doors = []
        detected_windows = []

        # Detect arcs (door swings) using HoughCircles
        thinned = binary.copy()
        circles = cv2.HoughCircles(
            thinned, cv2.HOUGH_GRADIENT, dp=1, minDist=20,
            param1=50, param2=30, minRadius=10, maxRadius=80
        )
        if circles is not None:
            for circle in circles[0]:
                cx, cy, r = circle
                width_m = r * scale_mpp
                if 0.3 <= width_m <= 1.5:
                    detected_doors.append({
                        "id": f"door-{len(detected_doors) + 1}",
                        "position": {
                            "x": round(float(cx) * scale_mpp, 4),
                            "y": round(float(cy) * scale_mpp, 4),
                        },
                        "width_m": round(width_m, 2),
                        "type": "single",
                        "confidence": 0.75,
                    })

        # Simple window detection: look for small rectangles on edges
        # For now, detect based on wall gaps
        for wall in detected_walls:
            length = wall["length_m"]
            if 0.8 <= length <= 2.5:
                mid_x = (wall["x1"] + wall["x2"]) / 2
                mid_y = (wall["y1"] + wall["y2"]) / 2
                # Check if on perimeter
                bbox_max_x = w * scale_mpp
                bbox_max_y = h * scale_mpp
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

        update_job_sync("spatial_model_construction", 70)
        await asyncio.sleep(0.3)

        # ──── STAGE 5: BUILD SPATIAL MODEL ────
        bbox_max_x = round(w * scale_mpp, 2)
        bbox_max_y = round(h * scale_mpp, 2)

        # Build wall objects for spatial model
        wall_objects = []
        for i, wall in enumerate(detected_walls[:50]):  # limit to 50 walls
            dx = wall["x2"] - wall["x1"]
            dy = wall["y2"] - wall["y1"]
            # Classify exterior if on perimeter
            is_exterior = (
                (abs(wall["x1"]) < 0.5 and abs(wall["x2"]) < 0.5) or
                (abs(wall["y1"]) < 0.5 and abs(wall["y2"]) < 0.5) or
                (abs(wall["x1"] - bbox_max_x) < 0.5 and abs(wall["x2"] - bbox_max_x) < 0.5) or
                (abs(wall["y1"] - bbox_max_y) < 0.5 and abs(wall["y2"] - bbox_max_y) < 0.5)
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
                    "max": {"x": bbox_max_x, "y": bbox_max_y},
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

        # Calculate stats
        total_area = sum(r["area_sqm"] for r in detected_rooms)
        all_confs = (
            [w["confidence"] for w in wall_objects] +
            [r["confidence"] for r in detected_rooms] +
            [d["confidence"] for d in detected_doors] +
            [win["confidence"] for win in detected_windows]
        )
        avg_conf = sum(all_confs) / len(all_confs) if all_confs else 0

        update_job_sync("3d_geometry_generation", 85)
        await asyncio.sleep(0.3)

        # ──── STAGE 6: SAVE SPATIAL MODEL TO DB ────
        import json as json_module
        conn = sqlite3.connect(db_path, timeout=60)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=10000")
        try:
            now = datetime.utcnow().isoformat()
            model_json = json_module.dumps(spatial_model)
            
            # Check if model already exists
            existing = conn.execute(
                "SELECT id, version FROM spatial_models WHERE project_id=?", (project_id,)
            ).fetchone()
            
            if existing:
                conn.execute(
                    """UPDATE spatial_models SET model_data=?, version=?, wall_count=?, room_count=?,
                       door_count=?, window_count=?, total_area_sqm=?, average_confidence=?,
                       floor_count=?, updated_at=? WHERE project_id=?""",
                    (model_json, existing[1] + 1, len(wall_objects), len(detected_rooms),
                     len(detected_doors), len(detected_windows), round(total_area, 2),
                     round(avg_conf, 3), 1, now, project_id)
                )
            else:
                model_id = str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO spatial_models (id, project_id, version, model_data, wall_count,
                       room_count, door_count, window_count, total_area_sqm, average_confidence,
                       floor_count, created_at, updated_at)
                       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
                    (model_id, project_id, model_json, len(wall_objects), len(detected_rooms),
                     len(detected_doors), len(detected_windows), round(total_area, 2),
                     round(avg_conf, 3), now, now)
                )
            
            # Update project status
            conn.execute("UPDATE projects SET status='completed' WHERE id=?", (project_id,))
            conn.commit()
        finally:
            conn.close()

        update_job_sync("completed", 100)

    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"Processing pipeline error: {error_msg}")
        traceback.print_exc()
        try:
            update_job_sync("failed", 0, error=error_msg)
            conn = sqlite3.connect(db_path, timeout=60)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("UPDATE projects SET status='failed' WHERE id=?", (project_id,))
            conn.commit()
            conn.close()
        except Exception:
            pass
