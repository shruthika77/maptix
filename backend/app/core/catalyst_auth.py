"""
Zoho Catalyst Authentication - Direct REST API integration.

Authenticates users via Catalyst REST API endpoints.
NO zcatalyst-sdk or Catalyst CLI needed.

Flow:
  1. User signs up/logs in -> Catalyst issues a user token
  2. Frontend stores the token, sends it in Authorization header
  3. Backend validates the token via Catalyst /currentuser endpoint
  4. Valid user is auto-provisioned in local SQLite DB

Env vars:
  - CATALYST_PROJECT_ID     : Catalyst project ID
  - CATALYST_PROJECT_KEY    : Catalyst project key (Project Settings)
  - CATALYST_PROJECT_DOMAIN : Catalyst app domain
"""

import logging
import httpx
from typing import Optional, Dict, Any

from app.config import settings

logger = logging.getLogger(__name__)

CATALYST_API_BASE = "https://api.catalyst.zoho.com/baas/v1/project"


class CatalystAuthClient:
    """Stateless client for Zoho Catalyst Authentication REST API."""

    def __init__(self):
        self.project_id = getattr(settings, "CATALYST_PROJECT_ID", "")
        self.project_key = getattr(settings, "CATALYST_PROJECT_KEY", "")
        self.project_domain = getattr(settings, "CATALYST_PROJECT_DOMAIN", "")

    @property
    def _base_url(self) -> str:
        return f"{CATALYST_API_BASE}/{self.project_id}"

    async def validate_token(self, user_token: str) -> Optional[Dict[str, Any]]:
        """
        Validate a Catalyst user token via the current-user endpoint.
        Returns user details dict or None if invalid.
        """
        url = f"{self._base_url}/project-user/current"
        headers = {
            "Authorization": f"Zoho-catalyst-user-token {user_token}",
            "PROJECT_ID": self.project_id,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                user_data = data.get("data", {})
                if user_data.get("user_id"):
                    logger.debug("Catalyst token valid for: %s", user_data.get("email_id"))
                    return user_data
                logger.warning("Catalyst token response missing user_id")
                return None
            else:
                logger.warning("Catalyst token validation failed: %d", resp.status_code)
                return None
        except httpx.TimeoutException:
            logger.error("Catalyst token validation timed out")
            return None
        except Exception as e:
            logger.error("Catalyst token validation error: %s", e)
            return None

    async def register_user(
        self, email: str, first_name: str, last_name: str = "",
    ) -> Optional[Dict[str, Any]]:
        """Register a new user via Catalyst signup endpoint."""
        url = f"{self._base_url}/project-user/signup"
        headers = {
            "Content-Type": "application/json",
            "PROJECT_ID": self.project_id,
            "ENVIRONMENT": getattr(settings, "CATALYST_ENVIRONMENT", "Development"),
        }
        payload = {
            "email_id": email,
            "first_name": first_name,
            "last_name": last_name,
            "platform_type": "web",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code in (200, 201):
                data = resp.json()
                return data.get("data", data)
            else:
                logger.warning("Catalyst signup failed: %d - %s", resp.status_code, resp.text[:300])
                return None
        except Exception as e:
            logger.error("Catalyst signup error: %s", e)
            return None

    async def login_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """Log in a user via Catalyst signin endpoint."""
        url = f"{self._base_url}/project-user/signin"
        headers = {
            "Content-Type": "application/json",
            "PROJECT_ID": self.project_id,
            "ENVIRONMENT": getattr(settings, "CATALYST_ENVIRONMENT", "Development"),
        }
        payload = {
            "email_id": email,
            "password": password,
            "platform_type": "web",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                return data.get("data", data)
            else:
                logger.warning("Catalyst login failed: %d - %s", resp.status_code, resp.text[:300])
                return None
        except Exception as e:
            logger.error("Catalyst login error: %s", e)
            return None

    async def reset_password(self, email: str) -> bool:
        """Trigger a password reset email via Catalyst."""
        url = f"{self._base_url}/project-user/forgot-password"
        headers = {
            "Content-Type": "application/json",
            "PROJECT_ID": self.project_id,
        }
        payload = {"email_id": email, "platform_type": "web"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
            return resp.status_code == 200
        except Exception as e:
            logger.error("Catalyst password reset error: %s", e)
            return False


# Singleton
catalyst_auth = CatalystAuthClient()
