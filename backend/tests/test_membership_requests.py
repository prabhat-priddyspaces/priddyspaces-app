"""Unit coverage for the extracted membership-requests helpers (B2).

The end-to-end create/approve flow is covered by test_membership_purchase.py
through the API; these tests pin the small classification helpers that moved out
of app/api/booking_requests.py.
"""

from app.models.enums import BookingRequestKind
from app.services.membership_requests import _is_exclusive_lease_mode, _kind_for_booking_mode


def test_kind_for_booking_mode_maps_lease_modes():
    assert _kind_for_booking_mode("private_office_lease") == BookingRequestKind.LEASE_PURCHASE
    assert _kind_for_booking_mode("suite_lease") == BookingRequestKind.LEASE_PURCHASE


def test_kind_for_booking_mode_defaults_to_membership():
    assert _kind_for_booking_mode("monthly_membership") == BookingRequestKind.MEMBERSHIP_PURCHASE
    assert _kind_for_booking_mode("virtual_membership") == BookingRequestKind.MEMBERSHIP_PURCHASE


def test_is_exclusive_lease_mode():
    assert _is_exclusive_lease_mode("private_office_lease") is True
    assert _is_exclusive_lease_mode("suite_lease") is True
    assert _is_exclusive_lease_mode("monthly_membership") is False
    assert _is_exclusive_lease_mode(None) is False
