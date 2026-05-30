from __future__ import annotations

import argparse
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.assistant.jobs import (
    build_booking_reminders,
    match_space_alerts,
    send_booking_reminder_email,
    send_card_expiry_notices,
    send_space_alert_email,
)
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.marketing import OutboundMessage
from app.models.user import User
from app.services.cardpointe_settlement_poller import update_pending_cardpointe_settlements
from app.services.booking_payments import expire_payment_holds
from app.services.marketing import tick_marketing
from app.services.push_notifications import run_booking_reminder_push_job

logger = logging.getLogger("worker")


@dataclass(frozen=True)
class WorkerConfig:
    interval_seconds: int
    batch_limit: int
    enable_marketing: bool
    enable_assistant_jobs: bool
    enable_booking_reminder_push: bool
    enable_cardpointe_settlements: bool
    enable_booking_hold_expiry: bool
    cardpointe_max_age_days: int

    @classmethod
    def from_settings(cls) -> "WorkerConfig":
        return cls(
            interval_seconds=settings.WORKER_INTERVAL_SECONDS,
            batch_limit=settings.WORKER_BATCH_LIMIT,
            enable_marketing=settings.WORKER_ENABLE_MARKETING,
            enable_assistant_jobs=settings.WORKER_ENABLE_ASSISTANT_JOBS,
            enable_booking_reminder_push=settings.WORKER_ENABLE_BOOKING_REMINDER_PUSH,
            enable_cardpointe_settlements=settings.WORKER_ENABLE_CARDPOINTE_SETTLEMENTS,
            enable_booking_hold_expiry=settings.WORKER_ENABLE_BOOKING_HOLD_EXPIRY,
            cardpointe_max_age_days=settings.WORKER_CARDPOINTE_MAX_AGE_DAYS,
        )


SessionFactory = Callable[[], Session]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _outbound_exists(db: Session, *, user_id: int | None, context: dict[str, Any]) -> bool:
    if user_id is None:
        return False
    candidates = (
        db.query(OutboundMessage)
        .filter(
            OutboundMessage.source == "assistant",
            OutboundMessage.user_id == user_id,
        )
        .all()
    )
    for outbound in candidates:
        existing = outbound.source_context or {}
        if all(existing.get(key) == value for key, value in context.items()):
            return True
    return False


def _record_assistant_outbound(
    db: Session,
    *,
    user: User,
    subject: str,
    body: str,
    context: dict[str, Any],
    tenant_id: int | None,
) -> None:
    organization_id = tenant_id or 0
    db.add(
        OutboundMessage(
            organization_id=organization_id,
            tenant_id=tenant_id or organization_id,
            user_id=user.id,
            email=user.email,
            subject=subject,
            text_body=body,
            html_body=None,
            sender_lane="transactional",
            from_email=settings.SENDGRID_FROM_EMAIL or "no-reply@priddyspaces.local",
            from_name="Priddyspaces",
            provider="sendgrid",
            status="sent" if settings.SENDGRID_API_KEY and settings.SENDGRID_FROM_EMAIL else "skipped",
            error=None if settings.SENDGRID_API_KEY and settings.SENDGRID_FROM_EMAIL else "SendGrid is not configured",
            source="assistant",
            source_context=context,
        )
    )
    db.commit()


def run_assistant_jobs(db: Session, *, limit: int) -> dict[str, int]:
    reminders = build_booking_reminders(db)[:limit]
    reminders_sent = 0
    reminders_duplicate = 0
    reminders_skipped = 0

    for reminder in reminders:
        user_id = reminder.get("user_id")
        user = db.query(User).filter(User.id == user_id).first() if user_id else None
        if not user or not user.email:
            reminders_skipped += 1
            continue

        context = {
            "kind": "booking_reminder",
            "booking_public_id": str(reminder.get("booking_public_id")),
            "window": str(reminder.get("window")),
        }
        if _outbound_exists(db, user_id=user.id, context=context):
            reminders_duplicate += 1
            continue

        subject = "Upcoming PriddySpaces booking"
        body = f"Your booking {reminder['booking_public_id']} starts in {reminder['window']}."
        send_booking_reminder_email(user.email, reminder, db=db)
        _record_assistant_outbound(
            db,
            user=user,
            subject=subject,
            body=body,
            context=context,
            tenant_id=reminder.get("tenant_id"),
        )
        reminders_sent += 1

    matches = match_space_alerts(db)[:limit]
    alerts_sent = 0
    alerts_skipped = 0
    for match in matches:
        user_id = match.get("user_id")
        user = db.query(User).filter(User.id == user_id).first() if user_id else None
        if not user or not user.email:
            alerts_skipped += 1
            continue

        context = {
            "kind": "space_alert_match",
            "alert_public_id": str(match.get("alert_public_id")),
            "space_public_id": str(match.get("space_public_id")),
        }
        if _outbound_exists(db, user_id=user.id, context=context):
            alerts_skipped += 1
            continue

        subject = "A PriddySpaces match is available"
        body = f"We found a matching space for your alert: {match['space_public_id']}."
        send_space_alert_email(user.email, match, db=db)
        _record_assistant_outbound(
            db,
            user=user,
            subject=subject,
            body=body,
            context=context,
            tenant_id=match.get("tenant_id"),
        )
        alerts_sent += 1

    card_notice_result = send_card_expiry_notices(db, limit=limit)

    return {
        "booking_reminders_found": len(reminders),
        "booking_reminders_sent": reminders_sent,
        "booking_reminders_duplicate": reminders_duplicate,
        "booking_reminders_skipped": reminders_skipped,
        "space_alert_matches_found": len(matches),
        "space_alert_emails_sent": alerts_sent,
        "space_alert_emails_skipped": alerts_skipped,
        **card_notice_result,
    }


def _run_db_job(
    name: str,
    session_factory: SessionFactory,
    job: Callable[[Session], dict[str, Any]],
) -> tuple[dict[str, Any] | None, str | None]:
    db = session_factory()
    try:
        return job(db), None
    except Exception as exc:  # noqa: BLE001
        logger.exception("Worker job failed: %s", name)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            logger.exception("Worker rollback failed: %s", name)
        return None, str(exc)
    finally:
        db.close()


def run_once(
    *,
    config: WorkerConfig | None = None,
    session_factory: SessionFactory = SessionLocal,
) -> dict[str, Any]:
    config = config or WorkerConfig.from_settings()
    result: dict[str, Any] = {
        "started_at": _now_iso(),
        "jobs": {},
        "errors": {},
    }

    if config.enable_marketing:
        job_result, error = _run_db_job(
            "marketing",
            session_factory,
            lambda db: tick_marketing(db, limit=config.batch_limit),
        )
        if error:
            result["errors"]["marketing"] = error
        else:
            result["jobs"]["marketing"] = job_result

    if config.enable_assistant_jobs:
        job_result, error = _run_db_job(
            "assistant",
            session_factory,
            lambda db: run_assistant_jobs(db, limit=config.batch_limit),
        )
        if error:
            result["errors"]["assistant"] = error
        else:
            result["jobs"]["assistant"] = job_result

    if config.enable_booking_reminder_push:
        job_result, error = _run_db_job(
            "booking_reminder_push",
            session_factory,
            lambda db: run_booking_reminder_push_job(db, limit=config.batch_limit),
        )
        if error:
            result["errors"]["booking_reminder_push"] = error
        else:
            result["jobs"]["booking_reminder_push"] = job_result

    if config.enable_cardpointe_settlements:
        job_result, error = _run_db_job(
            "cardpointe_settlements",
            session_factory,
            lambda db: update_pending_cardpointe_settlements(
                db,
                max_age_days=config.cardpointe_max_age_days,
                limit=config.batch_limit,
            ),
        )
        if error:
            result["errors"]["cardpointe_settlements"] = error
        else:
            result["jobs"]["cardpointe_settlements"] = job_result

    if config.enable_booking_hold_expiry:
        job_result, error = _run_db_job(
            "booking_hold_expiry",
            session_factory,
            lambda db: expire_payment_holds(db, limit=config.batch_limit),
        )
        if error:
            result["errors"]["booking_hold_expiry"] = error
        else:
            result["jobs"]["booking_hold_expiry"] = job_result

    result["finished_at"] = _now_iso()
    return result


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Priddyspaces background worker")
    parser.add_argument("--interval", type=int, default=settings.WORKER_INTERVAL_SECONDS)
    parser.add_argument("--limit", type=int, default=settings.WORKER_BATCH_LIMIT)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--disable-marketing", action="store_true")
    parser.add_argument("--disable-assistant-jobs", action="store_true")
    parser.add_argument("--disable-booking-reminder-push", action="store_true")
    parser.add_argument("--disable-cardpointe-settlements", action="store_true")
    parser.add_argument("--disable-booking-hold-expiry", action="store_true")
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    config = WorkerConfig(
        interval_seconds=args.interval,
        batch_limit=args.limit,
        enable_marketing=settings.WORKER_ENABLE_MARKETING and not args.disable_marketing,
        enable_assistant_jobs=settings.WORKER_ENABLE_ASSISTANT_JOBS and not args.disable_assistant_jobs,
        enable_booking_reminder_push=(
            settings.WORKER_ENABLE_BOOKING_REMINDER_PUSH and not args.disable_booking_reminder_push
        ),
        enable_cardpointe_settlements=(
            settings.WORKER_ENABLE_CARDPOINTE_SETTLEMENTS and not args.disable_cardpointe_settlements
        ),
        enable_booking_hold_expiry=(
            settings.WORKER_ENABLE_BOOKING_HOLD_EXPIRY and not args.disable_booking_hold_expiry
        ),
        cardpointe_max_age_days=settings.WORKER_CARDPOINTE_MAX_AGE_DAYS,
    )

    while True:
        print(json.dumps(run_once(config=config), sort_keys=True), flush=True)
        if args.once:
            break
        time.sleep(config.interval_seconds)


if __name__ == "__main__":
    main()
