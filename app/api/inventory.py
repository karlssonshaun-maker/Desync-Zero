import uuid
import logging
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis
from sqlalchemy import text

from app.db.session import get_db
from app.db.redis_client import get_redis
from app.core.auth import AuthContext, get_current_user, get_current_user_from_api_key
from app.models.schemas import (
    InventoryRecord,
    InventoryCreateRequest,
    InventoryUpdateRequest,
    ChannelMappingCreateRequest,
    ChannelMappingRecord,
    SyncResult,
)
from app.services.inventory_service import InventoryService
from app.services.orchestrator import InventoryOrchestrator
from app.services.usage_service import UsageService

router = APIRouter(prefix="/inventory", tags=["Inventory"])
logger = logging.getLogger(__name__)

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _get_ctx(
    api_key: str = Depends(API_KEY_HEADER),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    if api_key:
        return await get_current_user_from_api_key(api_key, db)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-API-Key header")


@router.get("/", response_model=List[InventoryRecord])
async def list_inventory(
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        text(
            "SELECT sku, product_name, total_qty, safety_buffer, available_qty, last_updated, version "
            "FROM universal_inventory WHERE tenant_id = :tid ORDER BY last_updated DESC"
        ),
        {"tid": ctx.tenant_id},
    )
    rows = result.fetchall()
    return [
        InventoryRecord(
            sku=r.sku, product_name=r.product_name, total_qty=r.total_qty,
            safety_buffer=r.safety_buffer, available_qty=r.available_qty,
            last_updated=r.last_updated, version=r.version,
        )
        for r in rows
    ]


@router.get("/logs")
async def list_sync_logs(
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    offset: int = 0,
    status_filter: str = None,
    channel_filter: str = None,
):
    conditions = ["tenant_id = :tid"]
    params = {"tid": ctx.tenant_id, "limit": limit, "offset": offset}
    if status_filter:
        conditions.append("status = :status_filter")
        params["status_filter"] = status_filter
    if channel_filter:
        conditions.append("channel = :channel_filter")
        params["channel_filter"] = channel_filter
    where = " AND ".join(conditions)
    result = await db.execute(
        text(
            f"SELECT id, universal_sku, channel, trigger_source, qty_before, qty_after, "
            f"qty_pushed, status, http_status_code, error_message, retry_count, latency_ms, "
            f"created_at, resolved_at FROM sync_logs WHERE {where} "
            f"ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
        ),
        params,
    )
    rows = result.fetchall()
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM sync_logs WHERE {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = count_result.scalar() or 0
    return {
        "total": total,
        "items": [
            {
                "id": str(r.id), "sku": r.universal_sku, "channel": r.channel,
                "trigger_source": r.trigger_source, "qty_before": r.qty_before,
                "qty_after": r.qty_after, "qty_pushed": r.qty_pushed, "status": r.status,
                "http_status_code": r.http_status_code, "error_message": r.error_message,
                "retry_count": r.retry_count, "latency_ms": r.latency_ms,
                "created_at": r.created_at, "resolved_at": r.resolved_at,
            }
            for r in rows
        ],
    }


@router.get("/{sku}", response_model=InventoryRecord)
async def get_inventory(
    sku: str,
    ctx: Annotated[AuthContext, Depends(_get_ctx)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db, ctx.tenant_id)
    record = await svc.get_inventory(sku.upper())
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU '{sku}' not found")
    return record


@router.post("/", response_model=InventoryRecord, status_code=status.HTTP_201_CREATED)
async def create_inventory(
    payload: InventoryCreateRequest,
    ctx: Annotated[AuthContext, Depends(_get_ctx)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    usage_svc = UsageService(db)
    await usage_svc.enforce_sku_limit(ctx.tenant_id, ctx.plan)

    svc = InventoryService(db, ctx.tenant_id)
    record = await svc.create_inventory(
        sku=payload.sku,
        product_name=payload.product_name,
        total_qty=payload.total_qty,
        safety_buffer=payload.safety_buffer,
    )

    # Invalidate SKU count cache so next enforce/dashboard read is accurate
    await usage_svc.invalidate_skus(ctx.tenant_id)
    return record


@router.patch("/{sku}", response_model=InventoryRecord)
async def update_inventory(
    sku: str,
    payload: InventoryUpdateRequest,
    ctx: Annotated[AuthContext, Depends(_get_ctx)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
):
    svc = InventoryService(db, ctx.tenant_id)
    existing = await svc.get_inventory(sku.upper())
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU '{sku}' not found")

    await svc.set_total_qty(sku.upper(), payload.new_total_qty)

    orchestrator = InventoryOrchestrator(db=db, redis=redis, tenant_id=ctx.tenant_id)
    await orchestrator.force_sync_sku(sku=sku.upper(), trigger_source=payload.trigger_source)

    return await svc.get_inventory(sku.upper())


@router.post("/{sku}/sync", response_model=List[SyncResult])
async def force_sync(
    sku: str,
    ctx: Annotated[AuthContext, Depends(_get_ctx)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
):
    orchestrator = InventoryOrchestrator(db=db, redis=redis, tenant_id=ctx.tenant_id)
    try:
        return await orchestrator.force_sync_sku(sku=sku.upper(), trigger_source="manual_sync")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/mappings/", response_model=ChannelMappingRecord, status_code=status.HTTP_201_CREATED)
async def create_channel_mapping(
    payload: ChannelMappingCreateRequest,
    ctx: Annotated[AuthContext, Depends(_get_ctx)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    usage_svc = UsageService(db)
    await usage_svc.enforce_channel_limit(ctx.tenant_id, ctx.plan)

    mapping_id = str(uuid.uuid4())
    try:
        await db.execute(
            text(
                "INSERT INTO channel_mapping "
                "(id, tenant_id, universal_sku, channel, channel_sku_id, channel_product_id) "
                "VALUES (:id, :tid, :sku, :channel, :channel_sku_id, :channel_product_id) "
                "ON CONFLICT (tenant_id, universal_sku, channel) DO UPDATE SET "
                "channel_sku_id = EXCLUDED.channel_sku_id, "
                "channel_product_id = EXCLUDED.channel_product_id, "
                "is_active = TRUE"
            ),
            {
                "id": mapping_id,
                "tid": ctx.tenant_id,
                "sku": payload.universal_sku.upper(),
                "channel": payload.channel.value,
                "channel_sku_id": payload.channel_sku_id,
                "channel_product_id": payload.channel_product_id,
            },
        )
        await db.commit()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create mapping: {exc}",
        )

    # Invalidate channel count cache
    await usage_svc.invalidate_channels(ctx.tenant_id)

    result = await db.execute(
        text(
            "SELECT id, universal_sku, channel, channel_sku_id, channel_product_id, "
            "is_active, created_at FROM channel_mapping "
            "WHERE tenant_id = :tid AND universal_sku = :sku AND channel = :channel"
        ),
        {"tid": ctx.tenant_id, "sku": payload.universal_sku.upper(), "channel": payload.channel.value},
    )
    row = result.fetchone()
    return ChannelMappingRecord(
        id=str(row.id),
        universal_sku=row.universal_sku,
        channel=row.channel,
        channel_sku_id=row.channel_sku_id,
        channel_product_id=row.channel_product_id,
        is_active=row.is_active,
        created_at=row.created_at,
    )
