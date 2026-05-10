"""
UsageService — tenant plan limit enforcement + usage reporting.

CACHING STRATEGY
────────────────
COUNT(*) queries on large tables are expensive. We cache three counters
in Redis with a short TTL so enforcement checks on every SKU/mapping
creation are O(1) reads instead of full table scans.

  Cache keys (per tenant):
    desync:usage:{tenant_id}:orders:{YYYY-MM}   → monthly order count
    desync:usage:{tenant_id}:skus                → active SKU count
    desync:usage:{tenant_id}:channels            → active channel count

Write-through invalidation:
  Any method that changes the underlying data calls _invalidate() first,
  so the next read always rehydrates from Postgres. This keeps the cache
  consistent without complex cache-update logic.

TTL:
  60 seconds. Short enough to feel live in the dashboard, long enough to
  absorb a Black Friday burst of thousands of concurrent limit checks.
"""
from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.db.redis_client import get_redis
from app.services.billing_service import PLANS

# Cache TTL in seconds — tune upward if DB load becomes an issue
USAGE_CACHE_TTL = 60


def _orders_key(tenant_id: str) -> str:
    month = date.today().strftime("%Y-%m")
    return f"desync:usage:{tenant_id}:orders:{month}"


def _skus_key(tenant_id: str) -> str:
    return f"desync:usage:{tenant_id}:skus"


def _channels_key(tenant_id: str) -> str:
    return f"desync:usage:{tenant_id}:channels"


class UsageService:
    def __init__(self, db: AsyncSession):
        self._db = db

    # ──────────────────────────────────────────────
    # Cache invalidation
    # ──────────────────────────────────────────────

    async def invalidate_skus(self, tenant_id: str):
        """Call after creating or deleting a SKU."""
        redis = await get_redis()
        await redis.delete(_skus_key(tenant_id))

    async def invalidate_channels(self, tenant_id: str):
        """Call after adding or removing a channel mapping."""
        redis = await get_redis()
        await redis.delete(_channels_key(tenant_id))

    async def invalidate_orders(self, tenant_id: str):
        """Call after recording a new order event."""
        redis = await get_redis()
        await redis.delete(_orders_key(tenant_id))

    # ──────────────────────────────────────────────
    # Write path — record usage event
    # ──────────────────────────────────────────────

    async def record_orders(self, tenant_id: str, quantity: int = 1):
        await self._db.execute(
            text(
                "INSERT INTO usage_events (tenant_id, event_type, quantity, period_start) "
                "VALUES (:tid, 'order_processed', :qty, date_trunc('month', CURRENT_DATE)::date) "
                "ON CONFLICT DO NOTHING"
            ),
            {"tid": tenant_id, "qty": quantity},
        )
        await self._db.commit()
        await self.invalidate_orders(tenant_id)

    # ──────────────────────────────────────────────
    # Read path — cached COUNT queries
    # ──────────────────────────────────────────────

    async def get_monthly_orders(self, tenant_id: str) -> int:
        redis = await get_redis()
        key = _orders_key(tenant_id)

        cached = await redis.get(key)
        if cached is not None:
            return int(cached)

        result = await self._db.execute(
            text(
                "SELECT COALESCE(SUM(quantity), 0) AS total "
                "FROM usage_events "
                "WHERE tenant_id = :tid "
                "AND event_type = 'order_processed' "
                "AND period_start = date_trunc('month', CURRENT_DATE)::date"
            ),
            {"tid": tenant_id},
        )
        count = int(result.scalar() or 0)
        await redis.set(key, count, ex=USAGE_CACHE_TTL)
        return count

    async def get_active_skus(self, tenant_id: str) -> int:
        redis = await get_redis()
        key = _skus_key(tenant_id)

        cached = await redis.get(key)
        if cached is not None:
            return int(cached)

        result = await self._db.execute(
            text("SELECT COUNT(*) FROM universal_inventory WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        )
        count = int(result.scalar() or 0)
        await redis.set(key, count, ex=USAGE_CACHE_TTL)
        return count

    async def get_active_channels(self, tenant_id: str) -> int:
        redis = await get_redis()
        key = _channels_key(tenant_id)

        cached = await redis.get(key)
        if cached is not None:
            return int(cached)

        result = await self._db.execute(
            text(
                "SELECT COUNT(DISTINCT channel) FROM channel_mapping "
                "WHERE tenant_id = :tid AND is_active = TRUE"
            ),
            {"tid": tenant_id},
        )
        count = int(result.scalar() or 0)
        await redis.set(key, count, ex=USAGE_CACHE_TTL)
        return count

    # ──────────────────────────────────────────────
    # Enforcement — called before writes
    # ──────────────────────────────────────────────

    async def enforce_order_limit(self, tenant_id: str, plan: str):
        plan_limits = PLANS.get(plan, PLANS["free"])
        monthly_limit = plan_limits["orders_per_month"]
        if monthly_limit == -1:
            return

        current = await self.get_monthly_orders(tenant_id)
        if current >= monthly_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Monthly order limit of {monthly_limit} reached for your '{plan}' plan. "
                    "Upgrade at /billing/checkout to continue processing orders."
                ),
            )

    async def enforce_sku_limit(self, tenant_id: str, plan: str):
        plan_limits = PLANS.get(plan, PLANS["free"])
        sku_limit = plan_limits["skus"]
        if sku_limit == -1:
            return

        current = await self.get_active_skus(tenant_id)
        if current >= sku_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"SKU limit of {sku_limit} reached for your '{plan}' plan. "
                    "Upgrade at /billing/checkout to add more SKUs."
                ),
            )

    async def enforce_channel_limit(self, tenant_id: str, plan: str):
        plan_limits = PLANS.get(plan, PLANS["free"])
        channel_limit = plan_limits["channels"]
        if channel_limit == -1:
            return

        current = await self.get_active_channels(tenant_id)
        if current >= channel_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Channel limit of {channel_limit} reached for your '{plan}' plan. "
                    "Upgrade at /billing/checkout to connect more channels."
                ),
            )

    # ──────────────────────────────────────────────
    # Dashboard summary
    # ──────────────────────────────────────────────

    async def get_usage_summary(self, tenant_id: str, plan: str) -> dict:
        plan_limits = PLANS.get(plan, PLANS["free"])
        orders = await self.get_monthly_orders(tenant_id)
        skus = await self.get_active_skus(tenant_id)
        channels = await self.get_active_channels(tenant_id)

        def fmt(used: int, limit: int) -> dict:
            return {
                "used": used,
                "limit": limit if limit != -1 else "unlimited",
                "percent": round((used / limit) * 100, 1) if limit != -1 else 0,
            }

        return {
            "orders_this_month": fmt(orders, plan_limits["orders_per_month"]),
            "active_skus": fmt(skus, plan_limits["skus"]),
            "active_channels": fmt(channels, plan_limits["channels"]),
        }
