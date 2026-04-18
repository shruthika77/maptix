"""
File upload endpoints — stores files on local filesystem (no S3/MinIO).
"""

import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Project, ProjectFile
from app.core.auth import get_current_user
from app.core.storage import save_upload
from app.config import settings

router = APIRouter()


@router.post("", status_code=201)
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Upload an input file to a project."""
    # Verify project ownership
    query = select(Project).where(
        Project.id == project_id, Project.owner_id == current_user.id
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {settings.ALLOWED_EXTENSIONS}"
        )

    # Read content
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f}MB). Maximum: {settings.MAX_UPLOAD_SIZE_MB}MB"
        )

    # Generate stored filename
    file_id = str(uuid.uuid4())
    stored_filename = f"{file_id}{ext}"

    # Save to local filesystem
    storage_path = await save_upload(project_id, stored_filename, content)

    # Create database record
    project_file = ProjectFile(
        id=file_id,
        project_id=project_id,
        original_filename=file.filename,
        stored_filename=stored_filename,
        mime_type=file.content_type,
        size_bytes=len(content),
        storage_path=storage_path,
    )
    db.add(project_file)

    # Update project status if it's the first upload
    if project.status == "draft":
        project.status = "uploaded"

    await db.flush()

    return {
        "id": str(project_file.id),
        "filename": project_file.original_filename,
        "mime_type": file.content_type,
        "size_bytes": project_file.size_bytes,
        "status": "uploaded",
        "uploaded_at": project_file.uploaded_at.isoformat() if project_file.uploaded_at else "",
    }
