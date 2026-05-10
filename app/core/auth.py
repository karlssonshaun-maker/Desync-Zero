import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import get_db

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class AuthContext:
    def __init__(self, user_id: str, tenant_id: str, email: str, plan: str):
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.email = email
        self.plan = plan


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(
        text(
            "SELECT u.id, u.tenant_id, u.email, u.is_active, t.plan "
            "FROM users u JOIN tenants t ON t.id = u.tenant_id "
            "WHERE u.id = :user_id AND u.is_active = TRUE AND t.is_active = TRUE"
        ),
        {"user_id": user_id},
    )
    row = result.fetchone()
    if not row:
        raise credentials_exception

    return AuthContext(
        user_id=str(row.id),
        tenant_id=str(row.tenant_id),
        email=row.email,
        plan=row.plan,
    )


async def get_current_user_from_api_key(
    api_key: str,
    db: AsyncSession,
) -> AuthContext:
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    result = await db.execute(
        text(
            "SELECT ak.tenant_id, ak.name, t.plan "
            "FROM api_keys ak JOIN tenants t ON t.id = ak.tenant_id "
            "WHERE ak.key_hash = :key_hash AND ak.is_active = TRUE AND t.is_active = TRUE"
        ),
        {"key_hash": key_hash},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or inactive API key",
        )
    await db.execute(
        text("UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = :key_hash"),
        {"key_hash": key_hash},
    )
    await db.commit()
    return AuthContext(
        user_id="api_key",
        tenant_id=str(row.tenant_id),
        email="",
        plan=row.plan,
    )
