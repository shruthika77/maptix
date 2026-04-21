"""
Zoho Catalyst SDK Helper — wraps Data Store, File Store, and Auth operations.

Provides a clean interface for:
  - Data Store: CRUD via ZCQL (SQL-like queries)
  - File Store: Upload/download/delete files
  - Authentication: Validate Catalyst user tokens
"""

import zcatalyst_sdk
import json
import logging
from flask import request as flask_request

logger = logging.getLogger(__name__)


def get_catalyst_app():
    """
    Initialize and return the Catalyst app instance from the current request.
    The Catalyst SDK auto-detects project credentials from the runtime environment.
    """
    return zcatalyst_sdk.initialize(req=flask_request)


# ═══════════════════════════════════════════════════════════
#  DATA STORE — ZCQL Queries
# ═══════════════════════════════════════════════════════════

def zcql_query(query_str: str) -> list:
    """
    Execute a ZCQL query and return the result rows.
    ZCQL is SQL-like: SELECT, INSERT, UPDATE, DELETE supported.
    Returns list of dicts (column_name → value).
    """
    app = get_catalyst_app()
    zcql_service = app.zcql()
    result = zcql_service.execute_query(query_str)
    return result if result else []


def datastore_insert(table_name: str, row_data: dict) -> dict:
    """Insert a row into a Data Store table. Returns the inserted row with ROWID."""
    app = get_catalyst_app()
    table = app.datastore().table(table_name)
    result = table.insert_row(row_data)
    return result


def datastore_update(table_name: str, row_data: dict) -> dict:
    """
    Update a row in a Data Store table.
    row_data MUST contain 'ROWID' to identify which row to update.
    """
    app = get_catalyst_app()
    table = app.datastore().table(table_name)
    result = table.update_row(row_data)
    return result


def datastore_delete(table_name: str, row_id: str):
    """Delete a row from a Data Store table by ROWID."""
    app = get_catalyst_app()
    table = app.datastore().table(table_name)
    table.delete_row(row_id)


def datastore_get_row(table_name: str, row_id: str) -> dict:
    """Get a single row by ROWID."""
    app = get_catalyst_app()
    table = app.datastore().table(table_name)
    result = table.get_row(row_id)
    return result


# ═══════════════════════════════════════════════════════════
#  FILE STORE — Upload / Download / Delete
# ═══════════════════════════════════════════════════════════

def get_or_create_folder(folder_name: str) -> dict:
    """
    Get an existing File Store folder or create it if it doesn't exist.
    Returns the folder metadata dict (contains 'id').
    """
    app = get_catalyst_app()
    file_store = app.filestore()

    # Try to find existing folder
    try:
        folders = file_store.get_all_folders()
        for folder in folders:
            if folder.get("folder_name") == folder_name:
                return folder
    except Exception:
        pass

    # Create new folder
    folder = file_store.create_folder(folder_name)
    return folder


def upload_file(folder_id, file_name: str, file_stream) -> dict:
    """
    Upload a file to Catalyst File Store.
    Returns file metadata dict (contains 'id', 'file_name', 'file_size').
    """
    app = get_catalyst_app()
    folder = app.filestore().folder(folder_id)
    result = folder.upload_file(file_name, file_stream)
    return result


def download_file(folder_id, file_id) -> bytes:
    """Download a file from Catalyst File Store. Returns file content bytes."""
    app = get_catalyst_app()
    folder = app.filestore().folder(folder_id)
    content = folder.download_file(file_id)
    return content


def delete_file(folder_id, file_id):
    """Delete a file from Catalyst File Store."""
    app = get_catalyst_app()
    folder = app.filestore().folder(folder_id)
    folder.delete_file(file_id)


# ═══════════════════════════════════════════════════════════
#  AUTHENTICATION — Catalyst Built-in Auth
# ═══════════════════════════════════════════════════════════

def get_current_user_from_token() -> dict:
    """
    Validate the Catalyst user token from the Authorization header.

    Catalyst's built-in auth provides:
      - User signup/login via Catalyst's auth pages or SDK
      - Token-based session management
      - User profile (user_id, email, first_name, last_name)

    Returns user dict or None if invalid/missing token.
    """
    auth_header = flask_request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split("Bearer ", 1)[1].strip()
    if not token:
        return None

    try:
        app = get_catalyst_app()
        user_management = app.authentication()
        # Validate token and get user details
        user_details = user_management.get_current_user()

        if user_details:
            return {
                "user_id": str(user_details.get("user_id", "")),
                "email": user_details.get("email_id", ""),
                "name": f"{user_details.get('first_name', '')} {user_details.get('last_name', '')}".strip(),
                "first_name": user_details.get("first_name", ""),
                "last_name": user_details.get("last_name", ""),
                "status": user_details.get("status", ""),
                "role_id": user_details.get("role_id", ""),
            }
    except Exception as e:
        logger.warning(f"Catalyst auth validation failed: {e}")

    return None


# ═══════════════════════════════════════════════════════════
#  UTILITY — JSON field handling for Data Store
# ═══════════════════════════════════════════════════════════

def serialize_json_field(data) -> str:
    """Serialize a Python dict/list to a JSON string for Data Store text columns."""
    if data is None:
        return ""
    return json.dumps(data)


def deserialize_json_field(text: str):
    """Deserialize a JSON string from Data Store text column back to Python object."""
    if not text:
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
