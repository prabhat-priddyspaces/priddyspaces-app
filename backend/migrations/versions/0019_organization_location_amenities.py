"""Add organization-managed amenities.

Revision ID: 0019_org_location_amenities
Revises: 0018_invoices
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "0019_org_location_amenities"
down_revision = "0018_invoices"
branch_labels = None
depends_on = None

DEFAULT_AMENITIES = [
    "AC",
    "Coffee",
    "Whiteboard",
    "WiFi",
    "Parking",
    "Printer",
    "Meeting Room",
]


def _clean_name(name: str) -> str:
    return " ".join((name or "").split())


def _normalize_name(name: str) -> str:
    return _clean_name(name).casefold()


def _slugify(name: str) -> str:
    slug = []
    last_dash = False
    for char in _clean_name(name).casefold():
        if char.isalnum():
            slug.append(char)
            last_dash = False
        elif not last_dash:
            slug.append("-")
            last_dash = True
    value = "".join(slug).strip("-")
    return value or "amenity"


def _parse_amenities(raw: str | None) -> list[str]:
    if not raw:
        return []
    names: list[str] = []
    seen: set[str] = set()
    for part in raw.split(","):
        cleaned = _clean_name(part)
        if not cleaned:
            continue
        normalized = _normalize_name(cleaned)
        if normalized in seen:
            continue
        seen.add(normalized)
        names.append(cleaned)
    return names


def _insert_org_amenity(conn, organization_amenities, *, org_id: int, name: str) -> int:
    conn.execute(
        organization_amenities.insert().values(
            organization_id=org_id,
            name=name,
            slug=_slugify(name),
        )
    )
    amenity_id = conn.execute(
        sa.select(organization_amenities.c.id).where(
            organization_amenities.c.organization_id == org_id,
            organization_amenities.c.name == name,
        )
    ).scalar_one()
    return int(amenity_id)


def upgrade() -> None:
    op.create_table(
        "organization_amenities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_organization_amenities_organization_id",
        "organization_amenities",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "location_amenities",
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("organization_amenity_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.ForeignKeyConstraint(["organization_amenity_id"], ["organization_amenities.id"]),
        sa.PrimaryKeyConstraint("location_id", "organization_amenity_id"),
    )
    op.create_index(
        "ix_location_amenities_location_id",
        "location_amenities",
        ["location_id"],
        unique=False,
    )

    conn = op.get_bind()

    organizations = sa.table("organizations", sa.column("id", sa.Integer()))
    locations = sa.table(
        "locations",
        sa.column("id", sa.Integer()),
        sa.column("organization_id", sa.Integer()),
        sa.column("amenities", sa.String()),
    )
    spaces = sa.table(
        "spaces",
        sa.column("location_id", sa.Integer()),
        sa.column("amenities", sa.String()),
    )
    organization_amenities = sa.table(
        "organization_amenities",
        sa.column("id", sa.Integer()),
        sa.column("organization_id", sa.Integer()),
        sa.column("name", sa.String()),
        sa.column("slug", sa.String()),
    )
    location_amenities = sa.table(
        "location_amenities",
        sa.column("location_id", sa.Integer()),
        sa.column("organization_amenity_id", sa.Integer()),
    )

    org_ids = [row.id for row in conn.execute(sa.select(organizations.c.id)).mappings().all()]
    location_rows = conn.execute(
        sa.select(locations.c.id, locations.c.organization_id, locations.c.amenities)
    ).mappings().all()
    space_rows = conn.execute(
        sa.select(spaces.c.location_id, spaces.c.amenities)
    ).mappings().all()

    location_names: dict[int, list[str]] = {}
    location_orgs: dict[int, int] = {}
    for row in location_rows:
        location_orgs[row["id"]] = row["organization_id"]
        location_names[row["id"]] = _parse_amenities(row["amenities"])

    for row in space_rows:
        location_id = row["location_id"]
        existing = location_names.setdefault(location_id, [])
        seen = {_normalize_name(name) for name in existing}
        for name in _parse_amenities(row["amenities"]):
            normalized = _normalize_name(name)
            if normalized in seen:
                continue
            seen.add(normalized)
            existing.append(name)

    amenity_id_map: dict[int, dict[str, int]] = {}
    for org_id in org_ids:
        amenity_id_map[org_id] = {}
        names: list[str] = []
        seen: set[str] = set()
        for name in DEFAULT_AMENITIES:
            normalized = _normalize_name(name)
            if normalized in seen:
                continue
            seen.add(normalized)
            names.append(_clean_name(name))
        for location_id, location_org_id in location_orgs.items():
            if location_org_id != org_id:
                continue
            for name in location_names.get(location_id, []):
                normalized = _normalize_name(name)
                if normalized in seen:
                    continue
                seen.add(normalized)
                names.append(name)

        for name in names:
            amenity_id_map[org_id][_normalize_name(name)] = _insert_org_amenity(
                conn,
                organization_amenities,
                org_id=org_id,
                name=name,
            )

    for location_id, names in location_names.items():
        org_id = location_orgs.get(location_id)
        if org_id is None:
            continue
        seen: set[int] = set()
        for name in names:
            amenity_id = amenity_id_map.get(org_id, {}).get(_normalize_name(name))
            if not amenity_id or amenity_id in seen:
                continue
            seen.add(amenity_id)
            conn.execute(
                location_amenities.insert().values(
                    location_id=location_id,
                    organization_amenity_id=amenity_id,
                )
            )


def downgrade() -> None:
    op.drop_index("ix_location_amenities_location_id", table_name="location_amenities")
    op.drop_table("location_amenities")
    op.drop_index(
        "ix_organization_amenities_organization_id",
        table_name="organization_amenities",
    )
    op.drop_table("organization_amenities")
