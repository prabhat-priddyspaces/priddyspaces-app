from datetime import datetime, timezone

from app.models.enums import AvailabilityStatus, BookingStatus, PaymentStatus, SpaceType, UserAppRole, UserRole
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.invoice import Invoice


def _create_user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_org(db, owner: User, name: str) -> Organization:
    org = Organization(name=name, owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db.add(member)
    db.commit()
    return org


def test_invoices_rbac(db_session, client_factory):
    owner_one = _create_user(db_session, "owner1@example.com", "sub-owner-1", UserAppRole.OWNER)
    owner_two = _create_user(db_session, "owner2@example.com", "sub-owner-2", UserAppRole.OWNER)
    member = _create_user(db_session, "member@example.com", "sub-member-1", UserAppRole.MEMBER)

    org_one = _seed_org(db_session, owner_one, "OrgOne")
    org_two = _seed_org(db_session, owner_two, "OrgTwo")

    inv_one = Invoice(
        tenant_id=org_one.id,
        user_id=member.id,
        amount=120,
        status="issued"
    )
    inv_two = Invoice(
        tenant_id=org_two.id,
        user_id=owner_two.id,
        amount=200,
        status="issued"
    )
    db_session.add(inv_one)
    db_session.add(inv_two)
    db_session.commit()
    db_session.refresh(inv_one)

    owner_client = client_factory({
        "sub": "sub-owner-1",
        "email": "owner1@example.com",
        "email_verified": True
    })
    resp = owner_client.get("/api/invoices")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["public_id"] == inv_one.public_id

    member_client = client_factory({
        "sub": "sub-member-1",
        "email": "member@example.com",
        "email_verified": True
    })
    resp = member_client.get("/api/invoices")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_member_invoice_details_and_pdf_download(db_session, client_factory):
    owner = _create_user(db_session, "owner-detail@example.com", "sub-owner-detail", UserAppRole.OWNER)
    member = _create_user(db_session, "member-detail@example.com", "sub-member-detail", UserAppRole.MEMBER)
    org = _seed_org(db_session, owner, "Detail Org")
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Downtown Hub",
        address="123 Main",
        city="Miami",
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Board Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        availability_status=AvailabilityStatus.AVAILABLE,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)

    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=org.id,
        start_datetime=datetime(2026, 5, 1, 14, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 1, 16, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    payment = Payment(
        user_id=member.id,
        booking_id=booking.id,
        tenant_id=org.id,
        amount=120,
        provider="stripe",
        status=PaymentStatus.SUCCEEDED,
    )
    db_session.add(payment)
    db_session.commit()
    db_session.refresh(payment)

    invoice = Invoice(
        tenant_id=org.id,
        user_id=member.id,
        booking_id=booking.id,
        payment_id=payment.id,
        amount=120,
        status="paid",
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    member_client = client_factory({
        "sub": "sub-member-detail",
        "email": "member-detail@example.com",
        "email_verified": True,
    })
    resp = member_client.get("/api/invoices")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["space_name"] == "Board Room"
    assert data[0]["location_name"] == "Downtown Hub"
    assert data[0]["booking_public_id"] == booking.public_id
    assert data[0]["payment_public_id"] == payment.public_id
    assert data[0]["description"] == "Booking receipt"

    pdf = member_client.get(f"/api/invoices/{invoice.public_id}/pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert f"invoice-{invoice.public_id}.pdf" in pdf.headers["content-disposition"]
    assert pdf.content.startswith(b"%PDF")
