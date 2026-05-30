"""space access passes and attendance records

Revision ID: 0045_space_access_passes
Revises: 0044_product_membership_backfill
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa


revision = "0045_space_access_passes"
down_revision = "0044_product_membership_backfill"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    ]


def _public_id_column() -> sa.Column:
    return sa.Column("public_id", sa.String(36), nullable=True)


def upgrade() -> None:
    op.create_table(
        "space_access_passes",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("space_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False),
        sa.Column("token_encrypted", sa.String(768), nullable=False),
        sa.Column("valid_from_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(255), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_space_access_passes_public_id", "space_access_passes", ["public_id"], unique=True)
    op.create_index("ix_space_access_passes_booking_id", "space_access_passes", ["booking_id"], unique=True)
    op.create_index("ix_space_access_passes_token_hash", "space_access_passes", ["token_hash"], unique=True)
    for col in [
        "tenant_id",
        "booking_request_id",
        "location_id",
        "space_id",
        "user_id",
        "expires_at",
        "status",
    ]:
        op.create_index(f"ix_space_access_passes_{col}", "space_access_passes", [col])

    op.create_table(
        "space_attendance_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("access_pass_id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("space_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("scanned_by_user_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(16), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_space_attendance_records_public_id", "space_attendance_records", ["public_id"], unique=True)
    op.create_index(
        "ix_space_attendance_booking_event",
        "space_attendance_records",
        ["booking_id", "event_type"],
        unique=True,
    )
    for col in [
        "tenant_id",
        "access_pass_id",
        "booking_id",
        "location_id",
        "space_id",
        "member_id",
        "scanned_by_user_id",
        "event_type",
        "status",
        "event_at",
    ]:
        op.create_index(f"ix_space_attendance_records_{col}", "space_attendance_records", [col])


def downgrade() -> None:
    op.drop_index("ix_space_attendance_booking_event", table_name="space_attendance_records")
    for col in [
        "event_at",
        "status",
        "event_type",
        "scanned_by_user_id",
        "member_id",
        "space_id",
        "location_id",
        "booking_id",
        "access_pass_id",
        "tenant_id",
        "public_id",
    ]:
        op.drop_index(f"ix_space_attendance_records_{col}", table_name="space_attendance_records")
    op.drop_table("space_attendance_records")

    for col in [
        "status",
        "expires_at",
        "token_hash",
        "user_id",
        "space_id",
        "location_id",
        "booking_request_id",
        "booking_id",
        "tenant_id",
        "public_id",
    ]:
        op.drop_index(f"ix_space_access_passes_{col}", table_name="space_access_passes")
    op.drop_table("space_access_passes")
