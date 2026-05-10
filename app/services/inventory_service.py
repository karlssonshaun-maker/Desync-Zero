from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.schemas import InventoryRecord


class InventoryService:
    def __init__(self, db: AsyncSession, tenant_id: str):
        self._db = db
        self._tenant_id = tenant_id

    async def get_inventory(self, sku: str) -> Optional[InventoryRecord]:
        result = await self._db.execute(
            text(
                "SELECT sku, product_name, total_qty, safety_buffer, available_qty, "
                "last_updated, version FROM universal_inventory "
                "WHERE tenant_id = :tid AND sku = :sku"
            ),
            {"tid": self._tenant_id, "sku": sku},
        )
        row = result.fetchone()
        if not row:
            return None
        return InventoryRecord(
            sku=row.sku,
            product_name=row.product_name,
            total_qty=row.total_qty,
            safety_buffer=row.safety_buffer,
            available_qty=row.available_qty,
            last_updated=row.last_updated,
            version=row.version,
        )

    async def create_inventory(
        self,
        sku: str,
        product_name: str,
        total_qty: int,
        safety_buffer: int = 0,
    ) -> InventoryRecord:
        await self._db.execute(
            text(
                "INSERT INTO universal_inventory (tenant_id, sku, product_name, total_qty, safety_buffer) "
                "VALUES (:tid, :sku, :product_name, :total_qty, :safety_buffer) "
                "ON CONFLICT (tenant_id, sku) DO UPDATE SET "
                "product_name = EXCLUDED.product_name, "
                "total_qty = EXCLUDED.total_qty, "
                "safety_buffer = EXCLUDED.safety_buffer, "
                "last_updated = NOW(), "
                "version = universal_inventory.version + 1"
            ),
            {
                "tid": self._tenant_id,
                "sku": sku,
                "product_name": product_name,
                "total_qty": total_qty,
                "safety_buffer": safety_buffer,
            },
        )
        await self._db.commit()
        return await self.get_inventory(sku)

    async def atomic_deduct(self, sku: str, quantity: int) -> tuple[int, int]:
        result = await self._db.execute(
            text(
                "UPDATE universal_inventory "
                "SET total_qty = total_qty - :qty, "
                "    last_updated = NOW(), "
                "    version = version + 1 "
                "WHERE tenant_id = :tid AND sku = :sku AND total_qty >= :qty "
                "RETURNING total_qty + :qty AS qty_before, total_qty AS qty_after"
            ),
            {"tid": self._tenant_id, "sku": sku, "qty": quantity},
        )
        row = result.fetchone()
        if not row:
            raise ValueError(
                f"Insufficient stock for SKU '{sku}' or SKU not found. Requested: {quantity}"
            )
        await self._db.commit()
        return row.qty_before, row.qty_after

    async def set_total_qty(self, sku: str, new_total_qty: int) -> tuple[int, int]:
        result = await self._db.execute(
            text(
                "UPDATE universal_inventory "
                "SET total_qty = :new_qty, last_updated = NOW(), version = version + 1 "
                "WHERE tenant_id = :tid AND sku = :sku "
                "RETURNING (SELECT total_qty FROM universal_inventory "
                "           WHERE tenant_id = :tid AND sku = :sku) AS qty_before, "
                ":new_qty AS qty_after"
            ),
            {"tid": self._tenant_id, "sku": sku, "new_qty": new_total_qty},
        )
        row = result.fetchone()
        if not row:
            raise ValueError(f"SKU '{sku}' not found")
        await self._db.commit()
        return row.qty_before, row.qty_after

    async def get_channel_mappings(self, sku: str) -> list[dict]:
        result = await self._db.execute(
            text(
                "SELECT cm.channel, cm.channel_sku_id, cm.channel_product_id, "
                "ui.available_qty "
                "FROM channel_mapping cm "
                "JOIN universal_inventory ui ON ui.sku = cm.universal_sku "
                "    AND ui.tenant_id = cm.tenant_id "
                "WHERE cm.tenant_id = :tid AND cm.universal_sku = :sku AND cm.is_active = TRUE"
            ),
            {"tid": self._tenant_id, "sku": sku},
        )
        rows = result.fetchall()
        return [
            {
                "channel": row.channel,
                "channel_sku_id": row.channel_sku_id,
                "channel_product_id": row.channel_product_id,
                "available_qty": row.available_qty,
            }
            for row in rows
        ]
