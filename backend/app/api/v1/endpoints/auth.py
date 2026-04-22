"""
Authentication endpoints: register, login, me, forgot-password.

Dual-mode:
  - AUTH_PROVIDER=jwt      -> local bcrypt + JWT (default)
  - AUTH_PROVIDER=catalyst -> Zoho Catalyst REST API
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator

from app.db.session import get_db
from app.db.models import User
from app.core.security import hash_password, verify_password, create_access_token
from app.core.auth import get_current_user
from app.config import settings

router = APIRouter()


# ---- Request / Response schemas ----

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        import re
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, v.strip()):
            raise ValueError("Invalid email address")
        return v.strip().lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1:
            raise ValueError("Name must not be empty")
        if len(v) > 100:
            raise ValueError("Name must be 100 characters or fewer")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    name: str


# ---- Endpoints ----

@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""

    if settings.AUTH_PROVIDER == "catalyst":
        # Register via Catalyst REST API
        from app.core.catalyst_auth import catalyst_auth

        parts = request.name.strip().split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

        result = await catalyst_auth.register_user(
            email=request.email,
            first_name=first_name,
            last_name=last_name,
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration failed. Email may already be registered or Catalyst rejected the request.",
            )

        user_id = str(result.get("user_id", ""))
        token = result.get("token", "")

        # Auto-provision local DB record
        existing = await db.execute(select(User).where(User.email == request.email))
        if not existing.scalar_one_or_none():
            user = User(
                id=user_id or None,
                email=request.email,
                hashed_password="__catalyst_managed__",
                name=request.name,
            )
            db.add(user)
            await db.flush()
            await db.commit()
            user_id = user_id or str(user.id)

        return AuthResponse(
            access_token=token,
            expires_in=86400 * 3,
            user={"id": user_id, "email": request.email, "name": request.name},
        )

    # ---- JWT mode (default) ----
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
        name=request.name,
    )
    db.add(user)
    await db.flush()
    await db.commit()

    token = create_access_token({"sub": str(user.id), "email": user.email})

    return AuthResponse(
        access_token=token,
        expires_in=86400 * 3,
        user={"id": str(user.id), "email": user.email, "name": user.name},
    )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""

    if settings.AUTH_PROVIDER == "catalyst":
        # Login via Catalyst REST API
        from app.core.catalyst_auth import catalyst_auth

        result = await catalyst_auth.login_user(request.email, request.password)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        token = result.get("token", "")
        user_data = result.get("user", result)
        user_id = str(user_data.get("user_id", ""))
        first = user_data.get("first_name", "")
        last = user_data.get("last_name", "")
        name = f"{first} {last}".strip() or request.email.split("@")[0]

        # Auto-provision local DB record if needed
        existing = await db.execute(select(User).where(User.email == request.email))
        local_user = existing.scalar_one_or_none()
        if not local_user:
            local_user = User(
                id=user_id or None,
                email=request.email,
                hashed_password="__catalyst_managed__",
                name=name,
            )
            db.add(local_user)
            await db.flush()
            await db.commit()

        return AuthResponse(
            access_token=token,
            expires_in=86400 * 3,
            user={"id": user_id or str(local_user.id), "email": request.email, "name": name},
        )

    # ---- JWT mode (default) ----
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token({"sub": str(user.id), "email": user.email})

    return AuthResponse(
        access_token=token,
        expires_in=86400 * 3,
        user={"id": str(user.id), "email": user.email, "name": user.name},
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user profile."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
    )


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """
    Trigger password reset.
    - Catalyst mode: sends reset email via Catalyst API
    - JWT mode: returns instructions (no email service configured)
    """
    if settings.AUTH_PROVIDER == "catalyst":
        from app.core.catalyst_auth import catalyst_auth

        success = await catalyst_auth.reset_password(request.email)
        if success:
            return {"message": "Password reset email sent. Check your inbox."}
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not send reset email. Verify the email address.",
        )

    # JWT mode - no email service
    return {
        "message": "Password reset is not available in local JWT mode. Contact an administrator.",
    }


@router.get("/config")
async def get_auth_config():
    """Return the current authentication configuration for the frontend."""
    return {
        "auth_provider": settings.AUTH_PROVIDER,
        "catalyst_project_id": getattr(settings, "CATALYST_PROJECT_ID", "") if settings.AUTH_PROVIDER == "catalyst" else "",
        "features": {
            "register": True,
            "login": True,
            "forgot_password": settings.AUTH_PROVIDER == "catalyst",
            "social_login": False,
        },
    }
