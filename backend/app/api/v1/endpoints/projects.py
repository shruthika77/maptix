"""
Project CRUD endpoints.
"""

import logging
import shutil
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models import Project
from app.core.auth import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    building_type: str = "residential"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    building_type: Optional[str] = None


@router.get("")
async def list_projects(
    limit: int = Query(default=50, ge=1, le=200, description="Max projects to return"),
    offset: int = Query(default=0, ge=0, description="Number of projects to skip"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all projects for the current user (paginated)."""
    # Get total count
    count_q = select(func.count()).select_from(Project).where(
        Project.owner_id == current_user.id
    )
    total = (await db.execute(count_q)).scalar()

    query = (
        select(Project)
        .where(Project.owner_id == current_user.id)
        .options(selectinload(Project.files), selectinload(Project.spatial_model))
        .order_by(Project.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    projects = result.scalars().all()

    return {
        "projects": [
            {
                "id": str(p.id),
                "name": p.name,
                "description": p.description,
                "building_type": p.building_type,
                "status": p.status,
                "has_spatial_model": p.spatial_model is not None,
                "has_3d_model": (
                    p.spatial_model is not None
                    and p.spatial_model.model_3d_path is not None
                ),
                "file_count": len(p.files),
                "spatial_model_stats": (
                    {
                        "wall_count": p.spatial_model.wall_count,
                        "room_count": p.spatial_model.room_count,
                        "door_count": p.spatial_model.door_count,
                        "window_count": p.spatial_model.window_count,
                        "total_area_sqm": p.spatial_model.total_area_sqm or 0,
                        "average_confidence": p.spatial_model.average_confidence or 0,
                    }
                    if p.spatial_model
                    else {
                        "wall_count": 0, "room_count": 0, "door_count": 0,
                        "window_count": 0, "total_area_sqm": 0, "average_confidence": 0,
                    }
                ),
                "created_at": p.created_at.isoformat() if p.created_at else "",
                "updated_at": p.updated_at.isoformat() if p.updated_at else "",
            }
            for p in projects
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", status_code=201)
async def create_project(
    request: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new project."""
    project = Project(
        owner_id=current_user.id,
        name=request.name,
        description=request.description,
        building_type=request.building_type,
    )
    db.add(project)
    await db.flush()

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "building_type": project.building_type,
        "status": project.status,
        "created_at": project.created_at.isoformat() if project.created_at else "",
    }


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get project details."""
    query = (
        select(Project)
        .where(Project.id == project_id, Project.owner_id == current_user.id)
        .options(
            selectinload(Project.files),
            selectinload(Project.spatial_model),
            selectinload(Project.jobs),
        )
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "building_type": project.building_type,
        "status": project.status,
        "files": [
            {
                "id": str(f.id),
                "filename": f.original_filename,
                "mime_type": f.mime_type,
                "size_bytes": f.size_bytes,
                "status": f.status,
                "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else "",
            }
            for f in project.files
        ],
        "has_spatial_model": project.spatial_model is not None,
        "spatial_model_stats": (
            {
                "wall_count": project.spatial_model.wall_count,
                "room_count": project.spatial_model.room_count,
                "door_count": project.spatial_model.door_count,
                "window_count": project.spatial_model.window_count,
                "total_area_sqm": project.spatial_model.total_area_sqm or 0,
                "average_confidence": project.spatial_model.average_confidence or 0,
            }
            if project.spatial_model
            else None
        ),
        "has_3d_model": (
            project.spatial_model is not None
            and project.spatial_model.model_3d_path is not None
        ),
        "latest_job": (
            {
                "id": str(project.jobs[-1].id),
                "status": project.jobs[-1].status,
                "progress": project.jobs[-1].progress,
                "current_stage": project.jobs[-1].current_stage,
            }
            if project.jobs
            else None
        ),
        "created_at": project.created_at.isoformat() if project.created_at else "",
        "updated_at": project.updated_at.isoformat() if project.updated_at else "",
    }


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a project and all associated data (DB records + files on disk)."""
    query = select(Project).where(
        Project.id == project_id, Project.owner_id == current_user.id
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete the DB records (cascade handles files, jobs, spatial_model)
    await db.delete(project)
    await db.commit()

    # Clean up uploaded files and model files from disk
    upload_dir = Path(settings.UPLOAD_DIR) / project_id
    model_dir = Path(settings.MODELS_DIR) / project_id

    for dir_path in (upload_dir, model_dir):
        if dir_path.exists():
            try:
                shutil.rmtree(dir_path)
                logger.info(f"Deleted project directory: {dir_path}")
            except OSError as e:
                logger.warning(f"Failed to delete directory {dir_path}: {e}")
