from __future__ import annotations

from app.models.enums import SpaceType
from app.models.organization import Organization


WAITLIST_SPACE_TYPE_FIELDS = {
    SpaceType.CONFERENCE_ROOM.value: "waitlist_conference_room_enabled",
    SpaceType.PRIVATE_OFFICE.value: "waitlist_private_office_enabled",
    SpaceType.SHARED_DESK.value: "waitlist_shared_desk_enabled",
    SpaceType.SUITE.value: "waitlist_suite_enabled",
    SpaceType.VIRTUAL_OFFICE.value: "waitlist_virtual_office_enabled",
}


def _space_type_value(space_type: SpaceType | str) -> str:
    return space_type.value if hasattr(space_type, "value") else str(space_type)


def waitlist_type_values(organization: Organization) -> dict[str, bool]:
    return {
        space_type: bool(getattr(organization, field, False))
        for space_type, field in WAITLIST_SPACE_TYPE_FIELDS.items()
    }


def organization_waitlist_any_enabled(organization: Organization) -> bool:
    values = waitlist_type_values(organization)
    return any(values.values()) or bool(getattr(organization, "waitlist_enabled", False))


def waitlist_enabled_for_space_type(organization: Organization, space_type: SpaceType | str) -> bool:
    values = waitlist_type_values(organization)
    field = WAITLIST_SPACE_TYPE_FIELDS.get(_space_type_value(space_type))
    if not field:
        return False
    if any(values.values()):
        return bool(getattr(organization, field, False))
    return bool(getattr(organization, "waitlist_enabled", False))


def sync_legacy_waitlist_enabled(organization: Organization) -> None:
    organization.waitlist_enabled = any(waitlist_type_values(organization).values())


def waitlist_settings_payload(organization: Organization) -> dict[str, bool]:
    values = waitlist_type_values(organization)
    return {
        "waitlist_enabled": organization_waitlist_any_enabled(organization),
        **{
            field: values[space_type]
            for space_type, field in WAITLIST_SPACE_TYPE_FIELDS.items()
        },
    }
