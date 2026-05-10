"""
Retry worker — processes the Redis sorted-set retry queue.

CONCURRENCY SAFETY
──────────────────
Uses a Redis distributed lock (SET NX PX) before each processing cycle.
Only the instance that wins the lock touches the queue, so you can safely
run multiple replicas (e.g. rolling deploys) without duplicate pushes.
The lock auto-expires after LOCK_TTL_MS milliseconds — if the worker
crashes mid-cycle the lock is released automatically.
"""
import asyncio
import json
import logging
import time
import uuid

from redis.asyncio import Redis

from app.db.session import AsyncSessionLocal
from app.db.redis_client import get_redis
from app.services.marketplace_pusher import (
    RETRY_QUEUE_KEY,
    TakealotPusher,
    AmazonPusher,
)
from app.services.sync_log_service import SyncLogService
from app.services.credential_service import CredentialService

logger = logging.getLogger(__name__)

CHANNEL_PUSHER_MAP = {
    "takealot": TakealotPusher,
    "amazon": AmazonPusher,
}

# How long (ms) the distributed lock is held per processing cycle.
# Must be longer than one full cycle could realistically take.
LOCK_KEY = "desync:worker_lock"
LOCK_TTL_MS = 30_000  # 30 seconds


async def _try_acquire_lock(redis: Redis) -> str | None:
    """
    Attempt to acquire the distributed lock.
    Returns the lock token (str) on success, None if another worker holds it.
    Uses SET NX PX — atomic, no SETNX + EXPIRE race condition.
    """
    token = str(uuid.uuid4())
    acquired = await redis.set(LOCK_KEY, token, nx=True, px=LOCK_TTL_MS)
    return token if acquired else None


async def _release_lock(redis: Redis, token: str):
    """
    Release the lock only if we still own it (Lua script for atomicity).
    Prevents a slow worker from releasing a lock already reacquired by another.
    """
    release_script = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
    """
    await redis.eval(release_script, 1, LOCK_KEY, token)


async def process_retry_queue():
    redis: Redis = await get_redis()

    token = await _try_acquire_lock(redis)
    if token is None:
        logger.debug("Retry lock held by another worker — skipping this cycle")
        return

    try:
        now = time.time()
        due_items = await redis.zrangebyscore(
            RETRY_QUEUE_KEY, "-inf", now, start=0, num=10
        )
        if not due_items:
            return

        for raw_item in due_items:
            # Remove from queue immediately — if processing fails the item
            # will be re-queued by push_with_retry or sent to dead-letter.
            removed = await redis.zrem(RETRY_QUEUE_KEY, raw_item)
            if removed == 0:
                # Another worker beat us to it (shouldn't happen with lock, but be safe)
                continue

            try:
                item = json.loads(raw_item)
            except json.JSONDecodeError:
                logger.error("Malformed retry queue item: %s", raw_item)
                continue

            channel = item.get("channel")
            tenant_id = item.get("tenant_id")
            pusher_class = CHANNEL_PUSHER_MAP.get(channel)

            if not pusher_class or not tenant_id:
                logger.error(
                    "Invalid retry item — channel=%s tenant=%s", channel, tenant_id
                )
                continue

            async with AsyncSessionLocal() as db:
                credential_svc = CredentialService(db)
                credentials = await credential_svc.get_all_for_channel(
                    tenant_id, channel
                )

                pusher = pusher_class(
                    redis=redis,
                    tenant_id=tenant_id,
                    credentials=credentials,
                )

                result = await pusher.push_with_retry(
                    log_id=item["log_id"],
                    sku=item["sku"],
                    channel_sku_id=item["channel_sku_id"],
                    channel_product_id=item.get("channel_product_id"),
                    qty=item["qty"],
                    current_retry=item["retry_count"],
                )

                log_svc = SyncLogService(db, tenant_id)
                sync_status = "success" if result.success else "retrying"
                await log_svc.update_log(
                    log_id=item["log_id"],
                    status=sync_status,
                    http_status_code=result.http_status,
                    error_message=result.error,
                    retry_count=item["retry_count"],
                    latency_ms=result.latency_ms,
                )

            if result.success:
                logger.info(
                    "Retry succeeded: tenant=%s channel=%s sku=%s attempt=%d",
                    tenant_id, channel, item["sku"], item["retry_count"],
                )
    finally:
        await _release_lock(redis, token)


async def retry_worker_loop(poll_interval_seconds: float = 5.0):
    logger.info("Retry worker started — polling every %.1fs", poll_interval_seconds)
    while True:
        try:
            await process_retry_queue()
        except Exception as exc:
            logger.exception("Retry worker error: %s", exc)
        await asyncio.sleep(poll_interval_seconds)
