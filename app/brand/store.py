"""Brand tables and org-scoped queries.

Every query here takes `org_id`; nothing reads a brand without it. Versions are
immutable once active (rollback = activate an older version again). The remaining
tables from docs/BRAND_INTELLIGENCE.md §2 (sources, extractions, fonts, access,
departments) arrive with the Part C features that use them.
"""

from __future__ import annotations

import json
import re
import sqlite3
from typing import Any, Dict, List, Optional

from app.brand.tokens import to_theme_overrides

EDITABLE_VERSION_STATUSES = ("draft", "in_review")


def init_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS brands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
            active_version_id INTEGER,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (org_id, slug)
        );
        CREATE TABLE IF NOT EXISTS brand_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
            org_id INTEGER NOT NULL,
            version INTEGER NOT NULL,
            tokens_json TEXT NOT NULL,
            rules_json TEXT NOT NULL DEFAULT '{}',
            locks_json TEXT NOT NULL DEFAULT '{}',
            source_summary TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'in_review', 'active', 'superseded')),
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            approved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (brand_id, version)
        );
        CREATE TABLE IF NOT EXISTS brand_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id INTEGER NOT NULL,
            brand_id INTEGER,
            actor_id INTEGER,
            action TEXT NOT NULL,
            before_json TEXT,
            after_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_brands_org ON brands(org_id);
        CREATE INDEX IF NOT EXISTS idx_brand_versions_org_brand ON brand_versions(org_id, brand_id);
        CREATE INDEX IF NOT EXISTS idx_brand_audit_org_brand ON brand_audit(org_id, brand_id);
        """
    )
    cols = {r[1] for r in connection.execute("PRAGMA table_info(presentations)").fetchall()}
    if "brand_id" not in cols:
        connection.execute("ALTER TABLE presentations ADD COLUMN brand_id INTEGER REFERENCES brands(id)")
    if "brand_version_id" not in cols:
        connection.execute("ALTER TABLE presentations ADD COLUMN brand_version_id INTEGER REFERENCES brand_versions(id)")


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:60] or "brand"


def unique_slug(connection: sqlite3.Connection, org_id: int, name: str) -> str:
    base = slugify(name)
    slug, n = base, 2
    while connection.execute("SELECT 1 FROM brands WHERE org_id = ? AND slug = ?", (org_id, slug)).fetchone():
        slug, n = f"{base}-{n}", n + 1
    return slug


def audit(connection, org_id, brand_id, actor_id, action, before=None, after=None) -> None:
    connection.execute(
        "INSERT INTO brand_audit (org_id, brand_id, actor_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)",
        (
            org_id,
            brand_id,
            actor_id,
            action,
            json.dumps(before) if before is not None else None,
            json.dumps(after) if after is not None else None,
        ),
    )


def get_brand(connection, org_id: int, brand_id: int) -> Optional[sqlite3.Row]:
    return connection.execute("SELECT * FROM brands WHERE id = ? AND org_id = ?", (brand_id, org_id)).fetchone()


def get_version(connection, org_id: int, brand_id: int, version_id: int) -> Optional[sqlite3.Row]:
    return connection.execute(
        "SELECT * FROM brand_versions WHERE id = ? AND brand_id = ? AND org_id = ?",
        (version_id, brand_id, org_id),
    ).fetchone()


def list_brands(connection, org_id: int) -> List[Dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT b.id, b.name, b.slug, b.status, b.active_version_id, b.created_at, v.version AS active_version,
               (SELECT COUNT(*) FROM brand_versions x WHERE x.brand_id = b.id AND x.org_id = b.org_id) AS version_count
        FROM brands b
        LEFT JOIN brand_versions v ON v.id = b.active_version_id AND v.org_id = b.org_id
        WHERE b.org_id = ?
        ORDER BY b.name COLLATE NOCASE
        """,
        (org_id,),
    ).fetchall()
    return [brand_summary(r) for r in rows]


def brand_summary(row) -> Dict[str, Any]:
    keys = row.keys()
    return {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "status": row["status"],
        "activeVersionId": row["active_version_id"],
        "activeVersion": row["active_version"] if "active_version" in keys else None,
        "versionCount": row["version_count"] if "version_count" in keys else None,
        "createdAt": row["created_at"],
    }


def version_dict(row, with_tokens: bool = True) -> Dict[str, Any]:
    out = {
        "id": row["id"],
        "brandId": row["brand_id"],
        "version": row["version"],
        "status": row["status"],
        "sourceSummary": row["source_summary"],
        "createdBy": row["created_by"],
        "approvedBy": row["approved_by"],
        "approvedAt": row["approved_at"],
        "createdAt": row["created_at"],
    }
    if with_tokens:
        out["tokens"] = json.loads(row["tokens_json"])
    return out


def add_version(connection, org_id: int, brand_id: int, tokens: Dict[str, Any], actor_id, source_summary: str = "") -> int:
    next_version = connection.execute(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM brand_versions WHERE brand_id = ? AND org_id = ?",
        (brand_id, org_id),
    ).fetchone()[0]
    cur = connection.execute(
        """
        INSERT INTO brand_versions (brand_id, org_id, version, tokens_json, source_summary, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (brand_id, org_id, next_version, json.dumps(tokens), source_summary[:2000], actor_id),
    )
    return cur.lastrowid


def deck_brand(connection, org_id: Optional[int], brand_id: Optional[int], version_id: Optional[int]) -> Optional[Dict[str, Any]]:
    """What the renderer needs for a deck's pinned brand version, or None (no brand)."""
    if not brand_id or not version_id or org_id is None:
        return None
    row = connection.execute(
        """
        SELECT b.id AS brand_id, b.name, v.id AS version_id, v.version, v.tokens_json
        FROM brands b JOIN brand_versions v ON v.brand_id = b.id
        WHERE b.id = ? AND v.id = ? AND b.org_id = ? AND v.org_id = ?
        """,
        (brand_id, version_id, org_id, org_id),
    ).fetchone()
    if row is None:
        return None
    tokens = json.loads(row["tokens_json"])
    return {
        "id": row["brand_id"],
        "name": row["name"],
        "versionId": row["version_id"],
        "version": row["version"],
        "tokens": tokens,
        "themeOverrides": to_theme_overrides(tokens),
    }


def deck_brand_for(connection, presentation_id: int) -> Optional[Dict[str, Any]]:
    row = connection.execute(
        "SELECT org_id, brand_id, brand_version_id FROM presentations WHERE id = ?", (presentation_id,)
    ).fetchone()
    if row is None:
        return None
    return deck_brand(connection, row["org_id"], row["brand_id"], row["brand_version_id"])
