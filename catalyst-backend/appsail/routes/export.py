"""
Export endpoints — download models in various formats.
Powered by Catalyst Data Store for model retrieval.
"""

import json
from flask import Blueprint, jsonify, request, Response
from catalyst_helper import (
    get_current_user_from_token,
    zcql_query,
    deserialize_json_field,
)
from services.export.svg_exporter import generate_svg
from config import settings
import logging

logger = logging.getLogger(__name__)

export_bp = Blueprint("export", __name__)


@export_bp.route("/<project_id>/export", methods=["GET"])
def export_model(project_id):
    """Export the project model in the specified format."""
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    fmt = request.args.get("format", "")
    if not fmt:
        return jsonify({"detail": "Query parameter 'format' is required"}), 400

    rows = zcql_query(
        f"SELECT ModelData FROM {settings.TABLE_SPATIAL_MODELS} "
        f"WHERE ProjectId = '{project_id}' LIMIT 1"
    )

    if not rows:
        return jsonify({"detail": "No model found to export"}), 404

    sm = rows[0].get(settings.TABLE_SPATIAL_MODELS, rows[0])
    model_data = deserialize_json_field(sm.get("ModelData", ""))

    if not model_data:
        return jsonify({"detail": "Model data is empty"}), 404

    if fmt == "svg":
        svg_content = generate_svg(model_data)
        return Response(
            svg_content,
            mimetype="image/svg+xml",
            headers={"Content-Disposition": 'attachment; filename="floorplan.svg"'},
        )

    if fmt == "json":
        json_content = json.dumps(model_data, indent=2)
        return Response(
            json_content,
            mimetype="application/json",
            headers={"Content-Disposition": 'attachment; filename="spatial-model.json"'},
        )

    return jsonify({
        "detail": f"Export format '{fmt}' not supported. Available: svg, json"
    }), 400
