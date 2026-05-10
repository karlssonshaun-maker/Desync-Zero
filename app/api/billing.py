from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_db
from app.core.auth import AuthContext, get_current_user
from app.core.config import get_settings
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["Billing"])
settings = get_settings()


class CheckoutRequest(BaseModel):
    plan: str
    success_url: str
    cancel_url: str


@router.get("/plans")
async def list_plans():
    return BillingService.get_plans()


@router.post("/checkout")
async def create_checkout(
    payload: CheckoutRequest,
    ctx: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = BillingService(db)

    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured on this instance",
        )

    try:
        checkout_url = await svc.create_checkout_session(
            tenant_id=ctx.tenant_id,
            plan=payload.plan,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return {"checkout_url": checkout_url}


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")

    svc = BillingService(db)
    try:
        await svc.handle_webhook(payload, sig_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return {"received": True}
