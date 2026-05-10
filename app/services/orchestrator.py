import asyncio
import logging
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.models.schemas import ShopifyOrderWebhook, SyncResult
from app.services.inventory_service import InventoryService
from app.services.sync_log_service import SyncLogService
from app.services.credential_service import CredentialService
from app.services.marketplace_pusher import TakealotPusher, AmazonPusher

logger = logging.getLogger(__name__)

CHANNEL_PUSHER_MAP = {
    "takealot": TakealotPusher,
    "amazon": AmazonPusher,
}


class InventoryOrchestrator:
    def __init__(self, db: AsyncSession, redis: Redis, tenant_id: str):
        self._db = db
        self._redis = redis
        self._tenant_id = tenant_id
        self._inventory_svc = InventoryService(db, tenant_id)
        self._log_svc = SyncLogService(db, tenant_id)
        self._credential_svc = CredentialService(db)

    async def process_shopify_order(
        self, webhook: ShopifyOrderWebhook
    ) -> List[SyncResult]:
        results: List[SyncResult] = []

        for line_item in webhook.line_items:
            sku = line_item.sku
            if not sku:
                logger.warning(
                    "Order %s line item '%s' has no SKU — skipping",
                    webhook.order_number,
                    line_item.title,
                )
                continue

            sku = sku.strip().upper()

            try:
                item_results = await self._process_sku_deduction(
                    sku=sku,
                    quantity=line_item.quantity,
                    trigger_source=f"shopify_order_{webhook.order_number}",
                )
                results.extend(item_results)
            except ValueError as exc:
                logger.error(
                    "Stock deduction failed for tenant=%s sku=%s: %s",
                    self._tenant_id, sku, exc,
                )
                results.append(
                    SyncResult(sku=sku, channel="all", success=False, qty_pushed=0, error=str(exc))
                )

        return results

    async def _process_sku_deduction(
        self,
        sku: str,
        quantity: int,
        trigger_source: str,
    ) -> List[SyncResult]:
        qty_before, qty_after = await self._inventory_svc.atomic_deduct(sku, quantity)

        channel_mappings = await self._inventory_svc.get_channel_mappings(sku)
        if not channel_mappings:
            return []

        sync_tasks = [
            self._sync_to_channel(
                sku=sku,
                channel_info=mapping,
                qty_before=qty_before,
                qty_after=qty_after,
                trigger_source=trigger_source,
            )
            for mapping in channel_mappings
            if mapping["channel"] in CHANNEL_PUSHER_MAP
        ]

        return await asyncio.gather(*sync_tasks, return_exceptions=False)

    async def _sync_to_channel(
        self,
        sku: str,
        channel_info: dict,
        qty_before: int,
        qty_after: int,
        trigger_source: str,
    ) -> SyncResult:
        channel = channel_info["channel"]
        channel_sku_id = channel_info["channel_sku_id"]
        channel_product_id = channel_info.get("channel_product_id")
        qty_to_push = channel_info["available_qty"]

        log_id = await self._log_svc.create_log(
            sku=sku,
            channel=channel,
            trigger_source=trigger_source,
            qty_before=qty_before,
            qty_after=qty_after,
            qty_pushed=qty_to_push,
            status="pending",
        )

        credentials = await self._credential_svc.get_all_for_channel(self._tenant_id, channel)

        pusher_class = CHANNEL_PUSHER_MAP[channel]
        pusher = pusher_class(
            redis=self._redis,
            tenant_id=self._tenant_id,
            credentials=credentials,
        )

        push_result = await pusher.push_with_retry(
            log_id=log_id,
            sku=sku,
            channel_sku_id=channel_sku_id,
            channel_product_id=channel_product_id,
            qty=qty_to_push,
        )

        final_status = "success" if push_result.success else "failed"
        await self._log_svc.update_log(
            log_id=log_id,
            status=final_status,
            http_status_code=push_result.http_status,
            error_message=push_result.error,
            latency_ms=push_result.latency_ms,
        )

        return SyncResult(
            sku=sku,
            channel=channel,
            success=push_result.success,
            qty_pushed=qty_to_push,
            error=push_result.error,
            latency_ms=push_result.latency_ms,
        )

    async def force_sync_sku(self, sku: str, trigger_source: str = "manual") -> List[SyncResult]:
        inventory = await self._inventory_svc.get_inventory(sku)
        if not inventory:
            raise ValueError(f"SKU '{sku}' not found")

        channel_mappings = await self._inventory_svc.get_channel_mappings(sku)
        if not channel_mappings:
            return []

        sync_tasks = [
            self._sync_to_channel(
                sku=sku,
                channel_info=mapping,
                qty_before=inventory.total_qty,
                qty_after=inventory.total_qty,
                trigger_source=trigger_source,
            )
            for mapping in channel_mappings
            if mapping["channel"] in CHANNEL_PUSHER_MAP
        ]

        return await asyncio.gather(*sync_tasks, return_exceptions=False)
