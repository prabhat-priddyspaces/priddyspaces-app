from uuid6 import uuid7


def new_public_id() -> str:
    return str(uuid7())
