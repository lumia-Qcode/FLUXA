import os
import re
import uuid

from flask import Blueprint, current_app, request, send_file
from werkzeug.utils import secure_filename

from app.database import get_connection

asset_bp = Blueprint("assets", __name__)

ALLOWED_MIME_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
}

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_SIZE = 50 * 1024 * 1024  # 50 MB


def sanitize_svg(content: bytes) -> bytes:
    """Sanitize SVG by stripping <script> tags, inline javascript event handlers, and javascript: URIs."""
    text = content.decode("utf-8", errors="ignore")
    # Remove script tags and contents
    text = re.sub(r"<script[\s\S]*?</script>", "", text, flags=re.IGNORECASE)
    # Remove event handlers (e.g. onload, onerror, onclick)
    text = re.sub(r"\bon\w+\s*=\s*([\"'][^\"']*[\"']|[^\s>]+)", "", text, flags=re.IGNORECASE)
    # Remove javascript: URIs
    text = re.sub(r"href\s*=\s*([\"'])\s*javascript:[^\"']*\1", "", text, flags=re.IGNORECASE)
    return text.encode("utf-8")


@asset_bp.post("/api/presentations/<int:presentation_id>/assets")
def upload_asset(presentation_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        pres = connection.execute("SELECT id FROM presentations WHERE id = ?", (presentation_id,)).fetchone()
        if pres is None:
            return {"error": "Presentation not found."}, 404
    finally:
        connection.close()

    if "file" not in request.files:
        return {"error": "No file uploaded. Expected 'file' multipart field."}, 400

    file = request.files["file"]
    if not file or not file.filename:
        return {"error": "Empty file uploaded."}, 400

    filename = secure_filename(file.filename) or "upload"
    mime = file.mimetype or "application/octet-stream"

    # Fallback MIME detection from extension if generic octet-stream
    ext = os.path.splitext(filename)[1].lower()
    if mime == "application/octet-stream":
        ext_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4"}
        if ext in ext_map:
            mime = ext_map[ext]

    if mime not in ALLOWED_MIME_TYPES:
        return {
            "error": f"Disallowed file type: {mime}. Allowed types: {', '.join(ALLOWED_MIME_TYPES.keys())}"
        }, 415

    # Read data and check size limits
    data = file.read()
    size = len(data)

    is_video = mime == "video/mp4"
    max_size = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE
    if size > max_size:
        limit_mb = max_size // (1024 * 1024)
        return {"error": f"File size exceeds limit of {limit_mb} MB."}, 413

    # Sanitize SVG if needed
    if mime == "image/svg+xml":
        data = sanitize_svg(data)
        size = len(data)

    asset_id = f"asset_{uuid.uuid4().hex[:12]}"
    file_ext = ALLOWED_MIME_TYPES[mime]
    upload_dir = os.path.join(
        os.path.dirname(current_app.config["DATABASE_PATH"]),
        "uploads",
        str(presentation_id),
    )
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{asset_id}{file_ext}")

    with open(file_path, "wb") as f:
        f.write(data)

    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        connection.execute(
            """
            INSERT INTO assets (id, presentation_id, filename, mime, size, path)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (asset_id, presentation_id, filename, mime, size, file_path),
        )
        connection.commit()
    finally:
        connection.close()

    return {
        "id": asset_id,
        "presentation_id": presentation_id,
        "filename": filename,
        "mime": mime,
        "size": size,
        "url": f"/api/assets/{asset_id}",
    }, 201


@asset_bp.get("/api/assets/<string:asset_id>")
def get_asset(asset_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = connection.execute(
            "SELECT id, presentation_id, filename, mime, size, path FROM assets WHERE id = ?",
            (asset_id,),
        ).fetchone()
    finally:
        connection.close()

    if row is None:
        return {"error": "Asset not found."}, 404

    file_path = row["path"]
    if not os.path.exists(file_path):
        return {"error": "Asset file not found on disk."}, 404

    response = send_file(
        file_path,
        mimetype=row["mime"],
        as_attachment=False,
        download_name=row["filename"],
    )
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Length"] = str(row["size"])
    response.headers["Content-Disposition"] = f'inline; filename="{row["filename"]}"'
    return response


@asset_bp.delete("/api/assets/<string:asset_id>")
def delete_asset(asset_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = connection.execute("SELECT id, path FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if row is None:
            return {"error": "Asset not found."}, 404

        file_path = row["path"]
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

        connection.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        connection.commit()
    finally:
        connection.close()

    return {"message": "Asset deleted successfully"}, 200
