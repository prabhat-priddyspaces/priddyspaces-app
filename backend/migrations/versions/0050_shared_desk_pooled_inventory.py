"""shared desk pooled inventory

Revision ID: 0050_shared_desk_inventory
Revises: 0049_space_setup_fee_items
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa


revision = "0050_shared_desk_inventory"
down_revision = "0049_space_setup_fee_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("blocks_inventory", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_active_inventory_overlap")
        op.execute(
            """
            UPDATE bookings AS b
            SET blocks_inventory = false
            FROM booking_requests AS br, spaces AS s
            WHERE b.booking_request_id = br.id
              AND b.space_id = s.id
              AND s.space_type = 'shared_desk'
              AND br.request_kind = 'daily_booking'
            """
        )
        op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
        op.execute(
            """
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_no_active_inventory_overlap
            EXCLUDE USING gist (
                space_id WITH =,
                tstzrange(inventory_start_datetime, inventory_end_datetime, '[)') WITH &&
            )
            WHERE (
                status IN ('pending', 'confirmed')
                AND blocks_inventory = true
                AND inventory_start_datetime IS NOT NULL
                AND inventory_end_datetime IS NOT NULL
            )
            """
        )
    else:
        op.execute(
            """
            UPDATE bookings
            SET blocks_inventory = 0
            WHERE booking_request_id IN (
                SELECT br.id
                FROM booking_requests AS br
                JOIN spaces AS s ON s.id = br.space_id
                WHERE s.space_type = 'shared_desk'
                  AND br.request_kind = 'daily_booking'
            )
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_active_inventory_overlap")
        op.execute(
            """
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_no_active_inventory_overlap
            EXCLUDE USING gist (
                space_id WITH =,
                tstzrange(inventory_start_datetime, inventory_end_datetime, '[)') WITH &&
            )
            WHERE (
                status IN ('pending', 'confirmed')
                AND inventory_start_datetime IS NOT NULL
                AND inventory_end_datetime IS NOT NULL
            )
            """
        )
    op.drop_column("bookings", "blocks_inventory")
