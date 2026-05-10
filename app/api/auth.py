from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, EmailStr, field_validator

from app.db.session import get_db
from app.core.auth import (
    AuthContext,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.services.tenant_service import TenantService

router = APIRouter(prefix="/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    tenant_name: str
    email: EmailStr
    password: str
    full_name: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: str
    plan: str


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TenantService(db)
    try:
        result = await svc.register(
            tenant_name=payload.tenant_name,
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return {
        "message": "Account created successfully",
        "tenant_id": result["tenant_id"],
        "plan": result["plan"],
    }



@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        text(
            "SELECT u.id, u.hashed_password, u.is_active, u.tenant_id, t.plan "
            "FROM users u JOIN tenants t ON t.id = u.tenant_id "
            "WHERE u.email = :email"
        ),
        {"email": form_data.username},
    )
    row = result.fetchone()

    if not row or not verify_password(form_data.password, row.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not row.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    token = create_access_token({"sub": str(row.id)})
    return TokenResponse(
        access_token=token,
        tenant_id=str(row.tenant_id),
        plan=row.plan,
    )


@router.get("/me")
async def me(ctx: Annotated[AuthContext, Depends(get_current_user)]):
    return {
        "user_id": ctx.user_id,
        "tenant_id": ctx.tenant_id,
        "email": ctx.email,
        "plan": ctx.plan,
    }
