import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class SyncLogService:
    def __init__(self, db: AsyncSession, tenant_id: str):
        self._db = db
        self._tenant_id = tenant_id

    async def create_log(
        self,
        sku: str,
        channel: str,
        trigger_source: str,
        qty_before: int,
        qty_after: int,
        qty_pushed: int,
        status: str = "pending",
    ) -> str:
        log_id = str(uuid.uuid4())
        await self._db.execute(
            text(
                "INSERT INTO sync_logs "
                "(id, tenant_id, universal_sku, channel, trigger_source, "
                "qty_before, qty_after, qty_pushed, status) "
                "VALUES (:id, :tid, :sku, :channel, :trigger_source, "
                ":qty_before, :qty_after, :qty_pushed, :status)"
            ),
            {
                "id": log_id,
                "tid": self._tenant_id,
                "sku": sku,
                "channel": channel,
                "trigger_source": trigger_source,
                "qty_before": qty_before,
                "qty_after": qty_after,
                "qty_pushed": qty_pushed,
                "status": status,
            },
        )
        await self._db.commit()
        return log_id

    async def update_log(
        self,
        log_id: str,
        status: str,
        http_status_code: Optional[int] = None,
        error_message: Optional[str] = None,
        retry_count: int = 0,
        latency_ms: Optional[int] = None,
    ):
        resolved_at_expr = "NOW()" if status in ("success", "dead_letter") else "NULL"
        await self._db.execute(
            text(
                f"UPDATE sync_logs SET "
                f"status = :status, "
                f"http_status_code = :http_status_code, "
                f"error_message = :error_message, "
                f"retry_count = :retry_count, "
                f"latency_ms = :latency_ms, "
                f"resolved_at = {resolved_at_expr} "
                f"WHERE id = :log_id AND tenant_id = :tid"
            ),
            {
                "log_id": log_id,
                "tid": self._tenant_id,
                "status": status,
                "http_status_code": http_status_code,
                "error_message": error_message,
                "retry_count": retry_count,
                "latency_ms": latency_ms,
            },
        )
        await self._db.commit()
