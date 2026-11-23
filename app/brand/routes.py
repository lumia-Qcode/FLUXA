"""Brand store API (F6).

/api/brands                                   GET list, POST create            (create: admin, brand_manager)
/api/brands/<id>                              GET, PATCH name/status           (PATCH: admin, brand_manager)
/api/brands/<id>/versions                     POST new draft version           (admin, brand_manager)
/api/brands/<id>/versions/<vid>               GET, PUT tokens (drafts only)    (PUT: admin, brand_manager)
/api/brands/<id>/versions/<vid>/activate      POST                             (admin, brand_manager)
/api/presentations/<id>/brand                 PUT {brand_id | null}            (any member of the deck's org)

Everything is scoped to the signed-in member's org; another org's brand answers 404.
"""

from __future__ import annotations

import json

from flask import Blueprint, current_app, g, request

from app.auth import require_role
from app.brand import store
from app.brand.tokens import TokenError, validate_tokens
from app.database import get_connection

brand_bp = Blueprint("brands", __name__)
deck_brand_bp = Blueprint("deck_brand", __name__)

MANAGERS = ("admin", "brand_manager")
NOT_FOUND = ({"error": "Brand not found."}, 404)


def _db():
    return get_connection(current_app.config["DATABASE_PATH"])


def _tokens_or_error(raw):
    try:
        return validate_tokens(raw), None
    except TokenError as exc:
        return None, ({"error": "The brand tokens are not valid.", "code": "invalid_tokens", "problems": exc.problems}, 400)


def _clean_name(value):
    name = (value or "").strip() if isinstance(value, str) else ""
    return name[:80] if name else None


@brand_bp.get("")
def list_brands():
    conn = _db()
    try:
        return {"brands": store.list_brands(conn, g.org_id)}
    finally:
        conn.close()


@brand_bp.post("")
@require_role(*MANAGERS)
def create_brand():
    data = request.get_json(silent=True) or {}
    name = _clean_name(data.get("name"))
    if not name:
        return {"error": "Give the brand a name.", "code": "name_required"}, 400
    tokens = None
    if data.get("tokens") is not None:
        tokens, err = _tokens_or_error(data["tokens"])
        if err:
            return err
    conn = _db()
    try:
        slug = store.unique_slug(conn, g.org_id, name)
        cur = conn.execute(
            "INSERT INTO brands (org_id, name, slug, created_by) VALUES (?, ?, ?, ?)",
            (g.org_id, name, slug, g.user_id),
        )
        brand_id = cur.lastrowid
        store.audit(conn, g.org_id, brand_id, g.user_id, "brand.create", after={"name": name, "slug": slug})
        version = None
        if tokens is not None:
            vid = store.add_version(conn, g.org_id, brand_id, tokens, g.user_id, str(data.get("source_summary") or ""))
            store.audit(conn, g.org_id, brand_id, g.user_id, "version.create", after={"version_id": vid})
            version = store.version_dict(store.get_version(conn, g.org_id, brand_id, vid))
        conn.commit()
        brand = store.brand_summary(store.get_brand(conn, g.org_id, brand_id))
        return {"brand": brand, "version": version}, 201
    finally:
        conn.close()


@brand_bp.get("/<int:brand_id>")
def get_brand(brand_id):
    conn = _db()
    try:
        row = store.get_brand(conn, g.org_id, brand_id)
        if row is None:
            return NOT_FOUND
        versions = conn.execute(
            "SELECT * FROM brand_versions WHERE brand_id = ? AND org_id = ? ORDER BY version DESC",
            (brand_id, g.org_id),
        ).fetchall()
        active = next((v for v in versions if v["id"] == row["active_version_id"]), None)
        return {
            "brand": store.brand_summary(row),
            "versions": [store.version_dict(v, with_tokens=False) for v in versions],
            "activeTokens": store.version_dict(active)["tokens"] if active else None,
        }
    finally:
        conn.close()


@brand_bp.patch("/<int:brand_id>")
@require_role(*MANAGERS)
def update_brand(brand_id):
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        row = store.get_brand(conn, g.org_id, brand_id)
        if row is None:
            return NOT_FOUND
        before = {"name": row["name"], "status": row["status"]}
        name = row["name"]
        status = row["status"]
        if "name" in data:
            name = _clean_name(data["name"])
            if not name:
                return {"error": "Give the brand a name.", "code": "name_required"}, 400
        if "status" in data:
            if data["status"] == "archived":
                status = "archived"
            elif data["status"] == "active":
                if not row["active_version_id"]:
                    return {"error": "Activate a version first.", "code": "no_active_version"}, 409
                status = "active"
            else:
                return {"error": "Status must be 'active' or 'archived'.", "code": "bad_status"}, 400
        conn.execute("UPDATE brands SET name = ?, status = ? WHERE id = ? AND org_id = ?", (name, status, brand_id, g.org_id))
        store.audit(conn, g.org_id, brand_id, g.user_id, "brand.update", before=before, after={"name": name, "status": status})
        conn.commit()
        return {"brand": store.brand_summary(store.get_brand(conn, g.org_id, brand_id))}
    finally:
        conn.close()


@brand_bp.post("/<int:brand_id>/versions")
@require_role(*MANAGERS)
def create_version(brand_id):
    data = request.get_json(silent=True) or {}
    tokens, err = _tokens_or_error(data.get("tokens"))
    if err:
        return err
    conn = _db()
    try:
        if store.get_brand(conn, g.org_id, brand_id) is None:
            return NOT_FOUND
        vid = store.add_version(conn, g.org_id, brand_id, tokens, g.user_id, str(data.get("source_summary") or ""))
        store.audit(conn, g.org_id, brand_id, g.user_id, "version.create", after={"version_id": vid})
        conn.commit()
        return {"version": store.version_dict(store.get_version(conn, g.org_id, brand_id, vid))}, 201
    finally:
        conn.close()


@brand_bp.get("/<int:brand_id>/versions/<int:version_id>")
def get_version(brand_id, version_id):
    conn = _db()
    try:
        row = store.get_version(conn, g.org_id, brand_id, version_id)
        if row is None:
            return NOT_FOUND
        return {"version": store.version_dict(row)}
    finally:
        conn.close()


@brand_bp.put("/<int:brand_id>/versions/<int:version_id>")
@require_role(*MANAGERS)
def update_version(brand_id, version_id):
    data = request.get_json(silent=True) or {}
    tokens, err = _tokens_or_error(data.get("tokens"))
    if err:
        return err
    conn = _db()
    try:
        row = store.get_version(conn, g.org_id, brand_id, version_id)
        if row is None:
            return NOT_FOUND
        if row["status"] not in store.EDITABLE_VERSION_STATUSES:
            return {
                "error": "This version has been active and can't be changed. Create a new version instead.",
                "code": "version_immutable",
            }, 409
        conn.execute(
            "UPDATE brand_versions SET tokens_json = ? WHERE id = ? AND org_id = ?",
            (json.dumps(tokens), version_id, g.org_id),
        )
        store.audit(conn, g.org_id, brand_id, g.user_id, "version.update", before=json.loads(row["tokens_json"]), after=tokens)
        conn.commit()
        return {"version": store.version_dict(store.get_version(conn, g.org_id, brand_id, version_id))}
    finally:
        conn.close()


@brand_bp.post("/<int:brand_id>/versions/<int:version_id>/activate")
@require_role(*MANAGERS)
def activate_version(brand_id, version_id):
    conn = _db()
    try:
        brand = store.get_brand(conn, g.org_id, brand_id)
        row = store.get_version(conn, g.org_id, brand_id, version_id)
        if brand is None or row is None:
            return NOT_FOUND
        # Stored tokens were validated on write; check again in case the schema tightened since.
        _, err = _tokens_or_error(json.loads(row["tokens_json"]))
        if err:
            return err
        previous = brand["active_version_id"]
        conn.execute(
            "UPDATE brand_versions SET status = 'superseded' WHERE brand_id = ? AND org_id = ? AND status = 'active'",
            (brand_id, g.org_id),
        )
        conn.execute(
            """
            UPDATE brand_versions SET status = 'active', approved_by = ?, approved_at = CURRENT_TIMESTAMP
            WHERE id = ? AND org_id = ?
            """,
            (g.user_id, version_id, g.org_id),
        )
        new_status = "archived" if brand["status"] == "archived" else "active"
        conn.execute(
            "UPDATE brands SET active_version_id = ?, status = ? WHERE id = ? AND org_id = ?",
            (version_id, new_status, brand_id, g.org_id),
        )
        store.audit(
            conn, g.org_id, brand_id, g.user_id, "version.activate",
            before={"active_version_id": previous}, after={"active_version_id": version_id},
        )
        conn.commit()
        return {
            "brand": store.brand_summary(store.get_brand(conn, g.org_id, brand_id)),
            "version": store.version_dict(store.get_version(conn, g.org_id, brand_id, version_id)),
        }
    finally:
        conn.close()


@deck_brand_bp.put("/<int:presentation_id>/brand")
def set_deck_brand(presentation_id):
    """Apply a brand to a deck (pins its current active version) or clear it with null."""
    data = request.get_json(silent=True) or {}
    if "brand_id" not in data:
        return {"error": "Send brand_id (or null to remove the brand).", "code": "brand_id_required"}, 400
    brand_id = data["brand_id"]
    conn = _db()
    try:
        deck = conn.execute(
            "SELECT id, brand_id, brand_version_id FROM presentations WHERE id = ? AND org_id = ?",
            (presentation_id, g.org_id),
        ).fetchone()
        if deck is None:
            return {"error": "Presentation not found."}, 404
        before = {"brand_id": deck["brand_id"], "brand_version_id": deck["brand_version_id"]}
        if brand_id is None:
            conn.execute("UPDATE presentations SET brand_id = NULL, brand_version_id = NULL WHERE id = ?", (presentation_id,))
            store.audit(conn, g.org_id, before["brand_id"], g.user_id, "deck.brand_clear", before=before, after={"presentation_id": presentation_id})
            conn.commit()
            return {"brand": None}
        if not isinstance(brand_id, int) or isinstance(brand_id, bool):
            return {"error": "brand_id must be a number or null.", "code": "bad_brand_id"}, 400
        brand = store.get_brand(conn, g.org_id, brand_id)
        if brand is None:
            return NOT_FOUND
        if brand["status"] != "active" or not brand["active_version_id"]:
            return {"error": "Only an active brand can be applied to a deck.", "code": "brand_not_active"}, 409
        conn.execute(
            "UPDATE presentations SET brand_id = ?, brand_version_id = ? WHERE id = ?",
            (brand_id, brand["active_version_id"], presentation_id),
        )
        after = {"presentation_id": presentation_id, "brand_id": brand_id, "brand_version_id": brand["active_version_id"]}
        store.audit(conn, g.org_id, brand_id, g.user_id, "deck.brand_set", before=before, after=after)
        conn.commit()
        return {"brand": store.deck_brand(conn, g.org_id, brand_id, brand["active_version_id"])}
    finally:
        conn.close()
