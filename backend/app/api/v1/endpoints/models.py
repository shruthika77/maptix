"""
Spatial model endpoints — retrieve and update the unified spatial model.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Project, SpatialModel
from app.core.auth import get_current_user

router = APIRouter()


async def _verify_project_ownership(
    project_id: str, current_user, db: AsyncSession
) -> "Project":
    """Verify the project exists and belongs to the current user."""
    query = select(Project).where(
        Project.id == project_id, Project.owner_id == current_user.id
    )
    project = (await db.execute(query)).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("")
async def get_spatial_model(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get the unified spatial model for a project."""
    await _verify_project_ownership(project_id, current_user, db)

    query = select(SpatialModel).where(SpatialModel.project_id == project_id)
    result = await db.execute(query)
    model = result.scalar_one_or_none()

    if not model:
        raise HTTPException(
            status_code=404,
            detail="No spatial model found. Process the project first."
        )

    return {
        "version": model.version,
        "model_data": model.model_data,
        "stats": {
            "wall_count": model.wall_count,
            "room_count": model.room_count,
            "door_count": model.door_count,
            "window_count": model.window_count,
            "total_area_sqm": model.total_area_sqm,
            "average_confidence": model.average_confidence,
            "floor_count": model.floor_count,
        },
        "has_3d_model": model.model_3d_path is not None,
        "updated_at": model.updated_at.isoformat() if model.updated_at else "",
    }


@router.put("")
async def update_spatial_model(
    project_id: str,
    updates: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update the spatial model (manual edits from the 2D editor)."""
    await _verify_project_ownership(project_id, current_user, db)

    query = select(SpatialModel).where(SpatialModel.project_id == project_id)
    result = await db.execute(query)
    model = result.scalar_one_or_none()

    if not model:
        raise HTTPException(status_code=404, detail="No spatial model found")

    model_data = model.model_data.copy()

    if "floors" in updates:
        for floor_update in updates["floors"]:
            level = floor_update.get("level")
            existing_floor = next(
                (f for f in model_data.get("floors", []) if f.get("level") == level),
                None
            )
            if existing_floor:
                existing_floor.update(floor_update)
            else:
                model_data.setdefault("floors", []).append(floor_update)

    model.model_data = model_data
    model.version += 1

    # Recalculate stats
    walls = rooms = doors = windows = 0
    total_area = 0.0
    for floor in model_data.get("floors", []):
        walls += len(floor.get("walls", []))
        rooms += len(floor.get("rooms", []))
        doors += len(floor.get("doors", []))
        windows += len(floor.get("windows", []))
        for room in floor.get("rooms", []):
            total_area += room.get("area_sqm", 0)

    model.wall_count = walls
    model.room_count = rooms
    model.door_count = doors
    model.window_count = windows
    model.total_area_sqm = total_area
    model.floor_count = len(model_data.get("floors", []))

    await db.flush()

    return {"status": "updated", "version": model.version}
