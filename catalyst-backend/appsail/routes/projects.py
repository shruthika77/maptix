"""
Project CRUD endpoints — powered by Catalyst Data Store.
"""

import uuid
from datetime import datetime
from flask import Blueprint, jsonify, request
from catalyst_helper import (
    get_current_user_from_token,
    zcql_query,
    datastore_insert,
    datastore_update,
    datastore_delete,
    serialize_json_field,
    deserialize_json_field,
)
from config import settings
import logging

logger = logging.getLogger(__name__)

projects_bp = Blueprint("projects", __name__)


def _require_auth():
    """Validate token and return user dict or abort with 401."""
    user = get_current_user_from_token()
    if not user:
        return None
    return user


@projects_bp.route("", methods=["GET"])
def list_projects():
    """List all projects for the current user."""
    user = _require_auth()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    rows = zcql_query(
        f"SELECT ROWID, ProjectId, OwnerId, Name, Description, BuildingType, Status, "
        f"CreatedAt, UpdatedAt FROM {settings.TABLE_PROJECTS} "
        f"WHERE OwnerId = '{user['user_id']}' ORDER BY UpdatedAt DESC"
    )

    projects = []
    for row in rows:
        p = row.get(settings.TABLE_PROJECTS, row)
        project_id = p.get("ProjectId", "")

        # Fetch spatial model stats
        sm_rows = zcql_query(
            f"SELECT WallCount, RoomCount, DoorCount, WindowCount, TotalAreaSqm, "
            f"AverageConfidence, Model3dPath FROM {settings.TABLE_SPATIAL_MODELS} "
            f"WHERE ProjectId = '{project_id}' LIMIT 1"
        )
        has_model = len(sm_rows) > 0
        sm = sm_rows[0].get(settings.TABLE_SPATIAL_MODELS, sm_rows[0]) if has_model else {}

        # Fetch file count
        file_rows = zcql_query(
            f"SELECT COUNT(ROWID) AS cnt FROM {settings.TABLE_PROJECT_FILES} "
            f"WHERE ProjectId = '{project_id}'"
        )
        file_count = 0
        if file_rows:
            fc = file_rows[0]
            file_count = int(fc.get("cnt", fc.get(settings.TABLE_PROJECT_FILES, {}).get("cnt", 0)))

        projects.append({
            "id": project_id,
            "name": p.get("Name", ""),
            "description": p.get("Description", ""),
            "building_type": p.get("BuildingType", "residential"),
            "status": p.get("Status", "draft"),
            "has_spatial_model": has_model,
            "has_3d_model": has_model and bool(sm.get("Model3dPath")),
            "file_count": file_count,
            "spatial_model_stats": {
                "wall_count": int(sm.get("WallCount", 0)) if has_model else 0,
                "room_count": int(sm.get("RoomCount", 0)) if has_model else 0,
                "door_count": int(sm.get("DoorCount", 0)) if has_model else 0,
                "window_count": int(sm.get("WindowCount", 0)) if has_model else 0,
                "total_area_sqm": float(sm.get("TotalAreaSqm", 0)) if has_model else 0,
                "average_confidence": float(sm.get("AverageConfidence", 0)) if has_model else 0,
            },
            "created_at": p.get("CreatedAt", ""),
            "updated_at": p.get("UpdatedAt", ""),
        })

    return jsonify({"projects": projects, "total": len(projects)})


@projects_bp.route("", methods=["POST"])
def create_project():
    """Create a new project."""
    user = _require_auth()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"detail": "Project name is required"}), 400

    project_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    row = datastore_insert(settings.TABLE_PROJECTS, {
        "ProjectId": project_id,
        "OwnerId": user["user_id"],
        "Name": data["name"],
        "Description": data.get("description", ""),
        "BuildingType": data.get("building_type", "residential"),
        "Status": "draft",
        "CreatedAt": now,
        "UpdatedAt": now,
    })

    return jsonify({
        "id": project_id,
        "name": data["name"],
        "description": data.get("description", ""),
        "building_type": data.get("building_type", "residential"),
        "status": "draft",
        "created_at": now,
    }), 201


@projects_bp.route("/<project_id>", methods=["GET"])
def get_project(project_id):
    """Get project details."""
    user = _require_auth()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    rows = zcql_query(
        f"SELECT ROWID, ProjectId, OwnerId, Name, Description, BuildingType, Status, "
        f"CreatedAt, UpdatedAt FROM {settings.TABLE_PROJECTS} "
        f"WHERE ProjectId = '{project_id}' AND OwnerId = '{user['user_id']}' LIMIT 1"
    )
    if not rows:
        return jsonify({"detail": "Project not found"}), 404

    p = rows[0].get(settings.TABLE_PROJECTS, rows[0])

    # Fetch files
    file_rows = zcql_query(
        f"SELECT FileId, OriginalFilename, MimeType, SizeBytes, Status, UploadedAt "
        f"FROM {settings.TABLE_PROJECT_FILES} WHERE ProjectId = '{project_id}'"
    )
    files = []
    for fr in file_rows:
        f = fr.get(settings.TABLE_PROJECT_FILES, fr)
        files.append({
            "id": f.get("FileId", ""),
            "filename": f.get("OriginalFilename", ""),
            "mime_type": f.get("MimeType", ""),
            "size_bytes": int(f.get("SizeBytes", 0)),
            "status": f.get("Status", "uploaded"),
            "uploaded_at": f.get("UploadedAt", ""),
        })

    # Fetch spatial model
    sm_rows = zcql_query(
        f"SELECT WallCount, RoomCount, DoorCount, WindowCount, TotalAreaSqm, "
        f"AverageConfidence, Model3dPath FROM {settings.TABLE_SPATIAL_MODELS} "
        f"WHERE ProjectId = '{project_id}' LIMIT 1"
    )
    has_model = len(sm_rows) > 0
    sm = sm_rows[0].get(settings.TABLE_SPATIAL_MODELS, sm_rows[0]) if has_model else {}

    # Fetch latest job
    job_rows = zcql_query(
        f"SELECT JobId, Status, Progress, CurrentStage FROM {settings.TABLE_PROCESSING_JOBS} "
        f"WHERE ProjectId = '{project_id}' ORDER BY CreatedAt DESC LIMIT 1"
    )
    latest_job = None
    if job_rows:
        j = job_rows[0].get(settings.TABLE_PROCESSING_JOBS, job_rows[0])
        latest_job = {
            "id": j.get("JobId", ""),
            "status": j.get("Status", ""),
            "progress": float(j.get("Progress", 0)),
            "current_stage": j.get("CurrentStage", ""),
        }

    return jsonify({
        "id": project_id,
        "name": p.get("Name", ""),
        "description": p.get("Description", ""),
        "building_type": p.get("BuildingType", "residential"),
        "status": p.get("Status", "draft"),
        "files": files,
        "has_spatial_model": has_model,
        "spatial_model_stats": {
            "wall_count": int(sm.get("WallCount", 0)),
            "room_count": int(sm.get("RoomCount", 0)),
            "door_count": int(sm.get("DoorCount", 0)),
            "window_count": int(sm.get("WindowCount", 0)),
            "total_area_sqm": float(sm.get("TotalAreaSqm", 0)),
            "average_confidence": float(sm.get("AverageConfidence", 0)),
        } if has_model else None,
        "has_3d_model": has_model and bool(sm.get("Model3dPath")),
        "latest_job": latest_job,
        "created_at": p.get("CreatedAt", ""),
        "updated_at": p.get("UpdatedAt", ""),
    })


@projects_bp.route("/<project_id>", methods=["DELETE"])
def delete_project(project_id):
    """Delete a project and all associated data."""
    user = _require_auth()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    # Verify ownership
    rows = zcql_query(
        f"SELECT ROWID FROM {settings.TABLE_PROJECTS} "
        f"WHERE ProjectId = '{project_id}' AND OwnerId = '{user['user_id']}' LIMIT 1"
    )
    if not rows:
        return jsonify({"detail": "Project not found"}), 404

    project_rowid = rows[0].get(settings.TABLE_PROJECTS, rows[0]).get("ROWID")

    # Delete associated records (spatial models, jobs, files)
    for table in [settings.TABLE_SPATIAL_MODELS, settings.TABLE_PROCESSING_JOBS, settings.TABLE_PROJECT_FILES]:
        assoc_rows = zcql_query(
            f"SELECT ROWID FROM {table} WHERE ProjectId = '{project_id}'"
        )
        for ar in assoc_rows:
            rid = ar.get(table, ar).get("ROWID")
            if rid:
                try:
                    datastore_delete(table, str(rid))
                except Exception as e:
                    logger.warning(f"Failed to delete row {rid} from {table}: {e}")

    # Delete the project itself
    datastore_delete(settings.TABLE_PROJECTS, str(project_rowid))

    return "", 204
