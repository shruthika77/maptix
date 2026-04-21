"""
Health check endpoint.
"""

from flask import Blueprint, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "maptix-3d-api",
        "version": "1.0.0",
        "platform": "Zoho Catalyst AppSail",
        "database": "Catalyst Data Store",
        "storage": "Catalyst File Store",
        "auth": "Catalyst Built-in Authentication",
        "ai": "Cloudflare Workers AI (Meta Llama 3)",
    })
