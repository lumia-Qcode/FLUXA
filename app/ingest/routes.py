"""Uploads API (F13).

POST   /api/uploads            multipart `files` (up to 30) + `area` (general | brand)
POST   /api/uploads/url        {"url", "area"}
GET    /api/uploads            ?area=&limit=
GET    /api/uploads/<id>       one upload, with what was extracted
GET    /api/uploads/<id>/file  the stored (checked, cleaned) file
DELETE /api/uploads/<id>

The `brand` area is for admins and brand managers. Members see their own uploads; admins
(and brand managers, for the brand area) see the org's. Everything else answers 404.
Checking and reading run as background jobs; follow them with /api/jobs/<jobId>.
"""

from __future__ import annotations

import os
import time

from flask import Blueprint, current_app, g, request, send_file

from app.ingest import jobs as _handlers  # noqa: F401  (registers the ingest.* job handlers)
from app.ingest import store
from app.ingest.guards import MAX_FILES_PER_BATCH, Rejected, check_size
from app.ingest.sniff import sniff
from app.jobs import enqueue
from app.jobs.queue import _connect

uploads_bp = Blueprint("uploads", __name__)

NOT_FOUND = ({"error": "Upload not found."}, 404)
MANAGERS = ("admin", "brand_manager")


def _db_path():
    return current_app.config["DATABASE_PATH"]


def _area(value):
    area = (value or "general").strip().lower()
    if area not in store.AREAS:
        return None, ({"error": "area must be 'general' or 'brand'.", "code": "bad_area"}, 400)
    if area == "brand" and g.get("role") not in MANAGERS:
        return None, ({"error": "Only admins and brand managers can add brand material.", "code": "forbidden"}, 403)
    return area, None


def _can_see(row) -> bool:
    role = g.get("role")
    if role == "admin" or row["user_id"] == g.user_id:
        return True
    return row["area"] == "brand" and role == "brand_manager"


def _visible(conn, upload_id):
    row = store.get(conn, g.org_id, upload_id)
    return row if row is not None and _can_see(row) else None


def _insert(conn, **fields):
    now = time.time()
    fields.update(org_id=g.org_id, user_id=g.user_id, created_at=now, updated_at=now)
    cols = ", ".join(fields)
    cur = conn.execute(f"INSERT INTO uploads ({cols}) VALUES ({', '.join('?' * len(fields))})", tuple(fields.values()))
    conn.commit()
    return cur.lastrowid


@uploads_bp.post("")
def upload_files():
    area, err = _area(request.form.get("area"))
    if err:
        return err
    files = [f for f in request.files.getlist("files") if f and f.filename]
    if not files:
        return {"error": "Choose at least one file (multipart field 'files').", "code": "no_files"}, 400
    if len(files) > MAX_FILES_PER_BATCH:
        return {"error": f"Upload at most {MAX_FILES_PER_BATCH} files at a time.", "code": "too_many_files"}, 400

    db_path = _db_path()
    items = []
    conn = _connect(db_path)
    try:
        for f in files:
            name = os.path.basename(f.filename.replace("\\", "/"))[:200]
            try:
                tmp, size, sha = store.save_stream(f.stream, db_path, g.org_id)
            except ValueError:
                items.append({"filename": name, "error": "The file is larger than 50 MB."})
                continue
            with open(tmp, "rb") as fh:
                found = sniff(fh.read(8192), tmp)
            try:
                if found.kind is None:
                    raise Rejected(found.reason)
                check_size(found.kind, size)
            except Rejected as exc:
                store.remove_quietly(tmp)
                items.append({"filename": name, "error": str(exc)})
                continue

            existing = conn.execute(
                "SELECT * FROM uploads WHERE org_id = ? AND area = ? AND sha256 = ? AND status = 'ready'",
                (g.org_id, area, sha),
            ).fetchone()
            if existing is not None and _can_see(existing):
                store.remove_quietly(tmp)
                items.append({"upload": store.upload_dict(existing), "duplicate": True})
                continue

            upload_id = _insert(conn, area=area, source="file", filename=name, kind=found.kind, mime=found.mime,
                                size=size, sha256=sha, tmp_path=tmp, status="pending")
            job_id = enqueue(db_path, "ingest.file", {"upload_id": upload_id}, org_id=g.org_id, user_id=g.user_id)
            store.update(conn, upload_id, job_id=job_id)
            items.append({"upload": store.upload_dict(store.get(conn, g.org_id, upload_id))})
    finally:
        conn.close()
    status = 201 if any("upload" in i for i in items) else 400
    return {"items": items}, status


@uploads_bp.post("/url")
def upload_url():
    data = request.get_json(silent=True) or {}
    area, err = _area(data.get("area"))
    if err:
        return err
    url = (data.get("url") or "").strip()
    if not url.startswith(("http://", "https://")) or len(url) > 2000:
        return {"error": "Enter a full website address starting with https://", "code": "bad_url"}, 400
    from app.ai.research_tools import UnsafeURLError, check_public_url

    try:
        check_public_url(url)
    except UnsafeURLError:
        return {"error": "That address can't be read: only public websites are allowed.", "code": "unsafe_url"}, 400
    db_path = _db_path()
    conn = _connect(db_path)
    try:
        upload_id = _insert(conn, area=area, source="url", filename=url[:200], source_url=url, kind="url",
                            mime="text/html", status="pending")
        job_id = enqueue(db_path, "ingest.url", {"upload_id": upload_id}, org_id=g.org_id, user_id=g.user_id)
        store.update(conn, upload_id, job_id=job_id)
        return {"upload": store.upload_dict(store.get(conn, g.org_id, upload_id))}, 201
    finally:
        conn.close()


@uploads_bp.get("")
def list_uploads():
    try:
        limit = max(1, min(int(request.args.get("limit", 50)), 200))
    except ValueError:
        limit = 50
    sql, args = "SELECT * FROM uploads WHERE org_id = ?", [g.org_id]
    if request.args.get("area"):
        sql += " AND area = ?"
        args.append(request.args["area"])
    sql += " ORDER BY created_at DESC LIMIT ?"
    args.append(limit * 3)
    conn = _connect(_db_path())
    try:
        rows = [r for r in conn.execute(sql, args).fetchall() if _can_see(r)][:limit]
        return {"uploads": [store.upload_dict(r) for r in rows]}
    finally:
        conn.close()


@uploads_bp.get("/<int:upload_id>")
def get_upload(upload_id):
    conn = _connect(_db_path())
    try:
        row = _visible(conn, upload_id)
        return {"upload": store.upload_dict(row, with_extract=True)} if row else NOT_FOUND
    finally:
        conn.close()


@uploads_bp.get("/<int:upload_id>/file")
def get_upload_file(upload_id):
    conn = _connect(_db_path())
    try:
        row = _visible(conn, upload_id)
    finally:
        conn.close()
    if row is None or row["status"] != "ready" or not row["storage_path"] or not os.path.exists(row["storage_path"]):
        return NOT_FOUND
    inline = (row["mime"] or "").startswith("image/")
    resp = send_file(row["storage_path"], mimetype=row["mime"], as_attachment=not inline, download_name=row["filename"] or None)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    resp.headers["Cache-Control"] = "private, max-age=3600"
    return resp


@uploads_bp.delete("/<int:upload_id>")
def delete_upload(upload_id):
    conn = _connect(_db_path())
    try:
        row = _visible(conn, upload_id)
        if row is None:
            return NOT_FOUND
        conn.execute("DELETE FROM uploads WHERE id = ? AND org_id = ?", (upload_id, g.org_id))
        conn.commit()
        if row["storage_path"]:
            still_used = conn.execute("SELECT 1 FROM uploads WHERE storage_path = ?", (row["storage_path"],)).fetchone()
            if not still_used:
                store.remove_quietly(row["storage_path"])
        store.remove_quietly(row["tmp_path"])
        return {"deleted": upload_id}
    finally:
        conn.close()
