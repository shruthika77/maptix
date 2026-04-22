"""
SQLAlchemy database models for Maptix 3D.
Uses SQLite — no PostgreSQL or PostGIS needed.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship

from app.db.session import Base


def gen_uuid():
    return str(uuid.uuid4())


def _utcnow():
    """Return timezone-aware UTC datetime (Python 3.12+ compatible)."""
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    building_type = Column(String(50), default="residential")
    status = Column(String(20), default="draft")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    owner = relationship("User", back_populates="projects")
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan")
    jobs = relationship("ProcessingJob", back_populates="project", cascade="all, delete-orphan")
    spatial_model = relationship("SpatialModel", back_populates="project", uselist=False, cascade="all, delete-orphan")


class ProjectFile(Base):
    __tablename__ = "project_files"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=False)
    storage_path = Column(String(500), nullable=False)
    status = Column(String(20), default="uploaded")
    uploaded_at = Column(DateTime, default=_utcnow)

    project = relationship("Project", back_populates="files")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    status = Column(String(30), default="queued")
    progress = Column(Float, default=0.0)
    current_stage = Column(String(50), nullable=True)
    stages = Column(JSON, default=list)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="jobs")


class SpatialModel(Base):
    __tablename__ = "spatial_models"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, unique=True)
    version = Column(Integer, default=1)
    model_data = Column(JSON, nullable=False)

    wall_count = Column(Integer, default=0)
    room_count = Column(Integer, default=0)
    door_count = Column(Integer, default=0)
    window_count = Column(Integer, default=0)
    total_area_sqm = Column(Float, nullable=True)
    floor_count = Column(Integer, default=1)
    average_confidence = Column(Float, nullable=True)

    model_3d_path = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    project = relationship("Project", back_populates="spatial_model")
