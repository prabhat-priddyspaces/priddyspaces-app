"""payment events

Revision ID: 0002_payment_events
Revises: 0001_initial
Create Date: 2026-01-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0002_payment_events"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "payment_events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False, server_default="stripe"),
        sa.Column("event_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(128), nullable=False),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("event_id")
    )
    op.create_index("ix_payment_events_public_id", "payment_events", ["public_id"], unique=True)
    op.create_index("ix_payment_events_event_id", "payment_events", ["event_id"], unique=True)


def downgrade():
    op.drop_index("ix_payment_events_event_id", table_name="payment_events")
    op.drop_index("ix_payment_events_public_id", table_name="payment_events")
    op.drop_table("payment_events")
