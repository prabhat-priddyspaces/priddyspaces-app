from html import escape

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.enums import PlatformTeamRole
from app.models.organization import Organization
from app.models.platform_team_member import PlatformTeamMember
from app.models.user import User
from app.services.notifications import send_email


def frontend_href(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def superadmin_approval_recipients(db: Session) -> list[str]:
    rows = (
        db.query(User.email)
        .join(PlatformTeamMember, PlatformTeamMember.user_id == User.id)
        .filter(
            PlatformTeamMember.role == PlatformTeamRole.SUPERADMIN,
            PlatformTeamMember.is_active.is_(True),
            User.is_active.is_(True),
        )
        .all()
    )
    emails = [row.email for row in rows if row.email]
    emails.extend(
        email.strip()
        for email in settings.PLATFORM_ADMIN_EMAILS.split(",")
        if email.strip()
    )
    deduped: list[str] = []
    seen: set[str] = set()
    for email in emails:
        key = email.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(email)
    return deduped


def send_organization_approval_request_email(
    db: Session,
    *,
    org: Organization,
    requester: User,
    recipients: list[str] | None = None,
) -> int:
    recipients = recipients if recipients is not None else superadmin_approval_recipients(db)
    if not recipients:
        return 0

    view_url = frontend_href(f"/admin/owner-companies?company={org.public_id}")
    approve_url = frontend_href(
        f"/admin/owner-companies?company={org.public_id}&action=approve"
    )
    subject = f"Owner company approval requested: {org.name}"
    text = "\n".join(
        [
            f"{requester.email} requested marketplace approval for {org.name}.",
            f"Current status: {org.review_status.value}",
            "",
            f"View company: {view_url}",
            f"Approve company: {approve_url}",
        ]
    )
    html = "\n".join(
        [
            f"<p>{escape(requester.email)} requested marketplace approval for <strong>{escape(org.name)}</strong>.</p>",
            f"<p>Current status: <strong>{escape(org.review_status.value)}</strong></p>",
            f'<p><a href="{escape(view_url)}">View company</a></p>',
            f'<p><a href="{escape(approve_url)}">Approve company</a></p>',
        ]
    )
    for recipient in recipients:
        send_email(recipient, subject, text, db=db, html_body=html)
    return len(recipients)
