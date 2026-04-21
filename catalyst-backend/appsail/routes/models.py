"""
Spatial model endpoints — retrieve and update the unified spatial model.
Powered by Catalyst Data Store.
"""

import json
from datetime import datetime
from flask import Blueprint, jsonify, request
from catalyst_helper import (
    get_current_user_from_token,
    zcql_query,
    datastore_update,
    deserialize_json_field,
    serialize_json_field,
)
from config import settings
import logging

logger = logging.getLogger(__name__)

models_bp = Blueprint("models", __name__)


@models_bp.route("/<project_id>/model", methods=["GET"])
def get_spatial_model(project_id):
    """Get the unified spatial model for a project."""
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    rows = zcql_query(
        f"SELECT ROWID, Version, ModelData, WallCount, RoomCount, DoorCount, WindowCount, "
        f"TotalAreaSqm, AverageConfidence, FloorCount, Model3dPath, UpdatedAt "
        f"FROM {settings.TABLE_SPATIAL_MODELS} WHERE ProjectId = '{project_id}' LIMIT 1"
    )

    if not rows:
        return jsonify({"detail": "No spatial model found. Process the project first."}), 404

    sm = rows[0].get(settings.TABLE_SPATIAL_MODELS, rows[0])

    model_data = deserialize_json_field(sm.get("ModelData", ""))

    return jsonify({
        "version": int(sm.get("Version", 1)),
        "model_data": model_data,
        "stats": {
            "wall_count": int(sm.get("WallCount", 0)),
            "room_count": int(sm.get("RoomCount", 0)),
            "door_count": int(sm.get("DoorCount", 0)),
            "window_count": int(sm.get("WindowCount", 0)),
            "total_area_sqm": float(sm.get("TotalAreaSqm", 0)),
            "average_confidence": float(sm.get("AverageConfidence", 0)),
            "floor_count": int(sm.get("FloorCount", 1)),
        },
        "has_3d_model": bool(sm.get("Model3dPath")),
        "updated_at": sm.get("UpdatedAt", ""),
    })


@models_bp.route("/<project_id>/model", methods=["PUT"])
def update_spatial_model(project_id):
    """Update the spatial model (manual edits from the 2D editor)."""
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    updates = request.get_json()
    if not updates:
        return jsonify({"detail": "Request body required"}), 400

    rows = zcql_query(
        f"SELECT ROWID, Version, ModelData FROM {settings.TABLE_SPATIAL_MODELS} "
        f"WHERE ProjectId = '{project_id}' LIMIT 1"
    )

    if not rows:
        return jsonify({"detail": "No spatial model found"}), 404

    sm = rows[0].get(settings.TABLE_SPATIAL_MODELS, rows[0])
    sm_rowid = sm.get("ROWID")
    current_version = int(sm.get("Version", 1))

    model_data = deserialize_json_field(sm.get("ModelData", ""))
    if not model_data:
        model_data = {}

    # Apply updates
    if "floors" in updates:
        for floor_update in updates["floors"]:
            level = floor_update.get("level")
            existing_floor = next(
                (f for f in model_data.get("floors", []) if f.get("level") == level),
                None,
            )
            if existing_floor:
                existing_floor.update(floor_update)
            else:
                model_data.setdefault("floors", []).append(floor_update)

    new_version = current_version + 1

    # Recalculate stats
    walls = rooms = doors = windows = 0
    total_area = 0.0
    for floor in model_data.get("floors", []):
        walls += len(floor.get("walls", []))
        rooms += len(floor.get("rooms", []))
        doors += len(floor.get("doors", []))
        windows += len(floor.get("windows", []))
        for room in floor.get("rooms", []):
            total_area += room.get("area_sqm", 0)

    now = datetime.utcnow().isoformat()

    datastore_update(settings.TABLE_SPATIAL_MODELS, {
        "ROWID": sm_rowid,
        "Version": str(new_version),
        "ModelData": serialize_json_field(model_data),
        "WallCount": str(walls),
        "RoomCount": str(rooms),
        "DoorCount": str(doors),
        "WindowCount": str(windows),
        "TotalAreaSqm": str(round(total_area, 2)),
        "FloorCount": str(len(model_data.get("floors", []))),
        "UpdatedAt": now,
    })

    return jsonify({"status": "updated", "version": new_version})
