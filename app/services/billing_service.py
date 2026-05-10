import logging
from typing import Optional
import stripe
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PLANS = {
    "free": {
        "display_name": "Free",
        "price_zar_cents": 0,
        "orders_per_month": 100,
        "skus": 50,
        "channels": 1,
        "stripe_price_id": None,
    },
    "starter": {
        "display_name": "Starter",
        "price_zar_cents": 49900,
        "orders_per_month": 500,
        "skus": 200,
        "channels": 2,
        "stripe_price_id": settings.stripe_price_starter,
    },
    "pro": {
        "display_name": "Pro",
        "price_zar_cents": 99900,
        "orders_per_month": 2000,
        "skus": -1,
        "channels": -1,
        "stripe_price_id": settings.stripe_price_pro,
    },
    "enterprise": {
        "display_name": "Enterprise",
        "price_zar_cents": 249900,
        "orders_per_month": -1,
        "skus": -1,
        "channels": -1,
        "stripe_price_id": settings.stripe_price_enterprise,
    },
}


class BillingService:
    def __init__(self, db: AsyncSession):
        self._db = db
        stripe.api_key = settings.stripe_secret_key

    async def create_stripe_customer(self, tenant_id: str, email: str, name: str) -> str:
        customer = stripe.Customer.create(
            email=email,
            name=name,
            metadata={"tenant_id": tenant_id},
        )
        await self._db.execute(
            text("UPDATE tenants SET stripe_customer_id = :cid WHERE id = :tid"),
            {"cid": customer.id, "tid": tenant_id},
        )
        await self._db.commit()
        return customer.id

    async def create_checkout_session(
        self,
        tenant_id: str,
        plan: str,
        success_url: str,
        cancel_url: str,
    ) -> str:
        plan_data = PLANS.get(plan)
        if not plan_data or not plan_data["stripe_price_id"]:
            raise ValueError(f"Plan '{plan}' is not a paid plan or does not exist")

        result = await self._db.execute(
            text("SELECT stripe_customer_id FROM tenants WHERE id = :tid"),
            {"tid": tenant_id},
        )
        row = result.fetchone()
        customer_id = row.stripe_customer_id if row else None

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": plan_data["stripe_price_id"], "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"tenant_id": tenant_id, "plan": plan},
        )
        return session.url

    async def handle_webhook(self, payload: bytes, sig_header: str):
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.stripe_webhook_secret
            )
        except stripe.error.SignatureVerificationError:
            raise ValueError("Invalid Stripe webhook signature")

        if event["type"] == "checkout.session.completed":
            await self._handle_checkout_completed(event["data"]["object"])

        elif event["type"] in ("customer.subscription.updated", "customer.subscription.deleted"):
            await self._handle_subscription_change(event["data"]["object"])

        elif event["type"] == "invoice.payment_failed":
            await self._handle_payment_failed(event["data"]["object"])

    async def _handle_checkout_completed(self, session: dict):
        tenant_id = session["metadata"].get("tenant_id")
        plan = session["metadata"].get("plan")
        subscription_id = session.get("subscription")
        if not tenant_id or not plan or not subscription_id:
            return

        sub = stripe.Subscription.retrieve(subscription_id)

        await self._db.execute(
            text("UPDATE tenants SET plan = :plan WHERE id = :tid"),
            {"plan": plan, "tid": tenant_id},
        )
        await self._db.execute(
            text(
                "INSERT INTO subscriptions "
                "(tenant_id, stripe_subscription_id, stripe_price_id, plan, status, "
                "current_period_start, current_period_end) "
                "VALUES (:tid, :sub_id, :price_id, :plan, :status, "
                "to_timestamp(:period_start), to_timestamp(:period_end)) "
                "ON CONFLICT (tenant_id) DO UPDATE SET "
                "stripe_subscription_id = EXCLUDED.stripe_subscription_id, "
                "stripe_price_id = EXCLUDED.stripe_price_id, "
                "plan = EXCLUDED.plan, status = EXCLUDED.status, "
                "current_period_start = EXCLUDED.current_period_start, "
                "current_period_end = EXCLUDED.current_period_end, "
                "updated_at = NOW()"
            ),
            {
                "tid": tenant_id,
                "sub_id": subscription_id,
                "price_id": sub["items"]["data"][0]["price"]["id"],
                "plan": plan,
                "status": sub["status"],
                "period_start": sub["current_period_start"],
                "period_end": sub["current_period_end"],
            },
        )
        await self._db.commit()
        logger.info("Tenant %s upgraded to plan %s", tenant_id, plan)

    async def _handle_subscription_change(self, subscription: dict):
        result = await self._db.execute(
            text("SELECT tenant_id FROM subscriptions WHERE stripe_subscription_id = :sid"),
            {"sid": subscription["id"]},
        )
        row = result.fetchone()
        if not row:
            return

        new_status = subscription["status"]
        plan = "free" if new_status in ("canceled", "unpaid", "past_due") else None

        await self._db.execute(
            text(
                "UPDATE subscriptions SET status = :status, updated_at = NOW(), "
                "cancel_at_period_end = :cancel "
                "WHERE stripe_subscription_id = :sid"
            ),
            {
                "status": new_status,
                "cancel": subscription.get("cancel_at_period_end", False),
                "sid": subscription["id"],
            },
        )
        if plan:
            await self._db.execute(
                text("UPDATE tenants SET plan = :plan WHERE id = :tid"),
                {"plan": plan, "tid": str(row.tenant_id)},
            )
        await self._db.commit()

    async def _handle_payment_failed(self, invoice: dict):
        customer_id = invoice.get("customer")
        if not customer_id:
            return
        result = await self._db.execute(
            text("SELECT id FROM tenants WHERE stripe_customer_id = :cid"),
            {"cid": customer_id},
        )
        row = result.fetchone()
        if row:
            logger.error("Payment failed for tenant %s", str(row.id))

    @staticmethod
    def get_plans() -> dict:
        return {
            k: {
                "display_name": v["display_name"],
                "price_zar_cents": v["price_zar_cents"],
                "orders_per_month": v["orders_per_month"],
                "skus": v["skus"],
                "channels": v["channels"],
            }
            for k, v in PLANS.items()
        }
