import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.redis_client import close_redis
from app.api import health, inventory, webhooks, auth, tenants, billing

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The retry worker runs in its own dedicated container (worker.py).
    # Nothing to start here — keeping the API process clean and stateless
    # so it can safely scale to any number of Uvicorn workers/replicas.
    yield
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="E-commerce Stock Orchestration Engine — Multi-Tenant SaaS",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(billing.router)
app.include_router(webhooks.router)
app.include_router(inventory.router)
