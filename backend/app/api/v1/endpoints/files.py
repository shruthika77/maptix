"""
File upload endpoints — stores files on local filesystem (no S3/MinIO).
Streams large files to disk to avoid loading them entirely into memory.
"""

import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Project, ProjectFile
from app.core.auth import get_current_user
from app.core.storage import get_upload_path
from app.config import settings

router = APIRouter()

# 256 KB chunk size for streaming uploads to disk
_UPLOAD_CHUNK_SIZE = 256 * 1024


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
    original_filename = file.filename or "upload"
    ext = Path(original_filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {settings.ALLOWED_EXTENSIONS}"
        )

    # Generate stored filename and path
    file_id = str(uuid.uuid4())
    stored_filename = f"{file_id}{ext}"
    storage_path = get_upload_path(project_id, stored_filename)

    # Stream file to disk in chunks (avoids loading entire file into memory)
    max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    total_bytes = 0

    try:
        with open(storage_path, "wb") as dest:
            while True:
                chunk = await file.read(_UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_size_bytes:
                    # Remove the partially written file
                    dest.close()
                    Path(storage_path).unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=400,
                        detail=f"File too large (>{settings.MAX_UPLOAD_SIZE_MB}MB). "
                               f"Maximum: {settings.MAX_UPLOAD_SIZE_MB}MB"
                    )
                dest.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        Path(storage_path).unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    # Create database record
    project_file = ProjectFile(
        id=file_id,
        project_id=project_id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        mime_type=file.content_type,
        size_bytes=total_bytes,
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
