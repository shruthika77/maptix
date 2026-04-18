"""
Application configuration loaded from environment variables.
All defaults use FREE, zero-config options (SQLite + local filesystem).
No external services needed!
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List


# Project paths
BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
MODELS_DIR = DATA_DIR / "models"
DB_DIR = DATA_DIR / "db"

# Ensure directories exist
for d in [DATA_DIR, UPLOADS_DIR, MODELS_DIR, DB_DIR]:
    d.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    """Application settings — all FREE, no paid services required."""

    # ── Application ──
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    APP_NAME: str = "Maptix 3D"

    # ── Database (SQLite — zero config, no install needed) ──
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_DIR / 'maptix.db'}"

    # ── File Storage (local filesystem — no S3/MinIO needed) ──
    UPLOAD_DIR: str = str(UPLOADS_DIR)
    MODELS_DIR: str = str(MODELS_DIR)

    # ── Authentication (JWT — no external auth service needed) ──
    JWT_SECRET: str = "maptix-dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 72

    # ── CORS ──
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://0.0.0.0:3000",
    ]

    # ── File Upload ──
    MAX_UPLOAD_SIZE_MB: int = 100
    ALLOWED_EXTENSIONS: List[str] = [
        ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp",
        ".pdf",
        ".dxf", ".dwg",
        ".json", ".geojson",
    ]

    # ── Processing Defaults ──
    DEFAULT_WALL_HEIGHT_M: float = 2.7
    DEFAULT_WALL_THICKNESS_M: float = 0.15
    DEFAULT_DOOR_WIDTH_M: float = 0.9
    DEFAULT_DOOR_HEIGHT_M: float = 2.1
    DEFAULT_WINDOW_WIDTH_M: float = 1.2
    DEFAULT_WINDOW_HEIGHT_M: float = 1.2
    DEFAULT_WINDOW_SILL_M: float = 0.9

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
