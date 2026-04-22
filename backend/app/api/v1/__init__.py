"""
API v1 router — aggregates all route modules.

Includes a UUID validation dependency for all project_id path parameters.
"""

import re
from fastapi import APIRouter, Path, HTTPException

from app.api.v1.endpoints import auth, projects, files, processing, models, export, generate, demo_generate

_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)


def _validate_project_id(project_id: str = Path(...)) -> str:
    """Validate that project_id is a proper UUID format."""
    if not _UUID_PATTERN.match(project_id):
        raise HTTPException(status_code=422, detail="Invalid project_id format. Must be a UUID.")
    return project_id


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
