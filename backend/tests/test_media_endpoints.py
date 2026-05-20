from datetime import datetime, timezone

from app.models.enums import UserAppRole, UserRole, LocationStatus, SpaceType, AvailabilityStatus
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space
from app.core.config import settings
from app.services.storage import MAX_IMAGE_UPLOAD_BYTES, presign_space_image_upload


def _seed_owner_space(db):
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
        created_at=datetime.now(timezone.utc)
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Owner Org", owner_id=owner.id)
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

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        city="Testville",
        timezone="UTC",
        status=LocationStatus.ACTIVE
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, space


def test_media_upload_flow(db_session, client_factory, monkeypatch):
    owner, space = _seed_owner_space(db_session)

    def fake_presign(filename: str, content_type: str, size_bytes: int):
        return {
            "upload_url": "https://s3.example.com/upload",
            "key": f"spaces/{filename}",
            "public_url": f"https://cdn.example.com/spaces/{filename}",
            "max_bytes": 10 * 1024 * 1024,
        }

    monkeypatch.setattr("app.api.media.presign_space_image_upload", fake_presign)

    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    presign = client.post(
        "/api/media/presign",
        json={
            "filename": "space.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 1024,
            "space_public_id": space.public_id,
        }
    )
    assert presign.status_code == 200
    presign_data = presign.json()
    assert presign_data["key"] == "spaces/space.jpg"

    create = client.post(
        "/api/media",
        json={
            "space_public_id": space.public_id,
            "storage_key": presign_data["key"],
            "image_url": presign_data["public_url"],
            "is_primary": True,
            "sort_order": 0
        }
    )
    assert create.status_code == 200

    listing = client.get(f"/api/spaces/{space.public_id}/media")
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["image_url"] == presign_data["public_url"]
    assert items[0]["is_primary"] is True


def test_media_update_and_delete_flow(db_session, client_factory, monkeypatch):
    owner, space = _seed_owner_space(db_session)

    def fake_presign(filename: str, content_type: str, size_bytes: int):
        return {
            "upload_url": "https://s3.example.com/upload",
            "key": f"spaces/{filename}",
            "public_url": f"https://cdn.example.com/spaces/{filename}",
            "max_bytes": 10 * 1024 * 1024,
        }

    monkeypatch.setattr("app.api.media.presign_space_image_upload", fake_presign)

    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    first = client.post(
        "/api/media",
        json={
            "space_public_id": space.public_id,
            "storage_key": "spaces/first.jpg",
            "image_url": "https://cdn.example.com/spaces/first.jpg",
            "is_primary": True,
            "sort_order": 0
        }
    )
    assert first.status_code == 200
    first_image = first.json()

    second = client.post(
        "/api/media",
        json={
            "space_public_id": space.public_id,
            "storage_key": "spaces/second.jpg",
            "image_url": "https://cdn.example.com/spaces/second.jpg",
            "is_primary": False,
            "sort_order": 1
        }
    )
    assert second.status_code == 200
    second_image = second.json()

    promote = client.patch(
        f"/api/media/{second_image['public_id']}",
        json={"is_primary": True, "sort_order": 0}
    )
    assert promote.status_code == 200
    assert promote.json()["is_primary"] is True

    listing = client.get(f"/api/spaces/{space.public_id}/media")
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 2
    assert items[0]["public_id"] == second_image["public_id"]
    assert items[0]["is_primary"] is True
    assert items[1]["public_id"] == first_image["public_id"]
    assert items[1]["is_primary"] is False

    delete = client.delete(f"/api/media/{second_image['public_id']}")
    assert delete.status_code == 204

    listing = client.get(f"/api/spaces/{space.public_id}/media")
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["public_id"] == first_image["public_id"]
    assert items[0]["is_primary"] is True


def test_media_responses_use_configured_public_base_url(db_session, client_factory, monkeypatch):
    owner, space = _seed_owner_space(db_session)
    monkeypatch.setattr(settings, "S3_PUBLIC_BASE_URL", "https://assets.example.com")

    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    create = client.post(
        "/api/media",
        json={
            "space_public_id": space.public_id,
            "storage_key": "spaces/legacy.jpg",
            "image_url": "https://bucket.s3.us-east-1.amazonaws.com/spaces/legacy.jpg",
            "is_primary": True,
            "sort_order": 0
        }
    )
    assert create.status_code == 200
    assert create.json()["image_url"] == "https://assets.example.com/spaces/legacy.jpg"

    listing = client.get(f"/api/spaces/{space.public_id}/media")
    assert listing.status_code == 200
    assert listing.json()[0]["image_url"] == "https://assets.example.com/spaces/legacy.jpg"


def test_media_public_urls_encode_storage_key(db_session, client_factory, monkeypatch):
    owner, space = _seed_owner_space(db_session)
    monkeypatch.setattr(settings, "S3_PUBLIC_BASE_URL", "https://assets.example.com")

    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    create = client.post(
        "/api/media",
        json={
            "space_public_id": space.public_id,
            "storage_key": "spaces/Screenshot 2026-05-07 at 11.40.21 AM.png",
            "image_url": "https://bucket.s3.us-east-1.amazonaws.com/spaces/raw.png",
            "is_primary": True,
            "sort_order": 0
        }
    )
    assert create.status_code == 200
    assert (
        create.json()["image_url"]
        == "https://assets.example.com/spaces/Screenshot%202026-05-07%20at%2011.40.21%20AM.png"
    )


def test_space_image_presign_rejects_non_images(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    presign = client.post(
        "/api/media/presign",
        json={
            "filename": "payload.svg",
            "content_type": "image/svg+xml",
            "size_bytes": 1024,
            "space_public_id": space.public_id,
        }
    )

    assert presign.status_code == 400


def test_space_image_presign_generates_opaque_s3_key(monkeypatch):
    captured = {}

    class FakeS3:
        def generate_presigned_url(self, method, Params, ExpiresIn):
            captured["method"] = method
            captured["params"] = Params
            captured["expires_in"] = ExpiresIn
            return "https://s3.example.com/upload"

    monkeypatch.setattr(settings, "S3_BUCKET", "uploads")
    monkeypatch.setattr(settings, "S3_REGION", "us-east-1")
    monkeypatch.setattr(settings, "S3_PUBLIC_BASE_URL", "https://assets.example.com")
    monkeypatch.setattr("app.services.storage.boto3.client", lambda *args, **kwargs: FakeS3())

    result = presign_space_image_upload("../../profile.png", "image/png", 1024)

    assert result["upload_url"] == "https://s3.example.com/upload"
    assert result["key"].startswith("spaces/")
    assert result["key"].endswith(".png")
    assert "profile" not in result["key"]
    assert ".." not in result["key"]
    assert result["public_url"] == f"https://assets.example.com/{result['key']}"
    assert result["max_bytes"] == MAX_IMAGE_UPLOAD_BYTES
    assert captured["method"] == "put_object"
    assert captured["params"]["ContentType"] == "image/png"
    assert "ContentLength" not in captured["params"]


def test_floor_plan_presign_requires_location_scope(db_session, client_factory, monkeypatch):
    owner, space = _seed_owner_space(db_session)
    location = db_session.query(Location).filter(Location.id == space.location_id).one()

    def fake_presign(filename: str, content_type: str, size_bytes: int):
        return {"upload_url": "https://s3.example.com/upload", "key": f"floor-plans/{filename}", "max_bytes": 10 * 1024 * 1024}

    monkeypatch.setattr("app.api.floor_plans.presign_floor_plan_upload", fake_presign)

    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    presign = client.post(
        "/api/floor-plans/presign",
        json={
            "filename": "floor.png",
            "content_type": "image/png",
            "size_bytes": 1024,
            "location_public_id": location.public_id,
        },
    )

    assert presign.status_code == 200
    assert presign.json()["key"] == "floor-plans/floor.png"
