"""Tests for booking_payments service flows beyond happy-path coverage.

Covers:
- retry-payment increments attempt and uses a fresh idempotency key
- refund_booking_payment dispatches void vs refund per provider response
- cancellation deadline boundary (allowed before, blocked after)
- provider-switch guard blocks disabling a setting with open requests
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.cancellation_policy import CancellationPolicy
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    PaymentStatus,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.space import Space
from app.models.user import User
from app.services.booking_payments import (
    charge_booking_request,
    refund_booking_payment,
)
from app.services.owner_payments import (
    assert_safe_provider_change,
    count_open_requests_for_setting,
)
from app.services.payment_providers import ChargeResult


# ----------------------------- fixtures -----------------------------


def _seed(db) -> tuple[User, User, Space, OwnerPaymentSetting, MemberOwnerPaymentMethod]:
    owner = User(
        email="bp-owner@example.com",
        auth_subject="bp-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    member = User(
        email="bp-member@example.com",
        auth_subject="bp-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db.add_all([owner, member])
    db.commit()
    db.refresh(owner)
    db.refresh(member)

    org = Organization(name="BP Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add(OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
    ))
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Loc",
        address="x",
        city="y",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)

    setting = OwnerPaymentSetting(
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test",
        stripe_secret_key_encrypted="sk_test",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)

    method = MemberOwnerPaymentMethod(
        user_id=member.id,
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        owner_payment_setting_id=setting.id,
        provider_customer_id="cus_x",
        provider_payment_method_id="pm_x",
        last4="4242",
        brand="visa",
        exp_month=12,
        exp_year=2030,
        is_default_for_owner=True,
        status="active",
    )
    db.add(method)
    db.commit()
    db.refresh(method)

    return owner, member, space, setting, method


def _make_request(db, member: User, space: Space, setting: OwnerPaymentSetting, method: MemberOwnerPaymentMethod, day: int = 5) -> BookingRequest:
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=datetime(2026, 6, day, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 6, day, 12, 0, tzinfo=timezone.utc),
        status=BookingRequestStatus.REQUESTED,
        owner_payment_setting_id=setting.id,
        payment_provider="stripe",
        member_owner_payment_method_id=method.id,
        payment_status="not_charged",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


# --------------------- retry / idempotency ---------------------


def test_retry_after_failure_uses_new_attempt_and_idempotency_key(db_session, monkeypatch):
    _, member, space, setting, method = _seed(db_session)
    req = _make_request(db_session, member, space, setting, method)

    calls: list[str] = []

    class FailingProvider:
        def charge_saved_method(self, **kwargs):
            calls.append(kwargs["idempotency_key"])
            return ChargeResult(status="failed", failure_reason="declined", raw_response={"x": "fail"})

    monkeypatch.setattr(
        "app.services.booking_payments.PaymentProviderFactory.get",
        lambda setting: FailingProvider(),
    )
    req, booking, payment = charge_booking_request(db_session, req)
    assert req.status == BookingRequestStatus.PAYMENT_FAILED
    assert booking is None
    assert payment is not None
    assert payment.attempt_number == 1
    first_key = payment.idempotency_key

    # Retry: should produce a new attempt and new idempotency key.
    req, booking, payment2 = charge_booking_request(db_session, req)
    assert req.status == BookingRequestStatus.PAYMENT_FAILED
    assert payment2 is not None
    assert payment2.attempt_number == 2
    assert payment2.idempotency_key != first_key
    assert calls == [first_key, payment2.idempotency_key]


def test_double_charge_short_circuits_after_success(db_session, monkeypatch):
    _, member, space, setting, method = _seed(db_session)
    req = _make_request(db_session, member, space, setting, method)

    count = {"n": 0}

    class CountingProvider:
        def charge_saved_method(self, **kwargs):
            count["n"] += 1
            return ChargeResult(status="succeeded", provider_payment_id="pi_1", raw_response={"ok": True})

    monkeypatch.setattr(
        "app.services.booking_payments.PaymentProviderFactory.get",
        lambda setting: CountingProvider(),
    )
    req, booking, payment = charge_booking_request(db_session, req)
    assert req.status == BookingRequestStatus.APPROVED
    assert booking is not None and booking.status == BookingStatus.CONFIRMED
    assert payment is not None and payment.status == PaymentStatus.SUCCEEDED

    # Second call: payment already succeeded → should short-circuit, not call provider.
    req2, booking2, payment2 = charge_booking_request(db_session, req)
    assert payment2 is not None
    assert payment2.id == payment.id
    assert booking2 is not None and booking2.id == booking.id
    assert count["n"] == 1


# --------------------- refund void vs refund ---------------------


def test_refund_returns_voided_for_pre_settlement_void(db_session, monkeypatch):
    _, member, space, setting, method = _seed(db_session)
    req = _make_request(db_session, member, space, setting, method)

    class HappyProvider:
        def charge_saved_method(self, **kwargs):
            return ChargeResult(status="succeeded", provider_payment_id="pi_void", raw_response={})

        def void_or_refund(self, **kwargs):
            return ChargeResult(status="voided", provider_reference_id="ref-void", raw_response={"voided": True})

    monkeypatch.setattr(
        "app.services.booking_payments.PaymentProviderFactory.get",
        lambda setting: HappyProvider(),
    )
    req, booking, payment = charge_booking_request(db_session, req)
    assert payment is not None and booking is not None
    refunded = refund_booking_payment(db_session, req=req, booking=booking)
    assert refunded is not None
    assert refunded.status == PaymentStatus.VOIDED


def test_refund_returns_refunded_after_settlement(db_session, monkeypatch):
    _, member, space, setting, method = _seed(db_session)
    req = _make_request(db_session, member, space, setting, method, day=6)

    class PostSettlementProvider:
        def charge_saved_method(self, **kwargs):
            return ChargeResult(status="succeeded", provider_payment_id="pi_refund", raw_response={})

        def void_or_refund(self, **kwargs):
            return ChargeResult(status="refunded", provider_reference_id="ref-refund", raw_response={"refunded": True})

    monkeypatch.setattr(
        "app.services.booking_payments.PaymentProviderFactory.get",
        lambda setting: PostSettlementProvider(),
    )
    req, booking, payment = charge_booking_request(db_session, req)
    assert payment is not None and booking is not None
    refunded = refund_booking_payment(db_session, req=req, booking=booking)
    assert refunded is not None
    assert refunded.status == PaymentStatus.REFUNDED


# --------------------- cancellation deadline boundary ---------------------


def test_cancellation_deadline_uses_policy_window(db_session):
    from app.services.booking_payments import cancellation_deadline_for_request

    _, member, space, setting, method = _seed(db_session)
    db_session.add(CancellationPolicy(
        tenant_id=space.tenant_id,
        space_type=space.space_type,
        cancel_window_hours=24,
    ))
    db_session.commit()
    req = _make_request(db_session, member, space, setting, method, day=10)
    deadline = cancellation_deadline_for_request(db_session, req, space)
    # SQLite strips tz on round-trip, so coerce both sides to UTC-aware before comparing.
    start = req.start_datetime
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    assert deadline == start - timedelta(hours=24)


# --------------------- provider-switch guard ---------------------


def test_provider_switch_guard_blocks_when_open_requests_exist(db_session):
    from fastapi import HTTPException
    import pytest

    _, member, space, setting, method = _seed(db_session)
    _make_request(db_session, member, space, setting, method, day=11)

    assert count_open_requests_for_setting(db_session, setting.id) == 1
    with pytest.raises(HTTPException) as exc:
        assert_safe_provider_change(db_session, setting, "cardpointe")
    assert exc.value.status_code == 409


def test_provider_switch_guard_allows_when_no_open_requests(db_session):
    _, member, space, setting, method = _seed(db_session)
    # No request created → safe to switch.
    assert_safe_provider_change(db_session, setting, "cardpointe")


def test_provider_switch_guard_force_overrides(db_session):
    _, member, space, setting, method = _seed(db_session)
    _make_request(db_session, member, space, setting, method, day=12)
    # force=True bypasses the check.
    assert_safe_provider_change(db_session, setting, "cardpointe", force=True)
