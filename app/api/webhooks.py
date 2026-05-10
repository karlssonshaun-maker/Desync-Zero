import hmac
import hashlib
import base64
import logging
from typing import Annotated

from fastapi import APIRouter, Request, HTTPException, Depends, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.auth import get_current_user_from_api_key, AuthContext
from app.db.session import get_db
from app.db.redis_client import get_redis
from app.models.schemas import ShopifyOrderWebhook
from app.services.orchestrator import InventoryOrchestrator
from app.services.credential_service import CredentialService
from app.services.usage_service import UsageService

router = APIRouter(prefix="/webhook", tags=["Webhooks"])
logger = logging.getLogger(__name__)
settings = get_settings()

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _resolve_tenant_from_api_key(
    api_key: str = Depends(API_KEY_HEADER),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header",
        )
    return await get_current_user_from_api_key(api_key, db)


async def _validate_shopify_hmac(
    request: Request,
    tenant_id: str,
    db: AsyncSession,
) -> bytes:
    body = await request.body()
    credential_svc = CredentialService(db)
    webhook_secret = await credential_svc.get_credential(tenant_id, "shopify", "webhook_secret")

    if webhook_secret:
        signature_header = request.headers.get("X-Shopify-Hmac-Sha256", "")
        computed = base64.b64encode(
            hmac.new(webhook_secret.encode(), body, hashlib.sha256).digest()
        ).decode()
        if not hmac.compare_digest(computed, signature_header):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Shopify webhook signature",
            )

    return body


@router.post("/shopify/order-created", status_code=status.HTTP_202_ACCEPTED)
async def shopify_order_created(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
    ctx: Annotated[AuthContext, Depends(_resolve_tenant_from_api_key)],
):
    body = await _validate_shopify_hmac(request, ctx.tenant_id, db)

    usage_svc = UsageService(db)
    await usage_svc.enforce_order_limit(ctx.tenant_id, ctx.plan)

    try:
        webhook = ShopifyOrderWebhook.model_validate_json(body)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid webhook payload: {exc}",
        )

    logger.info(
        "Shopify order webhook: tenant=%s order=%s items=%d",
        ctx.tenant_id,
        webhook.order_number,
        len(webhook.line_items),
    )

    orchestrator = InventoryOrchestrator(db=db, redis=redis, tenant_id=ctx.tenant_id)
    results = await orchestrator.process_shopify_order(webhook)

    await usage_svc.record_orders(ctx.tenant_id, len(webhook.line_items))

    success_count = sum(1 for r in results if r.success)
    failure_count = len(results) - success_count

    return {
        "accepted": True,
        "order_id": webhook.id,
        "synced": success_count,
        "failed": failure_count,
        "results": [r.model_dump() for r in results],
    }
