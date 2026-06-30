"""Convert spaces.space_type from Enum to String and FK it to space_types.key.

The previous Enum column already stored the lowercase string values, so the
type change is value-preserving. A foreign key to the new space_types registry
is added with the NOT VALID -> VALIDATE pattern used elsewhere in this project
to avoid a long table lock.

Revision ID: 0061_spaces_space_type_to_string_fk
Revises: 0060_create_space_types_registry
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa


revision = "0061_spaces_space_type_to_string_fk"
down_revision = "0060_create_space_types_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "spaces",
        "space_type",
        type_=sa.String(length=64),
        existing_nullable=False,
        postgresql_using="space_type::text",
    )
    op.create_index("ix_spaces_space_type", "spaces", ["space_type"])

    # Drop the now-unused enum type if nothing else references it.
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'spacetype')
                   AND NOT EXISTS (
                       SELECT 1 FROM pg_attribute a
                       JOIN pg_type t ON a.atttypid = t.oid
                       WHERE t.typname = 'spacetype' AND a.attisdropped = false
                   )
                THEN
                    DROP TYPE spacetype;
                END IF;
            END $$;
            """
        )
    )

    op.execute(
        sa.text(
            "ALTER TABLE spaces "
            "ADD CONSTRAINT fk_spaces_space_type "
            "FOREIGN KEY (space_type) REFERENCES space_types(key) "
            "ON DELETE RESTRICT NOT VALID"
        )
    )
    op.execute(sa.text("ALTER TABLE spaces VALIDATE CONSTRAINT fk_spaces_space_type"))


def downgrade() -> None:
    op.drop_constraint("fk_spaces_space_type", "spaces", type_="foreignkey")
    op.drop_index("ix_spaces_space_type", table_name="spaces")
    # Recreate the enum type and convert back. NOTE: this fails if any space uses
    # a space type added after the enum was removed (e.g. event_space). Such rows
    # must be migrated away before downgrading past this revision.
    op.execute(
        sa.text(
            "CREATE TYPE spacetype AS ENUM "
            "('private_office', 'shared_desk', 'conference_room', 'virtual_office', 'suite')"
        )
    )
    op.alter_column(
        "spaces",
        "space_type",
        type_=sa.Enum(
            "private_office",
            "shared_desk",
            "conference_room",
            "virtual_office",
            "suite",
            name="spacetype",
        ),
        existing_nullable=False,
        postgresql_using="space_type::spacetype",
    )
