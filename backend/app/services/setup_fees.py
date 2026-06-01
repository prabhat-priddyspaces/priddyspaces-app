from sqlalchemy.orm import Session

from app.models.space_setup_fee_item import SpaceSetupFeeItem


def normalize_setup_fee_items(items) -> list[dict[str, int | bool | str]]:
    normalized: list[dict[str, int | bool | str]] = []
    seen_labels: set[str] = set()
    for index, item in enumerate(items or []):
        label = " ".join(item.label.split())
        if not label:
            raise ValueError("Setup fee label is required")
        key = label.casefold()
        if key in seen_labels:
            raise ValueError(f"Duplicate setup fee label: {label}")
        seen_labels.add(key)
        normalized.append(
            {
                "label": label,
                "amount_cents": item.amount_cents,
                "is_active": item.is_active,
                "sort_order": item.sort_order if item.sort_order is not None else index,
            }
        )
    return normalized


def add_setup_fee_items(
    db: Session,
    *,
    tenant_id: int,
    space_id: int,
    items,
) -> None:
    add_normalized_setup_fee_items(
        db,
        tenant_id=tenant_id,
        space_id=space_id,
        items=normalize_setup_fee_items(items),
    )


def add_normalized_setup_fee_items(
    db: Session,
    *,
    tenant_id: int,
    space_id: int,
    items: list[dict[str, int | bool | str]],
) -> None:
    for item in items:
        db.add(
            SpaceSetupFeeItem(
                tenant_id=tenant_id,
                space_id=space_id,
                label=str(item["label"]),
                amount_cents=int(item["amount_cents"]),
                is_active=bool(item["is_active"]),
                sort_order=int(item["sort_order"]),
            )
        )


def active_setup_fee_items(db: Session, space_id: int) -> list[SpaceSetupFeeItem]:
    return (
        db.query(SpaceSetupFeeItem)
        .filter(
            SpaceSetupFeeItem.space_id == space_id,
            SpaceSetupFeeItem.is_active.is_(True),
        )
        .order_by(SpaceSetupFeeItem.sort_order.asc(), SpaceSetupFeeItem.id.asc())
        .all()
    )


def setup_fee_snapshot_items(db: Session, space_id: int) -> list[dict[str, int | str]]:
    return [
        {
            "label": item.label,
            "amount_cents": int(item.amount_cents or 0),
            "type": "setup_fee",
        }
        for item in active_setup_fee_items(db, space_id)
        if (item.amount_cents or 0) > 0
    ]


def setup_fee_amount_cents(db: Session, space_id: int) -> int:
    return sum(int(item["amount_cents"]) for item in setup_fee_snapshot_items(db, space_id))
