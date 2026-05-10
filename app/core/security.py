import hashlib
import hmac
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.session import get_db

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def verify_api_key(
    api_key: str = Security(API_KEY_HEADER),
    db: AsyncSession = Depends(get_db),
) -> str:
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
        )

    key_hash = hash_api_key(api_key)

    result = await db.execute(
        text(
            "SELECT id, name FROM api_keys WHERE key_hash = :key_hash AND is_active = TRUE"
        ),
        {"key_hash": key_hash},
    )
    record = result.fetchone()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or inactive API key",
        )

    await db.execute(
        text("UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = :key_hash"),
        {"key_hash": key_hash},
    )
    await db.commit()

    return record.name


def verify_shopify_webhook(body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    import base64
    mac = hmac.new(secret.encode(), body, hashlib.sha256)
    computed = base64.b64encode(mac.digest()).decode()

    return hmac.compare_digest(computed, signature_header)
