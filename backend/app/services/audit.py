from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def write_audit_log(
    db: Session,
    actor_id: int,
    action: str,
    entity_type: str,
    entity_public_id: str,
    before_state: dict | None,
    after_state: dict | None,
    *,
    acting_as_user_id: int | None = None,
    context: dict | None = None,
) -> None:
    log = AuditLog(
        actor_id=actor_id,
        acting_as_user_id=acting_as_user_id,
        action=action,
        entity_type=entity_type,
        entity_public_id=entity_public_id,
        before_state=before_state,
        after_state=after_state,
        context=context,
    )
    db.add(log)
    db.commit()
