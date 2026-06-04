"""Phone numbers are capped at 10 digits across every input schema.

These tests exercise the shared ``normalize_phone`` helper and the Pydantic
schemas that back the public/owner/admin endpoints, so they run without a
database.
"""
import pytest
from pydantic import ValidationError

from app.api.onboarding import OrgIn, ProfileIn
from app.models.enums import UserAppRole
from app.schemas._phone import normalize_phone
from app.schemas.admin import OwnerInviteIn
from app.schemas.auth import MeUpdateIn
from app.schemas.booking_request import GuestBookingRequestCreate
from app.schemas.location import LocationCreate, LocationUpdate
from app.schemas.org_member_profile import OrgMemberProfileUpdate
from app.schemas.owner_booking import OwnerBookingMemberCreate


class TestNormalizePhone:
    def test_none_and_blank_become_none(self):
        assert normalize_phone(None) is None
        assert normalize_phone("") is None
        assert normalize_phone("   ") is None
        assert normalize_phone("()-+ ") is None

    def test_strips_non_digits(self):
        assert normalize_phone("(555) 123-4567") == "5551234567"
        assert normalize_phone("+1 555 123 4567"[3:]) == "5551234567"

    def test_strips_letters(self):
        assert normalize_phone("555ABC4567x") == "5554567"

    def test_caps_at_ten_digits_by_rejecting_more(self):
        with pytest.raises(ValueError, match="at most 10 digits"):
            normalize_phone("12211211212")  # 11 digits, from the bug report
        with pytest.raises(ValueError, match="at most 10 digits"):
            normalize_phone("+1 (552) 112-1121-99")

    def test_exactly_ten_passes(self):
        assert normalize_phone("5551234567") == "5551234567"


class TestSchemasRejectLongPhones:
    """Every input schema must reject an 11+ digit phone."""

    def test_profile_in(self):
        with pytest.raises(ValidationError):
            ProfileIn(role=UserAppRole.OWNER, full_name="A", phone="12211211212")

    def test_profile_in_normalizes_formatting(self):
        assert ProfileIn(full_name="A", phone="(555) 123-4567").phone == "5551234567"

    def test_org_in(self):
        with pytest.raises(ValidationError):
            OrgIn(name="Acme", business_phone="12211211212")

    def test_org_in_normalizes_formatting(self):
        assert OrgIn(name="Acme", business_phone="(555) 123-4567").business_phone == "5551234567"

    def test_me_update_in(self):
        with pytest.raises(ValidationError):
            MeUpdateIn(phone="12211211212")

    def test_owner_invite_in(self):
        with pytest.raises(ValidationError):
            OwnerInviteIn(email="owner@test.com", phone="12211211212")

    def test_owner_invite_normalizes(self):
        assert OwnerInviteIn(email="owner@test.com", phone="555.123.4567").phone == "5551234567"

    def test_owner_booking_member(self):
        with pytest.raises(ValidationError):
            OwnerBookingMemberCreate(email="m@test.com", full_name="M", phone="12211211212")

    def test_guest_booking_request(self):
        with pytest.raises(ValidationError):
            GuestBookingRequestCreate(
                space_public_id="sp_1",
                start_datetime="2026-06-03T09:00:00Z",
                end_datetime="2026-06-03T10:00:00Z",
                guest_email="g@test.com",
                guest_full_name="Guest",
                guest_phone="12211211212",
            )

    def test_location_create_and_update(self):
        with pytest.raises(ValidationError):
            LocationCreate(
                organization_public_id="org_1",
                name="Loc",
                address="123 St",
                timezone="America/New_York",
                public_phone="12211211212",
            )
        with pytest.raises(ValidationError):
            LocationUpdate(public_phone="12211211212")

    def test_org_member_profile_update(self):
        with pytest.raises(ValidationError):
            OrgMemberProfileUpdate(phone="12211211212")
        assert OrgMemberProfileUpdate(phone="(555) 123-4567").phone == "5551234567"
