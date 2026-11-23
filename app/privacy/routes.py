"""Privacy API (F15).

GET    /api/privacy/notice?session_id=     audience notice text and version (public)
POST   /api/privacy/participant/erase      {participant_id, session_id}: an attendee deletes their data (public)
GET    /api/privacy/consents               your consents (active and withdrawn)
POST   /api/privacy/consents               {purpose, scope}: grant a speaker consent for yourself
DELETE /api/privacy/consents/<purpose>     withdraw it (runs the purpose's cleanup hooks)
GET    /api/privacy/settings               the org's retention settings
PUT    /api/privacy/settings               {audienceRetentionDays, storeTranscripts} (admin)

Feature routes that need a speaker's consent use @consent_required(purpose).
"""

from __future__ import annotations

import functools
import re

from flask import Blueprint, current_app, g, request

from app.auth import audit, require_role
from app.database import get_connection
from app.jobs import job_handler
from app.jobs.queue import register_periodic
from app.privacy import store

privacy_bp = Blueprint("privacy", __name__)

LANG = r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$"


def _db():
    return get_connection(current_app.config["DATABASE_PATH"])


def consent_required(purpose: str, needs=None):
    """Refuse the view (403 consent_required) unless the signed-in user has an active consent.

    `needs` may be a dict or a function of the request returning one, e.g.
    lambda req: {"languages": [req.json["language"]]}.
    """

    def decorator(view):
        @functools.wraps(view)
        def wrapped(*args, **kwargs):
            required = needs(request) if callable(needs) else needs
            conn = _db()
            try:
                ok = store.has_consent(conn, g.org_id, "user", g.user_id, purpose, required)
            finally:
                conn.close()
            if not ok:
                return {
                    "error": "This needs your consent first.",
                    "code": "consent_required",
                    "purpose": purpose,
                    "label": store.PURPOSE_LABELS.get(purpose, purpose),
                }, 403
            return view(*args, **kwargs)

        return wrapped

    return decorator


@privacy_bp.get("/notice")
def notice():
    conn = _db()
    try:
        session_id = request.args.get("session_id") or ""
        org_id = store.session_org(conn, session_id) if session_id else None
        return store.audience_notice(conn, org_id)
    finally:
        conn.close()


@privacy_bp.post("/participant/erase")
def erase_participant():
    data = request.get_json(silent=True) or {}
    participant_id = str(data.get("participant_id") or "")
    session_id = str(data.get("session_id") or "")
    conn = _db()
    try:
        row = conn.execute(
            "SELECT id FROM live_participants WHERE id = ? AND session_id = ?", (participant_id, session_id)
        ).fetchone()
        if row is None:
            return {"error": "Nothing to delete for this attendee.", "code": "not_found"}, 404
        deleted = store.erase_participant(conn, participant_id)
        conn.commit()
        return {"deleted": deleted}
    finally:
        conn.close()


@privacy_bp.get("/consents")
def my_consents():
    conn = _db()
    try:
        rows = conn.execute(
            "SELECT * FROM consents WHERE org_id = ? AND subject_type = 'user' AND subject_id = ? ORDER BY id DESC",
            (g.org_id, str(g.user_id)),
        ).fetchall()
        return {"consents": [store.consent_dict(r) for r in rows], "purposes": {p: store.PURPOSE_LABELS[p] for p in store.USER_PURPOSES}}
    finally:
        conn.close()


def _clean_scope(purpose, raw):
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        return None, "scope must be an object"
    scope = {}
    if "languages" in raw:
        langs = raw["languages"]
        if not isinstance(langs, list) or not 1 <= len(langs) <= 20 or not all(isinstance(x, str) and re.match(LANG, x) for x in langs):
            return None, "languages must be a list of language codes such as 'ur' or 'ar'"
        scope["languages"] = sorted(set(langs))
    unknown = set(raw) - {"languages"}
    if unknown:
        return None, f"unknown scope keys: {', '.join(sorted(unknown))}"
    if purpose in (store.VOICE_TRANSLATION, store.VOICE_CLONE) and "languages" not in scope:
        return None, "say which languages this covers (scope.languages)"
    return scope, None


@privacy_bp.post("/consents")
def grant_consent():
    data = request.get_json(silent=True) or {}
    purpose = data.get("purpose")
    if purpose not in store.USER_PURPOSES:
        return {"error": "Unknown consent purpose.", "code": "bad_purpose"}, 400
    if data.get("confirm") is not True:
        return {"error": "Consent must be confirmed explicitly (confirm: true).", "code": "confirm_required"}, 400
    scope, err = _clean_scope(purpose, data.get("scope"))
    if err:
        return {"error": err, "code": "bad_scope"}, 400
    conn = _db()
    try:
        cid = store.grant(conn, g.org_id, "user", g.user_id, purpose, scope)
        audit(conn, "consent.grant", f"{purpose}:{cid}")
        conn.commit()
        row = conn.execute("SELECT * FROM consents WHERE id = ?", (cid,)).fetchone()
        return {"consent": store.consent_dict(row)}, 201
    finally:
        conn.close()


@privacy_bp.delete("/consents/<purpose>")
def withdraw_consent(purpose):
    if purpose not in store.USER_PURPOSES:
        return {"error": "Unknown consent purpose.", "code": "bad_purpose"}, 400
    conn = _db()
    try:
        changed = store.revoke(conn, g.org_id, "user", g.user_id, purpose)
        if changed:
            audit(conn, "consent.revoke", purpose)
        conn.commit()
        return {"withdrawn": changed}
    finally:
        conn.close()


@privacy_bp.get("/settings")
def get_settings():
    conn = _db()
    try:
        return {"settings": store.settings(conn, g.org_id)}
    finally:
        conn.close()


@privacy_bp.put("/settings")
@require_role("admin")
def put_settings():
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        current = store.settings(conn, g.org_id)
        days = data.get("audienceRetentionDays", current["audienceRetentionDays"])
        transcripts = data.get("storeTranscripts", current["storeTranscripts"])
        if not isinstance(days, int) or isinstance(days, bool) or not store.MIN_RETENTION_DAYS <= days <= store.MAX_RETENTION_DAYS:
            return {"error": f"audienceRetentionDays must be {store.MIN_RETENTION_DAYS} to {store.MAX_RETENTION_DAYS}.", "code": "bad_retention"}, 400
        if not isinstance(transcripts, bool):
            return {"error": "storeTranscripts must be true or false.", "code": "bad_value"}, 400
        store.save_settings(conn, g.org_id, g.user_id, days, transcripts)
        audit(conn, "privacy.settings", f"retention={days} transcripts={transcripts}")
        conn.commit()
        return {"settings": store.settings(conn, g.org_id)}
    finally:
        conn.close()


@job_handler("privacy.retention", timeout_s=10 * 60)
def retention_job(ctx, payload):
    conn = get_connection(ctx.db_path)
    try:
        ctx.progress(0.1, "Deleting expired audience data")
        return store.apply_retention(conn)
    finally:
        conn.close()


register_periodic("privacy.retention", 24 * 60 * 60)
