"""
API v1 router — aggregates all route modules.
"""

from fastapi import APIRouter
from app.api.v1.endpoints import auth, projects, files, processing, models, export, generate, demo_generate

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
router.include_router(projects.router, prefix="/projects", tags=["Projects"])
router.include_router(files.router, prefix="/projects/{project_id}/files", tags=["Files"])
router.include_router(processing.router, prefix="/projects/{project_id}", tags=["Processing"])
router.include_router(models.router, prefix="/projects/{project_id}/model", tags=["Model"])
router.include_router(export.router, prefix="/projects/{project_id}/export", tags=["Export"])
router.include_router(generate.router, prefix="/projects/{project_id}/generate", tags=["Generate"])
# Demo endpoints — no auth required
router.include_router(demo_generate.router, prefix="/demo/generate", tags=["Demo Generate"])
