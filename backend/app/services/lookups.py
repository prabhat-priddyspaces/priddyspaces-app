from sqlalchemy.orm import Session

from app.models.organization import Organization
from app.models.location import Location


def get_org_by_public_id(db: Session, public_id: str) -> Organization | None:
    return db.query(Organization).filter(Organization.public_id == public_id).first()


def get_location_by_public_id(db: Session, public_id: str) -> Location | None:
    return db.query(Location).filter(Location.public_id == public_id).first()
