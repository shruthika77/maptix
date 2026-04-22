"""
Authentication dependency for protected endpoints.

Supports two auth providers:
  - "jwt"      : Local JWT tokens (default for development)
  - "catalyst" : Zoho Catalyst Authentication via REST API
"""

import logging
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import User
from app.core.security import decode_token
from app.config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def _authenticate_jwt(
    token: str,
    db: AsyncSession,
) -> User:
    """Authenticate using local JWT token."""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def _authenticate_catalyst(
    token: str,
    db: AsyncSession,
) -> User:
    """
    Authenticate via Zoho Catalyst REST API.

    Validates the Catalyst user token by calling the Catalyst
    /project-user/current endpoint. If valid, looks up or
    auto-creates a local User record in SQLite.

    No zcatalyst-sdk required - uses httpx REST calls.
    """
    from app.core.catalyst_auth import catalyst_auth

    user_details = await catalyst_auth.validate_token(token)

    if not user_details:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Catalyst token",
        )

    catalyst_user_id = str(user_details.get("user_id", ""))
    email = user_details.get("email_id", "")
    first_name = user_details.get("first_name", "")
    last_name = user_details.get("last_name", "")
    name = f"{first_name} {last_name}".strip() or email.split("@")[0]

    if not catalyst_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Catalyst user details",
        )

    # Look up by Catalyst user ID first
    result = await db.execute(select(User).where(User.id == catalyst_user_id))
    user = result.scalar_one_or_none()

    # Fallback: look up by email (user may have been created via JWT mode)
    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    # Auto-provision: create local DB record for new Catalyst users
    if not user:
        user = User(
            id=catalyst_user_id,
            email=email,
            hashed_password="__catalyst_managed__",
            name=name,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        await db.commit()
        logger.info("Auto-provisioned Catalyst user: %s", email)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
        )

    return user


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Extract and verify the current user from the Authorization header.

    Routes to the configured auth provider:
      - AUTH_PROVIDER=jwt      -> local JWT validation
      - AUTH_PROVIDER=catalyst -> Zoho Catalyst REST API validation
    """
    token = credentials.credentials

    if settings.AUTH_PROVIDER == "catalyst":
        return await _authenticate_catalyst(token, db)
    else:
        return await _authenticate_jwt(token, db)
