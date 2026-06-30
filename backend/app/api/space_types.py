from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import PlatformTeamRole
from app.models.space import Space
from app.models.space_type import SpaceTypeRegistry
from app.schemas.space_type import (
    SpaceTypeAdminOut,
    SpaceTypeCreate,
    SpaceTypeOut,
    SpaceTypeReorderIn,
    SpaceTypeUpdate,
)
from app.services.audit import write_audit_log
from app.services.platform_auth import get_audit_actor_context, require_platform_roles
from app.services.space_type_registry import (
    list_enabled_space_types,
    serialize_space_type,
)

router = APIRouter()

READ_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN, PlatformTeamRole.SUPPORT}
WRITE_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN}


def _get_or_404(db: Session, public_id: str) -> SpaceTypeRegistry:
    row = db.query(SpaceTypeRegistry).filter(SpaceTypeRegistry.public_id == public_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Space type not found")
    return row


def _space_count_for_key(db: Session, key: str) -> int:
    return db.query(Space.id).filter(Space.space_type == key).count()


@router.get("/space-types", response_model=list[SpaceTypeOut])
def list_public_space_types(db: Session = Depends(get_db)):
    """Enabled space types with archetype-derived config, for owner/marketplace UIs."""
    return [serialize_space_type(row) for row in list_enabled_space_types(db)]


@router.get("/admin/space-types", response_model=list[SpaceTypeAdminOut])
def admin_list_space_types(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    rows = (
        db.query(SpaceTypeRegistry)
        .order_by(SpaceTypeRegistry.sort_order.asc(), SpaceTypeRegistry.id.asc())
        .all()
    )
    return [serialize_space_type(row) for row in rows]


@router.post("/admin/space-types", response_model=SpaceTypeAdminOut, status_code=201)
def admin_create_space_type(
    payload: SpaceTypeCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, WRITE_ROLES)
    existing = db.query(SpaceTypeRegistry).filter(SpaceTypeRegistry.key == payload.key).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Space type key already exists: {payload.key}")

    row = SpaceTypeRegistry(
        key=payload.key,
        label=payload.label,
        description=payload.description,
        icon=payload.icon,
        archetype=payload.archetype,
        marketplace_category=payload.marketplace_category,
        capacity_applicable=payload.capacity_applicable,
        has_physical_inventory=payload.has_physical_inventory,
        is_enabled=payload.is_enabled,
        sort_order=payload.sort_order,
        is_system=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db=db,
        actor_id=actor_id,
        action="space_type_created",
        entity_type="space_type",
        entity_public_id=row.public_id,
        before_state=None,
        after_state=serialize_space_type(row),
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return serialize_space_type(row)


@router.patch("/admin/space-types/{public_id}", response_model=SpaceTypeAdminOut)
def admin_update_space_type(
    public_id: str,
    payload: SpaceTypeUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, WRITE_ROLES)
    row = _get_or_404(db, public_id)
    before = serialize_space_type(row)

    if payload.archetype is not None and payload.archetype != row.archetype:
        # Changing archetype silently alters booking behavior of existing spaces.
        if row.is_system:
            raise HTTPException(status_code=400, detail="Cannot change the archetype of a built-in space type")
        if _space_count_for_key(db, row.key) > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot change archetype while spaces reference this type",
            )
        row.archetype = payload.archetype

    for field in (
        "label",
        "description",
        "icon",
        "marketplace_category",
        "capacity_applicable",
        "has_physical_inventory",
        "is_enabled",
        "sort_order",
    ):
        if field in payload.model_fields_set:
            setattr(row, field, getattr(payload, field))

    db.add(row)
    db.commit()
    db.refresh(row)

    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db=db,
        actor_id=actor_id,
        action="space_type_updated",
        entity_type="space_type",
        entity_public_id=row.public_id,
        before_state=before,
        after_state=serialize_space_type(row),
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return serialize_space_type(row)


@router.post("/admin/space-types/reorder", response_model=list[SpaceTypeAdminOut])
def admin_reorder_space_types(
    payload: SpaceTypeReorderIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, WRITE_ROLES)
    by_public_id = {
        row.public_id: row
        for row in db.query(SpaceTypeRegistry).all()
    }
    for item in payload.items:
        row = by_public_id.get(item.public_id)
        if row is not None:
            row.sort_order = item.sort_order
            db.add(row)
    db.commit()

    rows = (
        db.query(SpaceTypeRegistry)
        .order_by(SpaceTypeRegistry.sort_order.asc(), SpaceTypeRegistry.id.asc())
        .all()
    )
    return [serialize_space_type(row) for row in rows]
