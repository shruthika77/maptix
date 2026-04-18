"""
Local filesystem storage — no S3/MinIO needed!
Files stored in backend/data/uploads/
"""

import os
import shutil
from pathlib import Path
from app.config import settings


def get_upload_path(project_id: str, filename: str) -> str:
    """Get the full filesystem path for a project file upload."""
    upload_dir = Path(settings.UPLOAD_DIR) / project_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    return str(upload_dir / filename)


async def save_upload(project_id: str, filename: str, content: bytes) -> str:
    """Save uploaded file content to local filesystem."""
    filepath = get_upload_path(project_id, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath


async def read_file(filepath: str) -> bytes:
    """Read file from local filesystem."""
    with open(filepath, "rb") as f:
        return f.read()


async def delete_file(filepath: str):
    """Delete a file from local filesystem."""
    if os.path.exists(filepath):
        os.remove(filepath)


def get_model_path(project_id: str, filename: str) -> str:
    """Get path for storing generated 3D models."""
    model_dir = Path(settings.MODELS_DIR) / project_id
    model_dir.mkdir(parents=True, exist_ok=True)
    return str(model_dir / filename)
