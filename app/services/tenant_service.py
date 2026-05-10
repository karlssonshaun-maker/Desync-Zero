import uuid
import hashlib
import secrets
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.auth import hash_password


class TenantService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def register(
        self,
        tenant_name: str,
        email: str,
        password: str,
        full_name: Optional[str] = None,
    ) -> dict:
        existing = await self._db.execute(
            text("SELECT id FROM tenants WHERE email = :email"),
            {"email": email},
        )
        if existing.fetchone():
            raise ValueError("An account with this email already exists")

        tenant_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await self._db.execute(
            text(
                "INSERT INTO tenants (id, name, email, plan) "
                "VALUES (:id, :name, :email, 'free')"
            ),
            {"id": tenant_id, "name": tenant_name, "email": email},
        )

        await self._db.execute(
            text(
                "INSERT INTO subscriptions (tenant_id, plan, status) "
                "VALUES (:tenant_id, 'free', 'active')"
            ),
            {"tenant_id": tenant_id},
        )

        await self._db.execute(
            text(
                "INSERT INTO users (id, tenant_id, email, hashed_password, full_name) "
                "VALUES (:id, :tenant_id, :email, :hashed_password, :full_name)"
            ),
            {
                "id": user_id,
                "tenant_id": tenant_id,
                "email": email,
                "hashed_password": hash_password(password),
                "full_name": full_name,
            },
        )

        await self._db.commit()

        return {"tenant_id": tenant_id, "user_id": user_id, "email": email, "plan": "free"}

    async def get_tenant(self, tenant_id: str) -> Optional[dict]:
        result = await self._db.execute(
            text(
                "SELECT t.id, t.name, t.email, t.plan, t.is_active, t.created_at, "
                "s.status AS sub_status, s.current_period_end "
                "FROM tenants t "
                "LEFT JOIN subscriptions s ON s.tenant_id = t.id "
                "WHERE t.id = :tenant_id"
            ),
            {"tenant_id": tenant_id},
        )
        row = result.fetchone()
        if not row:
            return None
        return {
            "id": str(row.id),
            "name": row.name,
            "email": row.email,
            "plan": row.plan,
            "is_active": row.is_active,
            "created_at": row.created_at,
            "subscription_status": row.sub_status,
            "current_period_end": row.current_period_end,
        }

    async def create_api_key(self, tenant_id: str, name: str) -> str:
        raw_key = f"dz_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_id = str(uuid.uuid4())

        await self._db.execute(
            text(
                "INSERT INTO api_keys (id, tenant_id, key_hash, name) "
                "VALUES (:id, :tenant_id, :key_hash, :name)"
            ),
            {"id": key_id, "tenant_id": tenant_id, "key_hash": key_hash, "name": name},
        )
        await self._db.commit()
        return raw_key

    async def list_api_keys(self, tenant_id: str) -> list[dict]:
        result = await self._db.execute(
            text(
                "SELECT id, name, is_active, created_at, last_used_at "
                "FROM api_keys WHERE tenant_id = :tenant_id ORDER BY created_at DESC"
            ),
            {"tenant_id": tenant_id},
        )
        rows = result.fetchall()
        return [
            {
                "id": str(r.id),
                "name": r.name,
                "is_active": r.is_active,
                "created_at": r.created_at,
                "last_used_at": r.last_used_at,
            }
            for r in rows
        ]

    async def revoke_api_key(self, tenant_id: str, key_id: str):
        await self._db.execute(
            text(
                "UPDATE api_keys SET is_active = FALSE "
                "WHERE id = :key_id AND tenant_id = :tenant_id"
            ),
            {"key_id": key_id, "tenant_id": tenant_id},
        )
        await self._db.commit()
