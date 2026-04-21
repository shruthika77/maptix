"""
File upload endpoints — powered by Catalyst File Store.
Files are uploaded to Catalyst's managed cloud storage (no local filesystem).
"""

import uuid
import os
from datetime import datetime
from flask import Blueprint, jsonify, request
from catalyst_helper import (
    get_current_user_from_token,
    zcql_query,
    datastore_insert,
    datastore_update,
    get_or_create_folder,
    upload_file,
    download_file,
)
from config import settings
import logging

logger = logging.getLogger(__name__)

files_bp = Blueprint("files", __name__)


@files_bp.route("/<project_id>/files", methods=["POST"])
def upload_project_file(project_id):
    """Upload an input file to a project via Catalyst File Store."""
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    # Verify project ownership
    rows = zcql_query(
        f"SELECT ROWID, Status FROM {settings.TABLE_PROJECTS} "
        f"WHERE ProjectId = '{project_id}' AND OwnerId = '{user['user_id']}' LIMIT 1"
    )
    if not rows:
        return jsonify({"detail": "Project not found"}), 404

    project_row = rows[0].get(settings.TABLE_PROJECTS, rows[0])
    project_rowid = project_row.get("ROWID")

    # Get uploaded file
    if "file" not in request.files:
        return jsonify({"detail": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"detail": "No file selected"}), 400

    # Validate file extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        return jsonify({
            "detail": f"File type '{ext}' not supported. Allowed: {list(settings.ALLOWED_EXTENSIONS)}"
        }), 400

    # Read content and check size
    content = file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        return jsonify({
            "detail": f"File too large ({size_mb:.1f}MB). Maximum: {settings.MAX_UPLOAD_SIZE_MB}MB"
        }), 400

    # Generate unique filename
    file_id = str(uuid.uuid4())
    stored_filename = f"{project_id}/{file_id}{ext}"

    # Upload to Catalyst File Store
    try:
        folder = get_or_create_folder(settings.FILE_STORE_FOLDER)
        folder_id = folder.get("id") or folder.get("folder_id")

        # Reset file stream for upload
        from io import BytesIO
        file_stream = BytesIO(content)
        file_stream.name = stored_filename.replace("/", "_")

        upload_result = upload_file(folder_id, file_stream.name, file_stream)
        catalyst_file_id = str(upload_result.get("id", upload_result.get("file_id", "")))

    except Exception as e:
        logger.error(f"File upload to Catalyst File Store failed: {e}")
        return jsonify({"detail": f"File storage error: {str(e)}"}), 500

    # Save file metadata to Data Store
    now = datetime.utcnow().isoformat()
    try:
        datastore_insert(settings.TABLE_PROJECT_FILES, {
            "FileId": file_id,
            "ProjectId": project_id,
            "OriginalFilename": file.filename,
            "StoredFilename": stored_filename,
            "MimeType": file.content_type or "",
            "SizeBytes": str(len(content)),
            "CatalystFileId": catalyst_file_id,
            "CatalystFolderId": str(folder_id),
            "Status": "uploaded",
            "UploadedAt": now,
        })
    except Exception as e:
        logger.error(f"Failed to save file metadata to Data Store: {e}")
        return jsonify({"detail": f"Metadata save error: {str(e)}"}), 500

    # Update project status if it's the first upload
    if project_row.get("Status") == "draft":
        try:
            datastore_update(settings.TABLE_PROJECTS, {
                "ROWID": project_rowid,
                "Status": "uploaded",
                "UpdatedAt": now,
            })
        except Exception as e:
            logger.warning(f"Failed to update project status: {e}")

    return jsonify({
        "id": file_id,
        "filename": file.filename,
        "mime_type": file.content_type or "",
        "size_bytes": len(content),
        "status": "uploaded",
        "uploaded_at": now,
    }), 201


@files_bp.route("/<project_id>/files/<file_id>/download", methods=["GET"])
def download_project_file(project_id, file_id):
    """Download a project file from Catalyst File Store."""
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

    # Get file metadata
    file_rows = zcql_query(
        f"SELECT CatalystFileId, CatalystFolderId, OriginalFilename, MimeType "
        f"FROM {settings.TABLE_PROJECT_FILES} "
        f"WHERE FileId = '{file_id}' AND ProjectId = '{project_id}' LIMIT 1"
    )
    if not file_rows:
        return jsonify({"detail": "File not found"}), 404

    f = file_rows[0].get(settings.TABLE_PROJECT_FILES, file_rows[0])
    catalyst_file_id = f.get("CatalystFileId")
    catalyst_folder_id = f.get("CatalystFolderId")
    original_filename = f.get("OriginalFilename", "download")
    mime_type = f.get("MimeType", "application/octet-stream")

    try:
        content = download_file(catalyst_folder_id, catalyst_file_id)
        from flask import Response
        return Response(
            content,
            mimetype=mime_type,
            headers={"Content-Disposition": f'attachment; filename="{original_filename}"'}
        )
    except Exception as e:
        logger.error(f"File download failed: {e}")
        return jsonify({"detail": f"Download failed: {str(e)}"}), 500
