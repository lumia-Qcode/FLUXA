"""The `uploads` table and file storage (outside the web root).

Files live at  <instance>/uploads/{org_id}/{area}/{sha[:2]}/{sha}{ext}  once accepted, and
at <instance>/uploads/{org_id}/tmp/{uuid} while they are being checked. Every query
takes org_id.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import time
import uuid
from typing import Any, Dict, Optional, Tuple

AREAS = ("general", "brand")
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # the largest per-type limit; finer limits in guards
STATUSES = ("pending", "processing", "ready", "rejected", "failed")


def init_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id INTEGER NOT NULL,
            user_id INTEGER,
            area TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('file', 'url')),
            filename TEXT NOT NULL DEFAULT '',
            source_url TEXT,
            kind TEXT,
            mime TEXT,
            size INTEGER NOT NULL DEFAULT 0,
            sha256 TEXT,
            tmp_path TEXT,
            storage_path TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'ready', 'rejected', 'failed')),
            error TEXT,
            extract_json TEXT,
            injection_suspected INTEGER NOT NULL DEFAULT 0,
            job_id TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_uploads_org_area ON uploads(org_id, area, created_at);
        CREATE INDEX IF NOT EXISTS idx_uploads_org_sha ON uploads(org_id, sha256);
        """
    )


def uploads_root(db_path: str) -> str:
    return os.path.join(os.path.dirname(os.path.abspath(db_path)), "uploads")


def save_stream(stream, db_path: str, org_id: int) -> Tuple[str, int, str]:
    """Write an incoming file to a temp path, hashing as it goes. Returns (path, size, sha256).
    Raises ValueError if it passes MAX_UPLOAD_BYTES."""
    tmp_dir = os.path.join(uploads_root(db_path), str(int(org_id)), "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    path = os.path.join(tmp_dir, uuid.uuid4().hex)
    digest, size = hashlib.sha256(), 0
    try:
        with open(path, "wb") as fh:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise ValueError("too large")
                digest.update(chunk)
                fh.write(chunk)
    except BaseException:
        if os.path.exists(path):
            os.remove(path)
        raise
    return path, size, digest.hexdigest()


def final_path(db_path: str, org_id: int, area: str, sha: str, ext: str) -> str:
    folder = os.path.join(uploads_root(db_path), str(int(org_id)), area, sha[:2])
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, sha + ext)


def move_into_place(src: str, dest: str) -> None:
    if os.path.exists(dest):
        os.remove(src)
    else:
        shutil.move(src, dest)


def remove_quietly(path: Optional[str]) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def get(conn, org_id: int, upload_id: int) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM uploads WHERE id = ? AND org_id = ?", (upload_id, org_id)).fetchone()


def update(conn, upload_id: int, **fields) -> None:
    fields["updated_at"] = time.time()
    cols = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE uploads SET {cols} WHERE id = ?", (*fields.values(), upload_id))
    conn.commit()


def upload_dict(row, with_extract: bool = False) -> Dict[str, Any]:
    out = {
        "id": row["id"],
        "area": row["area"],
        "source": row["source"],
        "filename": row["filename"],
        "sourceUrl": row["source_url"],
        "kind": row["kind"],
        "mime": row["mime"],
        "size": row["size"],
        "status": row["status"],
        "error": row["error"],
        "injectionSuspected": bool(row["injection_suspected"]),
        "jobId": row["job_id"],
        "createdAt": row["created_at"],
        "userId": row["user_id"],
    }
    if with_extract:
        out["extract"] = json.loads(row["extract_json"]) if row["extract_json"] else None
    return out
