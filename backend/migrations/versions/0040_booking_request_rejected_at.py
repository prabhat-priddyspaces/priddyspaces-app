"""booking request rejected timestamp

Revision ID: 0040_booking_request_rejected_at
Revises: 0039_booking_email_prefs
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "0040_booking_request_rejected_at"
down_revision = "0039_booking_email_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("booking_requests", sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        """
        UPDATE booking_requests
        SET rejected_at = COALESCE(
            (
                SELECT MIN(audit_logs.created_at)
                FROM audit_logs
                WHERE audit_logs.entity_type = 'booking_request'
                  AND audit_logs.action = 'booking_request_rejected'
                  AND audit_logs.entity_public_id = booking_requests.public_id
            ),
            booking_requests.updated_at
        )
        WHERE booking_requests.status = 'rejected'
          AND booking_requests.rejected_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("booking_requests", "rejected_at")
