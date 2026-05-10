from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from redis.asyncio import Redis

from app.db.session import get_db
from app.db.redis_client import get_redis
from app.core.config import get_settings
from app.models.schemas import HealthStatus

router = APIRouter(tags=["Health"])
settings = get_settings()


@router.get("/health", response_model=HealthStatus)
async def health_check(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    db_status = "unreachable"
    redis_status = "unreachable"

    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        pass

    try:
        await redis.ping()
        redis_status = "ok"
    except Exception:
        pass

    overall = "healthy" if db_status == "ok" and redis_status == "ok" else "degraded"

    return HealthStatus(
        status=overall,
        database=db_status,
        redis=redis_status,
        version=settings.app_version,
        timestamp=datetime.now(timezone.utc),
    )
