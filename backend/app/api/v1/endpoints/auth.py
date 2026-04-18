"""
Authentication endpoints: register, login.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from app.db.session import get_db
from app.db.models import User
from app.core.security import hash_password, verify_password, create_access_token

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
        name=request.name,
    )
    db.add(user)
    await db.flush()

    token = create_access_token({"sub": str(user.id), "email": user.email})

    return AuthResponse(
        access_token=token,
        expires_in=86400 * 3,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
        }
    )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    token = create_access_token({"sub": str(user.id), "email": user.email})

    return AuthResponse(
        access_token=token,
        expires_in=86400 * 3,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
        }
    )
