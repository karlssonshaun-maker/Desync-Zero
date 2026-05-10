import asyncio
import time
import json
import logging
from abc import ABC, abstractmethod
from typing import Optional

import httpx
from redis.asyncio import Redis

from app.core.config import get_settings
from app.services.rate_limiter import TokenBucketRateLimiter

logger = logging.getLogger(__name__)
settings = get_settings()

DEAD_LETTER_QUEUE_KEY = "desync:dead_letter"
RETRY_QUEUE_KEY = "desync:retry_queue"


class MarketplacePushResult:
    def __init__(
        self,
        success: bool,
        http_status: Optional[int] = None,
        error: Optional[str] = None,
        latency_ms: Optional[int] = None,
    ):
        self.success = success
        self.http_status = http_status
        self.error = error
        self.latency_ms = latency_ms


class BaseMarketplacePusher(ABC):
    def __init__(self, redis: Redis, tenant_id: str, credentials: dict):
        self._redis = redis
        self._tenant_id = tenant_id
        self._credentials = credentials
        self._rate_limiter = TokenBucketRateLimiter(
            redis=redis,
            bucket_key=f"{tenant_id}:{self.channel_name}",
            capacity=self._rate_limit(),
            refill_rate_per_minute=self._rate_limit(),
        )

    @abstractmethod
    def _rate_limit(self) -> int:
        pass

    @abstractmethod
    async def _push_qty(
        self,
        channel_sku_id: str,
        channel_product_id: Optional[str],
        qty: int,
    ) -> MarketplacePushResult:
        pass

    @property
    @abstractmethod
    def channel_name(self) -> str:
        pass

    async def push_with_retry(
        self,
        log_id: str,
        sku: str,
        channel_sku_id: str,
        channel_product_id: Optional[str],
        qty: int,
        current_retry: int = 0,
    ) -> MarketplacePushResult:
        await self._rate_limiter.acquire_with_wait()

        start_ms = int(time.time() * 1000)
        result = await self._push_qty(channel_sku_id, channel_product_id, qty)
        result.latency_ms = int(time.time() * 1000) - start_ms

        if result.success:
            return result

        if current_retry >= settings.sync_max_retries:
            await self._send_to_dead_letter(log_id, sku, channel_sku_id, qty, result.error)
            return result

        backoff = min(
            settings.sync_base_backoff_seconds * (2 ** current_retry),
            settings.sync_max_backoff_seconds,
        )

        retry_payload = json.dumps({
            "log_id": log_id,
            "tenant_id": self._tenant_id,
            "sku": sku,
            "channel": self.channel_name,
            "channel_sku_id": channel_sku_id,
            "channel_product_id": channel_product_id,
            "qty": qty,
            "retry_count": current_retry + 1,
            "retry_after": time.time() + backoff,
        })

        await self._redis.zadd(RETRY_QUEUE_KEY, {retry_payload: time.time() + backoff})
        logger.warning(
            "Push failed for tenant=%s channel=%s sku=%s. Retry %d in %.1fs",
            self._tenant_id, self.channel_name, sku, current_retry + 1, backoff,
        )
        return result

    async def _send_to_dead_letter(
        self,
        log_id: str,
        sku: str,
        channel_sku_id: str,
        qty: int,
        error: Optional[str],
    ):
        payload = json.dumps({
            "log_id": log_id,
            "tenant_id": self._tenant_id,
            "sku": sku,
            "channel": self.channel_name,
            "channel_sku_id": channel_sku_id,
            "qty": qty,
            "error": error,
            "timestamp": time.time(),
        })
        await self._redis.rpush(DEAD_LETTER_QUEUE_KEY, payload)
        logger.error(
            "DEAD LETTER: tenant=%s channel=%s sku=%s failed after %d retries. Error: %s",
            self._tenant_id, self.channel_name, sku, settings.sync_max_retries, error,
        )


class TakealotPusher(BaseMarketplacePusher):
    channel_name = "takealot"

    def _rate_limit(self) -> int:
        return settings.takealot_rate_limit_per_minute

    async def _push_qty(
        self,
        channel_sku_id: str,
        channel_product_id: Optional[str],
        qty: int,
    ) -> MarketplacePushResult:
        api_key = self._credentials.get("api_key")
        if not api_key:
            return MarketplacePushResult(success=False, error="Takealot API key not configured")

        url = f"{settings.takealot_api_base_url}/offers/{channel_sku_id}/stock"
        headers = {
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.patch(url, json={"quantity": qty}, headers=headers)

            if response.status_code in (200, 204):
                return MarketplacePushResult(success=True, http_status=response.status_code)

            return MarketplacePushResult(
                success=False,
                http_status=response.status_code,
                error=f"Takealot API error: {response.text[:200]}",
            )

        except httpx.TimeoutException:
            return MarketplacePushResult(success=False, error="Takealot request timeout")
        except httpx.RequestError as exc:
            return MarketplacePushResult(success=False, error=f"Takealot network error: {exc}")


class AmazonPusher(BaseMarketplacePusher):
    channel_name = "amazon"

    def _rate_limit(self) -> int:
        return settings.amazon_rate_limit_per_minute

    async def _push_qty(
        self,
        channel_sku_id: str,
        channel_product_id: Optional[str],
        qty: int,
    ) -> MarketplacePushResult:
        access_token = self._credentials.get("access_token")
        marketplace_id = self._credentials.get("marketplace_id", "A1AM78C64UM0Y8")

        if not access_token:
            return MarketplacePushResult(success=False, error="Amazon access token not configured")

        url = f"https://sellingpartnerapi-eu.amazon.com/fba/inventory/v1/items/{channel_sku_id}"
        headers = {
            "x-amz-access-token": access_token,
            "Content-Type": "application/json",
        }
        payload = {
            "marketplaceIds": [marketplace_id],
            "sellerSku": channel_sku_id,
            "fulfillableQuantity": qty,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.put(url, json=payload, headers=headers)

            if response.status_code in (200, 204):
                return MarketplacePushResult(success=True, http_status=response.status_code)

            return MarketplacePushResult(
                success=False,
                http_status=response.status_code,
                error=f"Amazon API error: {response.text[:200]}",
            )

        except httpx.TimeoutException:
            return MarketplacePushResult(success=False, error="Amazon request timeout")
        except httpx.RequestError as exc:
            return MarketplacePushResult(success=False, error=f"Amazon network error: {exc}")
