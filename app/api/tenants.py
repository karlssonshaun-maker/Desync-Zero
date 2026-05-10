from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_db
from app.db.redis_client import get_redis
from app.core.auth import AuthContext, get_current_user
from app.services.tenant_service import TenantService
from app.services.credential_service import CredentialService
from app.services.usage_service import UsageService

router = APIRouter(prefix="/tenant", tags=["Tenant"])


class CredentialUpsertRequest(BaseModel):
    channel: str
    credential_key: str
    value: str


class ApiKeyCreateRequest(BaseModel):
    name: str


@router.get("/me")
async def get_my_tenant(
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TenantService(db)
    tenant = await svc.get_tenant(ctx.tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


@router.get("/usage")
async def get_usage(
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UsageService(db)
    return await svc.get_usage_summary(ctx.tenant_id, ctx.plan)


@router.post("/credentials", status_code=status.HTTP_201_CREATED)
async def upsert_credential(
    payload: CredentialUpsertRequest,
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = CredentialService(db)
    await svc.set_credential(
        tenant_id=ctx.tenant_id,
        channel=payload.channel,
        credential_key=payload.credential_key,
        value=payload.value,
    )
    return {"message": f"Credential '{payload.credential_key}' for '{payload.channel}' saved"}


@router.get("/credentials/channels")
async def list_credential_channels(
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = CredentialService(db)
    channels = await svc.list_configured_channels(ctx.tenant_id)
    return {"configured_channels": channels}


@router.delete("/credentials/{channel}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel_credentials(
    channel: str,
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = CredentialService(db)
    await svc.delete_channel_credentials(ctx.tenant_id, channel)


@router.post("/api-keys", status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TenantService(db)
    raw_key = await svc.create_api_key(ctx.tenant_id, payload.name)
    return {
        "api_key": raw_key,
        "warning": "Store this key securely. It will not be shown again.",
    }


@router.get("/api-keys")
async def list_api_keys(
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TenantService(db)
    return await svc.list_api_keys(ctx.tenant_id)


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TenantService(db)
    await svc.revoke_api_key(ctx.tenant_id, key_id)
