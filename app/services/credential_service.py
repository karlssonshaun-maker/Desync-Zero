from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.encryption import encrypt, decrypt

TAKEALOT_KEYS = ("api_key",)
AMAZON_KEYS = ("access_token", "secret_key", "seller_id", "marketplace_id")
SHOPIFY_KEYS = ("webhook_secret", "access_token", "shop_domain")


class CredentialService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def set_credential(
        self,
        tenant_id: str,
        channel: str,
        credential_key: str,
        value: str,
    ):
        encrypted = encrypt(value)
        await self._db.execute(
            text(
                "INSERT INTO tenant_credentials (tenant_id, channel, credential_key, encrypted_value) "
                "VALUES (:tenant_id, :channel, :key, :value) "
                "ON CONFLICT (tenant_id, channel, credential_key) DO UPDATE SET "
                "encrypted_value = EXCLUDED.encrypted_value, updated_at = NOW()"
            ),
            {
                "tenant_id": tenant_id,
                "channel": channel,
                "key": credential_key,
                "value": encrypted,
            },
        )
        await self._db.commit()

    async def get_credential(
        self,
        tenant_id: str,
        channel: str,
        credential_key: str,
    ) -> Optional[str]:
        result = await self._db.execute(
            text(
                "SELECT encrypted_value FROM tenant_credentials "
                "WHERE tenant_id = :tenant_id AND channel = :channel AND credential_key = :key"
            ),
            {"tenant_id": tenant_id, "channel": channel, "key": credential_key},
        )
        row = result.fetchone()
        if not row:
            return None
        return decrypt(row.encrypted_value)

    async def get_all_for_channel(self, tenant_id: str, channel: str) -> dict[str, str]:
        result = await self._db.execute(
            text(
                "SELECT credential_key, encrypted_value FROM tenant_credentials "
                "WHERE tenant_id = :tenant_id AND channel = :channel"
            ),
            {"tenant_id": tenant_id, "channel": channel},
        )
        rows = result.fetchall()
        return {row.credential_key: decrypt(row.encrypted_value) for row in rows}

    async def list_configured_channels(self, tenant_id: str) -> list[str]:
        result = await self._db.execute(
            text(
                "SELECT DISTINCT channel FROM tenant_credentials WHERE tenant_id = :tenant_id"
            ),
            {"tenant_id": tenant_id},
        )
        return [row.channel for row in result.fetchall()]

    async def delete_channel_credentials(self, tenant_id: str, channel: str):
        await self._db.execute(
            text(
                "DELETE FROM tenant_credentials "
                "WHERE tenant_id = :tenant_id AND channel = :channel"
            ),
            {"tenant_id": tenant_id, "channel": channel},
        )
        await self._db.commit()
