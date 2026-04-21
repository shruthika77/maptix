"""
Application configuration for Zoho Catalyst backend.
Uses Catalyst Data Store, File Store, and built-in Authentication.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings — powered by Zoho Catalyst."""

    # ── Catalyst ──
    CATALYST_PROJECT_ID = os.environ.get("CATALYST_PROJECT_ID", "36873000000031001")
    CATALYST_ENVIRONMENT = os.environ.get("CATALYST_ENVIRONMENT", "Development")

    # ── Cloudflare Workers AI ──
    CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "")  # Set via environment variable
    CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")  # Set via environment variable

    # ── Frontend ──
    FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

    # ── File Upload ──
    MAX_UPLOAD_SIZE_MB = 100
    ALLOWED_EXTENSIONS = {
        ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp",
        ".pdf", ".dxf", ".dwg", ".json", ".geojson",
    }

    # ── Processing Defaults ──
    DEFAULT_WALL_HEIGHT_M = float(os.environ.get("DEFAULT_WALL_HEIGHT_M", "2.7"))
    DEFAULT_WALL_THICKNESS_M = float(os.environ.get("DEFAULT_WALL_THICKNESS_M", "0.15"))
    DEFAULT_DOOR_WIDTH_M = 0.9
    DEFAULT_DOOR_HEIGHT_M = 2.1
    DEFAULT_WINDOW_WIDTH_M = 1.2
    DEFAULT_WINDOW_HEIGHT_M = 1.2
    DEFAULT_WINDOW_SILL_M = 0.9

    # ── Catalyst Data Store Table Names ──
    TABLE_USERS = "Users"
    TABLE_PROJECTS = "Projects"
    TABLE_PROJECT_FILES = "ProjectFiles"
    TABLE_PROCESSING_JOBS = "ProcessingJobs"
    TABLE_SPATIAL_MODELS = "SpatialModels"

    # ── Catalyst File Store Folder Name ──
    FILE_STORE_FOLDER = "maptix-uploads"


settings = Settings()
