"""Approval-mode helpers for booking requests.

Pure domain logic shared by the booking-requests router and the
booking-request serializer. Kept in a standalone service module so both can
import it without an import cycle.
"""

from __future__ import annotations

from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestKind
from app.models.organization import Organization


def normalized_approval_mode(mode: str | None) -> str:
    mode = mode or "manual"
    return mode if mode in {"manual", "auto"} else "manual"


def booking_approval_mode_for_org(organization: Organization | None) -> str:
    return normalized_approval_mode(organization.booking_approval_mode if organization else None)


def membership_lease_approval_mode_for_org(organization: Organization | None) -> str:
    return normalized_approval_mode(
        organization.membership_lease_approval_mode if organization else None
    )


def approval_mode_for_request(req: BookingRequest, organization: Organization | None) -> str:
    if req.request_kind in {
        BookingRequestKind.MEMBERSHIP_PURCHASE.value,
        BookingRequestKind.LEASE_PURCHASE.value,
    }:
        return "auto" if req.instant_booking else "manual"
    if req.instant_booking:
        return "auto"
    return "manual"
