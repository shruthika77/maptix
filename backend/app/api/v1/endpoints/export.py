"""
Export endpoints — download models in various formats.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.db.models import Project, SpatialModel
from app.core.auth import get_current_user

from app.services.export.svg_exporter import generate_svg

router = APIRouter()


@router.get("")
async def export_model(
    project_id: str,
    format: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Export the project model in the specified format."""
    # Verify project ownership
    project_q = select(Project).where(
        Project.id == project_id, Project.owner_id == current_user.id
    )
    project = (await db.execute(project_q)).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = select(SpatialModel).where(SpatialModel.project_id == project_id)
    result = await db.execute(query)
    model = result.scalar_one_or_none()

    if not model:
        raise HTTPException(status_code=404, detail="No model found to export")

    if format == "svg":
        svg_content = generate_svg(model.model_data)
        return StreamingResponse(
            iter([svg_content.encode()]),
            media_type="image/svg+xml",
            headers={"Content-Disposition": 'attachment; filename="floorplan.svg"'},
        )

    if format == "json":
        import json
        json_content = json.dumps(model.model_data, indent=2)
        return StreamingResponse(
            iter([json_content.encode()]),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="spatial-model.json"'},
        )

    raise HTTPException(
        status_code=400,
        detail=f"Export format '{format}' not supported. Available: svg, json"
    )
