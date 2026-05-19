import uuid
from pathlib import PurePath
from urllib.parse import quote

import boto3
from fastapi import HTTPException

from app.core.config import settings

ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
PRESIGNED_UPLOAD_EXPIRES_SECONDS = 900


def _encoded_storage_key(key: str) -> str:
    return quote(key.lstrip("/"), safe="/")


def _safe_image_extension(filename: str, content_type: str, size_bytes: int) -> str:
    if size_bytes <= 0 or size_bytes > MAX_IMAGE_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image upload exceeds size limit")
    extension = ALLOWED_IMAGE_CONTENT_TYPES.get(content_type)
    if not extension:
        raise HTTPException(status_code=400, detail="Unsupported image content type")
    suffix = PurePath(filename).suffix.lower()
    if suffix and suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image file extension")
    return extension


def public_space_image_url(key: str, fallback_url: str | None = None) -> str:
    public_base_url = settings.S3_PUBLIC_BASE_URL.strip().rstrip("/")
    if public_base_url and key.startswith("spaces/"):
        return f"{public_base_url}/{_encoded_storage_key(key)}"
    if fallback_url:
        return fallback_url
    return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{_encoded_storage_key(key)}"


def public_floor_plan_url(key: str, fallback_url: str | None = None) -> str:
    public_base_url = settings.S3_PUBLIC_BASE_URL.strip().rstrip("/")
    if public_base_url and key.startswith("floor-plans/"):
        return f"{public_base_url}/{_encoded_storage_key(key)}"
    if fallback_url:
        return fallback_url
    return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{_encoded_storage_key(key)}"


def presign_floor_plan_upload(filename: str, content_type: str, size_bytes: int) -> dict:
    extension = _safe_image_extension(filename, content_type, size_bytes)
    if not settings.S3_BUCKET or not settings.S3_REGION:
        raise HTTPException(status_code=500, detail="S3 not configured")

    s3 = boto3.client("s3", region_name=settings.S3_REGION)
    key = f"floor-plans/{uuid.uuid4()}{extension}"

    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=PRESIGNED_UPLOAD_EXPIRES_SECONDS,
    )

    return {
        "upload_url": url,
        "key": key,
        "public_url": public_floor_plan_url(key),
        "max_bytes": MAX_IMAGE_UPLOAD_BYTES,
    }


def presign_space_image_upload(filename: str, content_type: str, size_bytes: int) -> dict:
    extension = _safe_image_extension(filename, content_type, size_bytes)
    if not settings.S3_BUCKET or not settings.S3_REGION:
        raise HTTPException(status_code=500, detail="S3 not configured")

    s3 = boto3.client("s3", region_name=settings.S3_REGION)
    key = f"spaces/{uuid.uuid4()}{extension}"

    params = {
        "Bucket": settings.S3_BUCKET,
        "Key": key,
        "ContentType": content_type,
    }

    url = s3.generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=PRESIGNED_UPLOAD_EXPIRES_SECONDS,
    )

    public_url = public_space_image_url(key)
    return {"upload_url": url, "key": key, "public_url": public_url, "max_bytes": MAX_IMAGE_UPLOAD_BYTES}


def upload_invoice_pdf(content: bytes, filename: str) -> str | None:
    if not settings.S3_BUCKET or not settings.S3_REGION:
        return None

    s3 = boto3.client("s3", region_name=settings.S3_REGION)
    key = f"invoices/{uuid.uuid4()}-{filename}"
    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=content,
        ContentType="application/pdf"
    )
    return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"
