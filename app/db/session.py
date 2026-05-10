"""
Database session factory.

Connection pooling strategy
───────────────────────────
In production (docker-compose / Kubernetes), all connections are brokered
through PgBouncer running in transaction-pooling mode. This means:

  App → PgBouncer (pools N connections to Postgres) → Postgres

Because PgBouncer already pools aggressively, we use SQLAlchemy's NullPool
so the app does NOT maintain its own second layer of pooled connections.
Two layers of pooling wastes Postgres max_connections and causes confusion.

In local development without PgBouncer (DATABASE_URL points directly to
Postgres), SQLAlchemy's default pool is fine. Set USE_PGBOUNCER=false in
your .env to skip NullPool.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool
from app.core.config import get_settings

settings = get_settings()

# PgBouncer manages the connection pool in production — SQLAlchemy should
# not maintain its own pool on top of it (NullPool = no pooling in SQLAlchemy).
# Without PgBouncer, use AsyncAdaptedQueuePool with sensible defaults.
_pool_kwargs = (
    {"poolclass": NullPool}
    if settings.use_pgbouncer
    else {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
    }
)

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    **_pool_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
