"""
Application configuration loaded from environment variables.
Supports both JWT (local dev) and Zoho Catalyst Authentication.
"""

import os
import secrets
import warnings
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
    """Application settings."""

    # -- Application --
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    APP_NAME: str = "Maptix 3D"

    # -- Database (SQLite) --
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_DIR / 'maptix.db'}"

    # -- File Storage (local filesystem) --
    UPLOAD_DIR: str = str(UPLOADS_DIR)
    MODELS_DIR: str = str(MODELS_DIR)

    # -- Authentication Provider --
    # "jwt"      -> local bcrypt + JWT tokens (default, no external deps)
    # "catalyst" -> Zoho Catalyst REST API (requires CATALYST_PROJECT_ID)
    AUTH_PROVIDER: str = os.environ.get("AUTH_PROVIDER", "jwt")

    # -- Catalyst Authentication Settings --
    # Required when AUTH_PROVIDER=catalyst
    CATALYST_PROJECT_ID: str = os.environ.get("CATALYST_PROJECT_ID", "")
    CATALYST_PROJECT_KEY: str = os.environ.get("CATALYST_PROJECT_KEY", "")
    CATALYST_PROJECT_DOMAIN: str = os.environ.get("CATALYST_PROJECT_DOMAIN", "")
    CATALYST_ENVIRONMENT: str = os.environ.get("CATALYST_ENVIRONMENT", "Development")

    # -- JWT Settings (used when AUTH_PROVIDER=jwt) --
    JWT_SECRET: str = os.environ.get(
        "JWT_SECRET",
        secrets.token_urlsafe(64) if os.environ.get("ENVIRONMENT", "development") == "development"
        else "__MUST_BE_SET_IN_PRODUCTION__",
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 72

    # -- CORS --
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://0.0.0.0:3000",
    ]

    # -- File Upload --
    MAX_UPLOAD_SIZE_MB: int = 100
    ALLOWED_EXTENSIONS: List[str] = [
        ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp",
        ".pdf",
        ".dxf", ".dwg",
        ".json", ".geojson",
    ]

    # -- Processing Defaults --
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

# -- Startup Safety Checks --
if settings.AUTH_PROVIDER == "jwt" and settings.JWT_SECRET == "__MUST_BE_SET_IN_PRODUCTION__":
    raise RuntimeError(
        "FATAL: JWT_SECRET is not set in a non-development environment. "
        "Set a strong, unique JWT_SECRET via environment variable or .env file."
    )

if settings.AUTH_PROVIDER == "catalyst" and not settings.CATALYST_PROJECT_ID:
    raise RuntimeError(
        "FATAL: AUTH_PROVIDER is 'catalyst' but CATALYST_PROJECT_ID is not set. "
        "Set CATALYST_PROJECT_ID in environment variables."
    )

if settings.ENVIRONMENT == "development":
    warnings.warn(
        f"Running in development mode. Auth provider: '{settings.AUTH_PROVIDER}'. "
        "Set ENVIRONMENT=production before deploying.",
        stacklevel=1,
    )
