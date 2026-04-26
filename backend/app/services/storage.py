import uuid

import boto3
from fastapi import HTTPException

from app.core.config import settings


def presign_floor_plan_upload(filename: str) -> dict:
    if not settings.S3_BUCKET or not settings.S3_REGION:
        raise HTTPException(status_code=500, detail="S3 not configured")

    s3 = boto3.client("s3", region_name=settings.S3_REGION)
    key = f"floor-plans/{uuid.uuid4()}-{filename}"

    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=3600
    )

    return {"upload_url": url, "key": key}


def presign_space_image_upload(filename: str, content_type: str | None = None) -> dict:
    if not settings.S3_BUCKET or not settings.S3_REGION:
        raise HTTPException(status_code=500, detail="S3 not configured")

    s3 = boto3.client("s3", region_name=settings.S3_REGION)
    key = f"spaces/{uuid.uuid4()}-{filename}"

    params = {"Bucket": settings.S3_BUCKET, "Key": key}
    if content_type:
        params["ContentType"] = content_type

    url = s3.generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=3600
    )

    public_url = f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"
    return {"upload_url": url, "key": key, "public_url": public_url}


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
