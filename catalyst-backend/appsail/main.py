"""
Maptix 3D API — Zoho Catalyst AppSail Entry Point

Stack:
  - Flask (Python) on Catalyst AppSail
  - Catalyst Data Store (managed tables via ZCQL)
  - Catalyst File Store (cloud file storage)
  - Catalyst Built-in Authentication (user management + token validation)
  - Cloudflare Workers AI (Meta Llama 3 — kept as-is)
  - OpenCV (image processing, runs inside AppSail container)

Run locally:
  flask run --port 9000
"""

import os
import sys

# Ensure the appsail directory is on the Python path so
# `services.*`, `config`, and `catalyst_helper` imports work everywhere.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS

from routes.health import health_bp
from routes.auth import auth_bp
from routes.projects import projects_bp
from routes.files import files_bp
from routes.processing import processing_bp
from routes.models import models_bp
from routes.export import export_bp
from routes.generate import generate_bp
from routes.demo_generate import demo_generate_bp

app = Flask(__name__)

# ── CORS ──
CORS(app, resources={r"/v1/*": {
    "origins": [
        os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000"),
        "http://localhost:5173",
        "http://localhost:3000",
        "*",
    ],
    "supports_credentials": True,
    "allow_headers": ["Content-Type", "Authorization", "X-ZCSRF-TOKEN",
                       "PROJECT_ID", "ENVIRONMENT"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
}})

# ── Register route blueprints ──
app.register_blueprint(health_bp)
app.register_blueprint(auth_bp,           url_prefix="/v1/auth")
app.register_blueprint(projects_bp,       url_prefix="/v1/projects")
app.register_blueprint(files_bp,          url_prefix="/v1/projects")
app.register_blueprint(processing_bp,     url_prefix="/v1/projects")
app.register_blueprint(models_bp,         url_prefix="/v1/projects")
app.register_blueprint(export_bp,         url_prefix="/v1/projects")
app.register_blueprint(generate_bp,       url_prefix="/v1/projects")
app.register_blueprint(demo_generate_bp,  url_prefix="/v1/demo/generate")


if __name__ == "__main__":
    port = int(os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT", 9000))
    app.run(host="0.0.0.0", port=port, debug=True)
