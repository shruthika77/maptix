"""
Prompt-based floor plan generation endpoint — authenticated.
User provides a text description → generates a spatial model.
Stores the result in Catalyst Data Store.

Reuses the same layout generation engine from demo_generate but
requires authentication and saves to a real project.
"""

import uuid
from datetime import datetime
from flask import Blueprint, jsonify, request
from catalyst_helper import (
    get_current_user_from_token,
    zcql_query,
    datastore_insert,
    datastore_update,
    serialize_json_field,
    deserialize_json_field,
)
from services.generate_engine import (
    parse_prompt,
    LayoutGenerator,
    ROOM_DEFAULTS,
    FloorSpec,
    RoomSpec,
)
from services.ai.cloudflare_llm import ai_parse_prompt_to_layout
from config import settings
import logging

logger = logging.getLogger(__name__)

generate_bp = Blueprint("generate", __name__)


@generate_bp.route("/<project_id>/generate", methods=["POST"])
def generate_from_prompt(project_id):
    """
    Generate a spatial model from a text prompt or structured room specs.
    Requires authentication. Saves result to Catalyst Data Store.
    """
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    # Verify project ownership
    rows = zcql_query(
        f"SELECT ROWID FROM {settings.TABLE_PROJECTS} "
        f"WHERE ProjectId = '{project_id}' AND OwnerId = '{user['user_id']}' LIMIT 1"
    )
    if not rows:
        return jsonify({"detail": "Project not found"}), 404

    project_rowid = rows[0].get(settings.TABLE_PROJECTS, rows[0]).get("ROWID")

    data = request.get_json()
    if not data:
        return jsonify({"detail": "Request body required"}), 400

    prompt = data.get("prompt", "")
    building_type = data.get("building_type", "residential")
    plot_width = data.get("plot_width_m")
    plot_length = data.get("plot_length_m")
    wall_height = data.get("wall_height_m", 3.0)
    wall_thickness = data.get("wall_thickness_m", 0.15)
    ext_wall_thickness = data.get("exterior_wall_thickness_m", 0.25)
    floors_input = data.get("floors")

    # Parse input
    if floors_input and len(floors_input) > 0:
        floors_spec = []
        for fi in floors_input:
            rooms = []
            for ri in fi.get("rooms", []):
                rooms.append(RoomSpec(
                    name=ri.get("name", "Room"),
                    type=ri.get("type", "unknown"),
                    count=ri.get("count", 1),
                    width_m=ri.get("width_m"),
                    length_m=ri.get("length_m"),
                    area_sqm=ri.get("area_sqm"),
                ))
            floors_spec.append(FloorSpec(
                level=fi.get("level", len(floors_spec)),
                label=fi.get("label", f"Floor {len(floors_spec)}"),
                rooms=rooms,
                height_m=fi.get("height_m", 3.0),
            ))
        pw = plot_width or 12.0
        pl = plot_length or 15.0
    elif prompt:
        # Try AI first, fallback to rule-based
        ai_result = ai_parse_prompt_to_layout(prompt, building_type)
        if ai_result and ai_result.get("floors"):
            floors_spec = []
            for af in ai_result["floors"]:
                rooms = []
                for ar in af.get("rooms", []):
                    rooms.append(RoomSpec(
                        name=ar.get("name", "Room"),
                        type=ar.get("type", "unknown"),
                        count=ar.get("count", 1),
                        width_m=ar.get("width_m"),
                        length_m=ar.get("length_m"),
                        area_sqm=ar.get("area_sqm"),
                    ))
                floors_spec.append(FloorSpec(
                    level=af.get("level", len(floors_spec)),
                    label=af.get("label", f"Floor {len(floors_spec)}"),
                    rooms=rooms,
                    height_m=af.get("height_m", 3.0),
                ))
            pw = ai_result.get("plot_width_m", 12.0)
            pl = ai_result.get("plot_length_m", 15.0)
        else:
            floors_spec, pw, pl = parse_prompt(prompt, building_type)
    else:
        return jsonify({"detail": "Provide either a 'prompt' or 'floors' specification"}), 400

    if plot_width:
        pw = plot_width
    if plot_length:
        pl = plot_length

    # Generate layout
    generator = LayoutGenerator(
        plot_width=pw,
        plot_length=pl,
        wall_height=wall_height,
        wall_thickness=wall_thickness,
        ext_wall_thickness=ext_wall_thickness,
    )

    floor_data_list = []
    for floor_spec in floors_spec:
        floor_data = generator.generate_floor(floor_spec)
        floor_data_list.append(floor_data)

    # Build spatial model
    all_rooms = [r for f in floor_data_list for r in f.get("rooms", [])]
    total_area = sum(r.get("area_sqm", 0) for r in all_rooms)
    total_walls = sum(len(f.get("walls", [])) for f in floor_data_list)
    total_rooms = sum(len(f.get("rooms", [])) for f in floor_data_list)
    total_doors = sum(len(f.get("doors", [])) for f in floor_data_list)
    total_windows = sum(len(f.get("windows", [])) for f in floor_data_list)

    spatial_model = {
        "version": "1.0.0",
        "metadata": {
            "source": "prompt-generator",
            "prompt": prompt,
            "created_at": datetime.utcnow().isoformat(),
            "coordinate_system": "cartesian",
            "unit": "meters",
            "bounding_box": {
                "min": {"x": 0, "y": 0},
                "max": {"x": round(pw, 2), "y": round(pl, 2)},
            },
            "plot_dimensions": {
                "width_m": round(pw, 2),
                "length_m": round(pl, 2),
            },
        },
        "floors": floor_data_list,
    }

    # Save to Data Store
    now = datetime.utcnow().isoformat()
    model_json = serialize_json_field(spatial_model)

    existing = zcql_query(
        f"SELECT ROWID, Version FROM {settings.TABLE_SPATIAL_MODELS} "
        f"WHERE ProjectId = '{project_id}' LIMIT 1"
    )

    if existing:
        ex = existing[0].get(settings.TABLE_SPATIAL_MODELS, existing[0])
        version = int(ex.get("Version", 1)) + 1
        datastore_update(settings.TABLE_SPATIAL_MODELS, {
            "ROWID": ex.get("ROWID"),
            "Version": str(version),
            "ModelData": model_json,
            "WallCount": str(total_walls),
            "RoomCount": str(total_rooms),
            "DoorCount": str(total_doors),
            "WindowCount": str(total_windows),
            "TotalAreaSqm": str(round(total_area, 2)),
            "FloorCount": str(len(floor_data_list)),
            "AverageConfidence": "1.0",
            "UpdatedAt": now,
        })
    else:
        datastore_insert(settings.TABLE_SPATIAL_MODELS, {
            "ModelId": str(uuid.uuid4()),
            "ProjectId": project_id,
            "Version": "1",
            "ModelData": model_json,
            "WallCount": str(total_walls),
            "RoomCount": str(total_rooms),
            "DoorCount": str(total_doors),
            "WindowCount": str(total_windows),
            "TotalAreaSqm": str(round(total_area, 2)),
            "FloorCount": str(len(floor_data_list)),
            "AverageConfidence": "1.0",
            "Model3dPath": "",
            "CreatedAt": now,
            "UpdatedAt": now,
        })

    # Update project status
    datastore_update(settings.TABLE_PROJECTS, {
        "ROWID": project_rowid,
        "Status": "completed",
        "UpdatedAt": now,
    })

    return jsonify({
        "status": "generated",
        "model_data": spatial_model,
        "stats": {
            "wall_count": total_walls,
            "room_count": total_rooms,
            "door_count": total_doors,
            "window_count": total_windows,
            "total_area_sqm": round(total_area, 2),
            "floor_count": len(floor_data_list),
            "plot_width_m": round(pw, 2),
            "plot_length_m": round(pl, 2),
        },
    })
