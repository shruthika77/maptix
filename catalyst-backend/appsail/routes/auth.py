"""
Authentication endpoints — powered by Zoho Catalyst Built-in Authentication.

Catalyst handles:
  - User registration (signup)
  - User login (email/password → token)
  - Token validation
  - Password reset

The frontend redirects to Catalyst's auth pages, or uses the SDK's
sign-up/sign-in API. Once authenticated, Catalyst issues a user token
that is sent in the Authorization header for all subsequent requests.
"""

from flask import Blueprint, jsonify, request
from catalyst_helper import get_catalyst_app, get_current_user_from_token, zcql_query, datastore_insert
from config import settings
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/signup-config", methods=["GET"])
def get_signup_config():
    """
    Return Catalyst auth configuration for the frontend.
    The frontend uses this to redirect users to Catalyst's signup/login pages
    or to configure the Catalyst JS SDK.
    """
    return jsonify({
        "auth_provider": "zoho_catalyst",
        "project_id": settings.CATALYST_PROJECT_ID,
        "platform": "Catalyst Built-in Authentication",
        "instructions": (
            "Use Catalyst Authentication SDK or redirect to Catalyst login page. "
            "After authentication, include the user token in Authorization: Bearer <token> header."
        ),
    })


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Register a new user via Catalyst Authentication.

    Catalyst's built-in auth handles user creation. This endpoint:
    1. Receives signup data from the frontend
    2. Calls Catalyst's user management API to create the user
    3. Returns the user details and token
    """
    data = request.get_json()
    if not data:
        return jsonify({"detail": "Request body required"}), 400

    email = data.get("email", "").strip()
    first_name = data.get("name", "User").split()[0]
    last_name = " ".join(data.get("name", "").split()[1:]) or ""

    if not email:
        return jsonify({"detail": "Email is required"}), 400

    try:
        app = get_catalyst_app()
        user_management = app.authentication()

        # Register user via Catalyst
        new_user = user_management.register_user({
            "email_id": email,
            "first_name": first_name,
            "last_name": last_name,
        })

        user_id = str(new_user.get("user_id", ""))

        # Also store in our Users Data Store table for app-specific data
        try:
            datastore_insert(settings.TABLE_USERS, {
                "UserId": user_id,
                "Email": email,
                "Name": data.get("name", first_name),
                "IsActive": "true",
            })
        except Exception as e:
            logger.warning(f"Could not insert user into Data Store (may already exist): {e}")

        return jsonify({
            "access_token": new_user.get("token", ""),
            "token_type": "bearer",
            "expires_in": 86400 * 3,
            "user": {
                "id": user_id,
                "email": email,
                "name": data.get("name", first_name),
            },
        }), 201

    except Exception as e:
        logger.error(f"Registration failed: {e}")
        return jsonify({"detail": f"Registration failed: {str(e)}"}), 400


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Login via Catalyst Authentication.

    Catalyst's built-in auth validates credentials and returns a token.
    The frontend should use Catalyst JS SDK's signIn method or
    redirect to Catalyst's login page.
    """
    data = request.get_json()
    if not data:
        return jsonify({"detail": "Request body required"}), 400

    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"detail": "Email and password are required"}), 400

    try:
        app = get_catalyst_app()
        user_management = app.authentication()

        # Sign in via Catalyst
        login_result = user_management.login({
            "email_id": email,
            "password": password,
        })

        user_details = login_result.get("user", {})
        user_id = str(user_details.get("user_id", ""))
        name = f"{user_details.get('first_name', '')} {user_details.get('last_name', '')}".strip()

        return jsonify({
            "access_token": login_result.get("token", ""),
            "token_type": "bearer",
            "expires_in": 86400 * 3,
            "user": {
                "id": user_id,
                "email": email,
                "name": name or email.split("@")[0],
            },
        })

    except Exception as e:
        logger.error(f"Login failed: {e}")
        return jsonify({"detail": "Invalid email or password"}), 401


@auth_bp.route("/me", methods=["GET"])
def get_me():
    """Get the current authenticated user's profile."""
    user = get_current_user_from_token()
    if not user:
        return jsonify({"detail": "Not authenticated"}), 401

    return jsonify({
        "id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
    })
