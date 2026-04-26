import bcrypt

# Bcrypt accepts at most 72 bytes; truncate to avoid ValueError
BCRYPT_MAX_PASSWORD_BYTES = 72


def _to_bcrypt_input(password: str) -> bytes:
    b = password.encode("utf-8")
    return b[:BCRYPT_MAX_PASSWORD_BYTES] if len(b) > BCRYPT_MAX_PASSWORD_BYTES else b


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(_to_bcrypt_input(password), salt)
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_to_bcrypt_input(plain), hashed.encode("utf-8"))
