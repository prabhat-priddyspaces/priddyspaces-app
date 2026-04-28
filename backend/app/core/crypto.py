from __future__ import annotations

import base64
import hashlib
import hmac
import os

from app.core.config import settings


def _credential_key() -> bytes:
    raw = (
        settings.PAYMENT_CREDENTIAL_ENCRYPTION_KEY
        or settings.JWT_SECRET
        or "priddyspaces-local-payment-credential-key"
    )
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        counter += 1
        out.extend(hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest())
    return bytes(out[:length])


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    plaintext = value.encode("utf-8")
    key = _credential_key()
    nonce = os.urandom(16)
    stream = _keystream(key, nonce, len(plaintext))
    ciphertext = bytes(a ^ b for a, b in zip(plaintext, stream))
    tag = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    token = base64.urlsafe_b64encode(nonce + tag + ciphertext).decode("ascii")
    return f"v1:{token}"


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    if not value.startswith("v1:"):
        return value
    raw = base64.urlsafe_b64decode(value[3:].encode("ascii"))
    nonce = raw[:16]
    tag = raw[16:48]
    ciphertext = raw[48:]
    key = _credential_key()
    expected = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("Encrypted credential could not be verified")
    stream = _keystream(key, nonce, len(ciphertext))
    plaintext = bytes(a ^ b for a, b in zip(ciphertext, stream))
    return plaintext.decode("utf-8")
