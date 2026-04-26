import stripe
from fastapi import HTTPException

from app.core.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


def create_payment_intent(amount: int, currency: str, metadata: dict | None = None) -> stripe.PaymentIntent:
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    charge_amount = int(amount * 100)
    return stripe.PaymentIntent.create(
        amount=charge_amount,
        currency=currency,
        metadata=metadata or {}
    )


def create_customer(email: str) -> stripe.Customer:
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    return stripe.Customer.create(email=email)


def create_subscription(customer_id: str, price_id: str, metadata: dict | None = None) -> stripe.Subscription:
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    return stripe.Subscription.create(
        customer=customer_id,
        items=[{"price": price_id}],
        payment_behavior="default_incomplete",
        expand=["latest_invoice.payment_intent"],
        metadata=metadata or {}
    )


def cancel_stripe_subscription(subscription_id: str) -> stripe.Subscription:
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    return stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)


def create_billing_portal_session(customer_id: str, return_url: str):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    return stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)
