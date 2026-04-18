"""
Pipeline Orchestrator — coordinates the entire processing flow from input to output.

This is the brain of the processing system. It:
1. Loads project files from storage
2. Classifies and routes each input to the appropriate processor
3. Runs spatial analysis (wall detection, room segmentation, etc.)
4. Fuses data from multiple sources
5. Builds the Unified Spatial Model
6. Generates the 3D model
7. Reports progress at each stage
"""

import uuid
import traceback
from datetime import datetime
from typing import Dict, List, Optional
import structlog

from app.services.pipeline.stages.preprocessor import Preprocessor
from app.services.pipeline.stages.wall_detector import WallDetector
from app.services.pipeline.stages.room_segmenter import RoomSegmenter
from app.services.pipeline.stages.object_detector import ObjectDetector
from app.services.pipeline.stages.spatial_model_builder import SpatialModelBuilder
from app.services.pipeline.stages.three_d_generator import ThreeDGenerator

logger = structlog.get_logger()


class PipelineOrchestrator:
    """
    Orchestrates the complete processing pipeline.
    
    Pipeline stages and their responsibilities:
    
    1. PREPROCESSING
       - Download files from storage
       - Classify input type (floor plan / photo / PDF / etc.)
       - Apply format-specific preprocessing (deskew, denoise, etc.)
       - Extract raw features (lines, text, symbols)
    
    2. WALL DETECTION
       - Detect wall segments from preprocessed data
       - Merge collinear segments
       - Detect junctions (corners, T-joints, X-joints)
       - Build wall graph
    
    3. ROOM SEGMENTATION
       - Identify enclosed regions (rooms)
       - Compute room polygons
       - Classify room types
       - Calculate room areas
    
    4. OBJECT DETECTION
       - Detect doors (arcs in floor plans, objects in photos)
       - Detect windows (symbols in floor plans, objects in photos)
       - Detect other elements (stairs, columns, fixtures)
       - Associate objects with walls and rooms
    
    5. SPATIAL MODEL CONSTRUCTION
       - Fuse data from all sources
       - Resolve conflicts
       - Apply scale and dimensions
       - Build the Unified Spatial Model (JSON)
    
    6. 3D GEOMETRY GENERATION
       - Extrude walls to 3D
       - Cut door/window openings
       - Generate floor/ceiling meshes
       - Apply materials
    
    7. MESH OPTIMIZATION
       - Generate LOD levels
       - Apply Draco compression
       - Pack texture atlases
    
    8. EXPORT
       - Export to glTF/GLB
       - Generate 2D SVG floor plan
       - Store results in object storage
    """

    def __init__(
        self,
        project_id: str,
        job_id: str,
        pipeline: str,
        options: dict,
        celery_task=None,
    ):
        self.project_id = project_id
        self.job_id = job_id
        self.pipeline = pipeline
        self.options = options
        self.celery_task = celery_task

        # Pipeline stages
        self.preprocessor = Preprocessor()
        self.wall_detector = WallDetector(options)
        self.room_segmenter = RoomSegmenter(options)
        self.object_detector = ObjectDetector(options)
        self.spatial_model_builder = SpatialModelBuilder(options)
        self.three_d_generator = ThreeDGenerator(options)

    def run(self) -> dict:
        """Execute the full processing pipeline."""
        logger.info(
            "Starting pipeline",
            project_id=self.project_id,
            job_id=self.job_id,
            pipeline=self.pipeline,
        )

        try:
            self._update_job_status("preprocessing", 0)

            # Stage 1: Preprocessing
            preprocessed = self.preprocessor.process(self.project_id)
            self._update_job_status("wall_detection", 15)

            if self.pipeline in ("full", "detection_only"):
                # Stage 2: Wall Detection
                walls = self.wall_detector.detect(preprocessed)
                self._update_job_status("room_segmentation", 30)

                # Stage 3: Room Segmentation
                rooms = self.room_segmenter.segment(preprocessed, walls)
                self._update_job_status("object_detection", 45)

                # Stage 4: Object Detection
                objects = self.object_detector.detect(preprocessed, walls)
                self._update_job_status("spatial_model_construction", 60)

                # Stage 5: Build Unified Spatial Model
                spatial_model = self.spatial_model_builder.build(
                    walls=walls,
                    rooms=rooms,
                    objects=objects,
                    preprocessed=preprocessed,
                )
                self._save_spatial_model(spatial_model)
                self._update_job_status("3d_geometry_generation", 70)
            else:
                # Load existing spatial model for 3d_only pipeline
                spatial_model = self._load_spatial_model()

            if self.pipeline in ("full", "3d_only"):
                # Stage 6-8: 3D Generation
                result_3d = self.three_d_generator.generate(spatial_model)
                self._update_job_status("mesh_optimization", 85)

                # Save 3D model to storage
                self._save_3d_model(result_3d)
                self._update_job_status("export", 95)

            # Complete
            result = self._build_result(spatial_model)
            self._update_job_status("completed", 100, result=result)

            logger.info(
                "Pipeline completed successfully",
                project_id=self.project_id,
                job_id=self.job_id,
            )
            return result

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            logger.error(
                "Pipeline failed",
                project_id=self.project_id,
                job_id=self.job_id,
                error=error_msg,
                traceback=traceback.format_exc(),
            )
            self._update_job_status("failed", error=error_msg)
            raise

    def _update_job_status(
        self,
        stage: str,
        progress: float = None,
        result: dict = None,
        error: str = None,
    ):
        """Update job status in database (synchronous, from worker)."""
        from app.db.session import engine
        from sqlalchemy import update, text
        from sqlalchemy.orm import Session
        from sqlalchemy import create_engine
        from app.config import settings

        # Use synchronous engine for Celery worker
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        sync_engine = create_engine(sync_url)

        with sync_engine.begin() as conn:
            values = {"current_stage": stage}
            if progress is not None:
                values["progress"] = progress
            if result is not None:
                values["result"] = result
                values["status"] = "completed"
                values["completed_at"] = datetime.utcnow()
            elif error is not None:
                values["error"] = error
                values["status"] = "failed"
                values["completed_at"] = datetime.utcnow()
            elif stage != "completed":
                values["status"] = stage

            conn.execute(
                text(
                    "UPDATE processing_jobs SET "
                    + ", ".join(f"{k} = :{k}" for k in values.keys())
                    + " WHERE id = :job_id"
                ),
                {**values, "job_id": self.job_id},
            )

        # Also update Celery task state for polling
        if self.celery_task and progress is not None:
            self.celery_task.update_state(
                state="PROGRESS",
                meta={"progress": progress, "stage": stage},
            )

    def _save_spatial_model(self, spatial_model: dict):
        """Save the unified spatial model to database."""
        # Implementation: upsert SpatialModel record
        logger.info("Saving spatial model", project_id=self.project_id)
        pass  # TODO: Implement with sync SQLAlchemy

    def _load_spatial_model(self) -> dict:
        """Load existing spatial model from database."""
        logger.info("Loading spatial model", project_id=self.project_id)
        return {}  # TODO: Implement

    def _save_3d_model(self, result_3d: dict):
        """Save 3D model files to object storage."""
        logger.info("Saving 3D model", project_id=self.project_id)
        pass  # TODO: Upload glTF to MinIO

    def _build_result(self, spatial_model: dict) -> dict:
        """Build the final result summary."""
        floors = spatial_model.get("floors", [])
        total_walls = sum(len(f.get("walls", [])) for f in floors)
        total_rooms = sum(len(f.get("rooms", [])) for f in floors)
        total_doors = sum(len(f.get("doors", [])) for f in floors)
        total_windows = sum(len(f.get("windows", [])) for f in floors)
        total_area = sum(
            r.get("area_sqm", 0)
            for f in floors
            for r in f.get("rooms", [])
        )

        return {
            "walls_detected": total_walls,
            "rooms_detected": total_rooms,
            "doors_detected": total_doors,
            "windows_detected": total_windows,
            "total_area_sqm": round(total_area, 2),
            "floor_count": len(floors),
        }
