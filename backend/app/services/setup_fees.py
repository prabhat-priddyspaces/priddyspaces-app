from sqlalchemy.orm import Session

from app.models.space_setup_fee_item import SpaceSetupFeeItem


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
