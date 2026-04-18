"""
Maptix 3D API — Main Application Entry Point

FREE configuration:
- SQLite database (zero config, auto-created)
- Local filesystem storage (no S3/MinIO)
- In-process background tasks (no Redis/Celery)
- JWT auth (no external auth service)

Just run: uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import structlog

import sqlalchemy
from app.config import settings
from app.api.v1 import router as api_v1_router
from app.db.session import engine, Base

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info("Starting Maptix 3D API", environment=settings.ENVIRONMENT)

    # Create all database tables automatically (SQLite file auto-created)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Enable WAL mode for better concurrent read/write support
        await conn.execute(sqlalchemy.text("PRAGMA journal_mode=WAL"))
        await conn.execute(sqlalchemy.text("PRAGMA busy_timeout=5000"))
    logger.info("Database tables created (SQLite with WAL mode)")

    yield

    logger.info("Shutting down Maptix 3D API")
    await engine.dispose()


app = FastAPI(
    title="Maptix 3D API",
    description="Indoor Mapping & 3D Reconstruction Platform — Free Backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_v1_router, prefix="/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "maptix-3d-api",
        "version": "1.0.0",
        "database": "SQLite (free, zero-config)",
        "storage": "Local filesystem",
        "processing": "In-process (no Redis/Celery needed)",
    }
