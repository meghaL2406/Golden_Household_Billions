import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

if settings.cloudinary_enabled:
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


async def store_file(file: UploadFile, folder: str) -> dict:
    """Upload to Cloudinary when configured, otherwise keep the file locally. Returns storage metadata."""
    content = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    if settings.cloudinary_enabled:
        result = cloudinary.uploader.upload(
            content, folder=f"familyid/{folder}", resource_type="auto", use_filename=True, unique_filename=True,
        )
        return {
            "storage_provider": "CLOUDINARY",
            "cloudinary_file_id": result["public_id"],
            "file_url": result["secure_url"],
            "size_bytes": result.get("bytes", len(content)),
        }
    name = f"{uuid.uuid4().hex}{ext}"
    target_dir = UPLOAD_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / name).write_bytes(content)
    return {
        "storage_provider": "LOCAL",
        "cloudinary_file_id": None,
        "file_url": f"/uploads/{folder}/{name}",
        "size_bytes": len(content),
    }
