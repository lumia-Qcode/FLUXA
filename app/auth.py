"""Sign-in, organisations, roles and tenant isolation (ROADMAP F1/F2).

- Users sign in with email + password (werkzeug hashes). The session is a signed,
  HttpOnly, SameSite=Lax cookie holding only the user id and active org id.
- Every user belongs to an organisation with one role: admin, brand_manager or employee.
  Roles are enforced on the server (`require_role`), never only in the UI.
- `guard_request` runs before every /api request. Endpoints not on the public list need a
  signed-in user, and any deck, slide, asset, live session or poll named in the URL must
  belong to the user's organisation; anything else answers 404, so other tenants' ids
  can't even be probed.
- The first account created claims the "Default organisation", which owns every deck
  that existed before accounts did. Later sign-ups get their own organisation, unless
  they use an invite link from an admin.
"""

import functools
import secrets
import sqlite3
import time
from typing import Any, Dict, Optional
from urllib.parse import urlsplit

from flask import Blueprint, current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from app.database import get_connection

ROLES = ("admin", "brand_manager", "employee")
MIN_PASSWORD_LENGTH = 8
INVITE_TTL_S = 7 * 24 * 3600

# Endpoints reachable without signing in (Flask endpoint names).
PUBLIC_ENDPOINTS = {
    "health_check",
    "auth.signup",
    "auth.login",
    "auth.logout",
    "auth.me",
    "auth.invite_info",
    "share.get_shared_presentation",
    # Audience side of live sessions: attendees join by code without an account.
    "live.get_host_info",
    "live.get_session",
    "live.get_session_by_code",
    "live.join_session",
    # Audience privacy: read the notice, erase your own contributions (F15).
    "privacy.notice",
    "privacy.erase_participant",
    # Audience questions on shared decks (#7 Ask Anything); rate-limited in the route.
    "deck_features.ask_anything",
    # Live captions for the audience (#10); posting needs the presenter's host token.
    "deck_features.get_captions",
    "live.ping_session",
    "live.list_participants",
    "live.cast_vote",
    "live.get_comments",
    "live.post_comment",
}


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def init_auth_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS orgs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS memberships (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('admin', 'brand_manager', 'employee')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, org_id)
        );
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (org_id, name)
        );
        CREATE TABLE IF NOT EXISTS team_members (
            team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (team_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS invites (
            token TEXT PRIMARY KEY,
            org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('admin', 'brand_manager', 'employee')),
            email TEXT,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            expires_at REAL NOT NULL,
            used_by INTEGER REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id INTEGER,
            user_id INTEGER,
            action TEXT NOT NULL,
            target TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id);
        """
    )
    cols = {r["name"] for r in connection.execute("PRAGMA table_info(presentations)").fetchall()}
    if "org_id" not in cols:
        connection.execute("ALTER TABLE presentations ADD COLUMN org_id INTEGER REFERENCES orgs(id)")
    if "owner_id" not in cols:
        connection.execute("ALTER TABLE presentations ADD COLUMN owner_id INTEGER REFERENCES users(id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_presentations_org ON presentations(org_id)")


def audit(connection: sqlite3.Connection, action: str, target: str = "", org_id=None, user_id=None) -> None:
    connection.execute(
        "INSERT INTO audit_log (org_id, user_id, action, target) VALUES (?, ?, ?, ?)",
        (org_id if org_id is not None else g.get("org_id"), user_id if user_id is not None else g.get("user_id"), action, target),
    )


# ---------------------------------------------------------------------------
# Current user helpers (used by routes)
# ---------------------------------------------------------------------------

def current_owner() -> Dict[str, Optional[int]]:
    """org_id/owner_id for rows created in this request. Capture it before streaming."""
    return {"org_id": g.get("org_id"), "owner_id": g.get("user_id")}


def require_role(*roles: str):
    """Allow the view only for signed-in members holding one of `roles`."""

    def decorator(view):
        @functools.wraps(view)
        def wrapped(*args, **kwargs):
            if not g.get("user_id"):
                return {"error": "Sign in required.", "code": "auth_required"}, 401
            if g.get("role") not in roles:
                return {"error": "You don't have permission to do that.", "code": "forbidden"}, 403
            return view(*args, **kwargs)

        return wrapped

    return decorator


def can_delete_deck(owner_id: Optional[int]) -> bool:
    return g.get("role") == "admin" or (owner_id is not None and owner_id == g.get("user_id"))


# ---------------------------------------------------------------------------
# Request guard
# ---------------------------------------------------------------------------

def _db() -> sqlite3.Connection:
    return get_connection(current_app.config["DATABASE_PATH"])


def _load_session_user(connection) -> None:
    g.user_id = g.org_id = g.role = None
    uid, org = session.get("uid"), session.get("org")
    if not uid or not org:
        return
    row = connection.execute(
        "SELECT m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = ? AND m.org_id = ?",
        (uid, org),
    ).fetchone()
    if row is None:  # account or membership removed since sign-in
        session.clear()
        return
    g.user_id, g.org_id, g.role = uid, org, row["role"]


def _resource_presentation_id(connection, view_args: Dict[str, Any]) -> Optional[int]:
    """The deck that a URL's resource belongs to, or None when the URL names no resource."""
    if "presentation_id" in view_args:
        return view_args["presentation_id"]
    if "asset_id" in view_args:
        row = connection.execute("SELECT presentation_id FROM assets WHERE id = ?", (view_args["asset_id"],)).fetchone()
        return row["presentation_id"] if row else -1
    if "session_id" in view_args:
        row = connection.execute("SELECT presentation_id FROM live_sessions WHERE id = ?", (view_args["session_id"],)).fetchone()
        return row["presentation_id"] if row else -1
    if "poll_id" in view_args:
        row = connection.execute(
            "SELECT s.presentation_id FROM live_polls p JOIN live_sessions s ON s.id = p.session_id WHERE p.id = ?",
            (view_args["poll_id"],),
        ).fetchone()
        return row["presentation_id"] if row else -1
    return None


def _same_origin() -> bool:
    origin = request.headers.get("Origin")
    if not origin:
        return True  # same-origin fetches from older browsers, curl, tests
    if origin.rstrip("/") in current_app.config.get("TRUSTED_ORIGINS", []):
        return True
    parts = urlsplit(origin)
    # Local development: the Vite dev server may pick another port (5174, 5175, …) when 5173
    # is taken. A page on localhost talking to a server on localhost is not cross-site;
    # other websites can't send a loopback Origin.
    loopback = {"localhost", "127.0.0.1", "::1"}
    if parts.scheme == "http" and parts.hostname in loopback and (request.remote_addr or "") in {"127.0.0.1", "::1", "localhost"}:
        return True
    return parts.netloc == request.host


def _asset_is_public(connection, asset_id: str) -> bool:
    """Images of shared decks and of decks in a live session stay viewable without an account."""
    row = connection.execute(
        """
        SELECT p.is_shared,
               EXISTS (SELECT 1 FROM live_sessions s WHERE s.presentation_id = p.id) AS has_live
        FROM assets a JOIN presentations p ON p.id = a.presentation_id
        WHERE a.id = ?
        """,
        (asset_id,),
    ).fetchone()
    return bool(row and (row["is_shared"] or row["has_live"]))


def guard_request():
    if not request.path.startswith("/api/"):
        return None
    if request.method not in ("GET", "HEAD", "OPTIONS") and not _same_origin():
        return jsonify({"error": "Cross-site request refused.", "code": "bad_origin"}), 403

    connection = _db()
    try:
        _load_session_user(connection)
        endpoint = request.endpoint or ""
        if endpoint in PUBLIC_ENDPOINTS:
            return None
        view_args = request.view_args or {}
        if endpoint == "assets.get_asset" and not g.user_id and _asset_is_public(connection, view_args.get("asset_id", "")):
            return None
        if not g.user_id:
            return jsonify({"error": "Sign in required.", "code": "auth_required"}), 401

        pres_id = _resource_presentation_id(connection, view_args)
        if pres_id is None:
            return None
        row = connection.execute("SELECT org_id FROM presentations WHERE id = ?", (pres_id,)).fetchone()
        if row is None:
            return None  # let the route answer its own "not found"
        if row["org_id"] != g.org_id:
            return jsonify({"error": "Not found."}), 404
        return None
    finally:
        connection.close()


# ---------------------------------------------------------------------------
# Login throttling (per email + client address, in memory)
# ---------------------------------------------------------------------------

_FAILED: Dict[str, list] = {}
MAX_FAILURES = 5
LOCK_WINDOW_S = 15 * 60


def _throttle_key(email: str) -> str:
    return f"{email}|{request.remote_addr}"


def _locked(email: str) -> bool:
    now = time.time()
    attempts = [t for t in _FAILED.get(_throttle_key(email), []) if now - t < LOCK_WINDOW_S]
    _FAILED[_throttle_key(email)] = attempts
    return len(attempts) >= MAX_FAILURES


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

auth_bp = Blueprint("auth", __name__)
org_bp = Blueprint("org", __name__)


def _me_payload(connection) -> Dict[str, Any]:
    user = connection.execute("SELECT id, email, name FROM users WHERE id = ?", (g.user_id,)).fetchone()
    org = connection.execute("SELECT id, name FROM orgs WHERE id = ?", (g.org_id,)).fetchone()
    return {
        "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
        "org": {"id": org["id"], "name": org["name"]},
        "role": g.role,
    }


def _start_session(user_id: int, org_id: int) -> None:
    session.clear()  # new session id on sign-in (no fixation)
    session.permanent = True
    session["uid"] = user_id
    session["org"] = org_id


def _valid_invite(connection, token: str):
    if not token:
        return None
    row = connection.execute(
        "SELECT i.*, o.name AS org_name FROM invites i JOIN orgs o ON o.id = i.org_id WHERE i.token = ?",
        (token,),
    ).fetchone()
    if row is None or row["used_by"] is not None or row["expires_at"] < time.time():
        return None
    return row


@auth_bp.post("/signup")
def signup():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    name = str(data.get("name") or "").strip()[:120]
    org_name = str(data.get("org_name") or "").strip()[:120]
    invite_token = str(data.get("invite") or "").strip()

    if "@" not in email or len(email) > 254:
        return {"error": "Enter a valid email address."}, 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return {"error": f"Use a password of at least {MIN_PASSWORD_LENGTH} characters."}, 400

    connection = _db()
    try:
        if connection.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            return {"error": "An account with that email already exists. Sign in instead."}, 409

        invite = _valid_invite(connection, invite_token) if invite_token else None
        if invite_token and invite is None:
            return {"error": "This invite link is invalid or has expired."}, 400
        if invite is not None and invite["email"] and invite["email"] != email:
            return {"error": "This invite was sent to a different email address."}, 400

        is_first_user = connection.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0
        cur = connection.execute(
            "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
            (email, name, generate_password_hash(password)),
        )
        user_id = cur.lastrowid

        if invite is not None:
            org_id, role = invite["org_id"], invite["role"]
            connection.execute("UPDATE invites SET used_by = ? WHERE token = ?", (user_id, invite_token))
        elif is_first_user:
            # The first account owns every deck made before accounts existed.
            org = connection.execute("SELECT id FROM orgs WHERE is_default = 1").fetchone()
            if org is None:
                org_id = connection.execute(
                    "INSERT INTO orgs (name, is_default) VALUES (?, 1)", (org_name or "Default organisation",)
                ).lastrowid
            else:
                org_id = org["id"]
            connection.execute("UPDATE presentations SET org_id = ?, owner_id = ? WHERE org_id IS NULL", (org_id, user_id))
            role = "admin"
        else:
            org_id = connection.execute(
                "INSERT INTO orgs (name) VALUES (?)", (org_name or f"{name or email.split('@')[0]}'s organisation",)
            ).lastrowid
            role = "admin"

        connection.execute("INSERT INTO memberships (user_id, org_id, role) VALUES (?, ?, ?)", (user_id, org_id, role))
        audit(connection, "user.signup", email, org_id=org_id, user_id=user_id)
        connection.commit()

        _start_session(user_id, org_id)
        g.user_id, g.org_id, g.role = user_id, org_id, role
        return _me_payload(connection), 201
    finally:
        connection.close()


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    if _locked(email):
        return {"error": "Too many attempts. Try again in 15 minutes."}, 429

    connection = _db()
    try:
        user = connection.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            _FAILED.setdefault(_throttle_key(email), []).append(time.time())
            return {"error": "Email or password is incorrect."}, 401
        _FAILED.pop(_throttle_key(email), None)

        membership = connection.execute(
            "SELECT org_id, role FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1", (user["id"],)
        ).fetchone()
        if membership is None:
            return {"error": "This account isn't a member of any organisation."}, 403

        _start_session(user["id"], membership["org_id"])
        g.user_id, g.org_id, g.role = user["id"], membership["org_id"], membership["role"]
        audit(connection, "user.login", email)
        connection.commit()
        return _me_payload(connection), 200
    finally:
        connection.close()


@auth_bp.post("/logout")
def logout():
    session.clear()
    return {"message": "Signed out."}, 200


@auth_bp.get("/me")
def me():
    if not g.get("user_id"):
        return {"error": "Not signed in.", "code": "auth_required"}, 401
    connection = _db()
    try:
        return _me_payload(connection), 200
    finally:
        connection.close()


@auth_bp.get("/invites/<token>")
def invite_info(token):
    connection = _db()
    try:
        invite = _valid_invite(connection, token)
        if invite is None:
            return {"error": "This invite link is invalid or has expired."}, 404
        return {"org": invite["org_name"], "role": invite["role"], "email": invite["email"]}, 200
    finally:
        connection.close()


# -- organisation management -----------------------------------------------------

@org_bp.get("/members")
@require_role(*ROLES)
def list_members():
    connection = _db()
    try:
        rows = connection.execute(
            """
            SELECT u.id, u.email, u.name, m.role, m.created_at
            FROM memberships m JOIN users u ON u.id = m.user_id
            WHERE m.org_id = ? ORDER BY m.created_at
            """,
            (g.org_id,),
        ).fetchall()
        return {"members": [dict(r) for r in rows]}, 200
    finally:
        connection.close()


@org_bp.post("/invites")
@require_role("admin")
def create_invite():
    data = request.get_json(silent=True) or {}
    role = str(data.get("role") or "employee")
    email = str(data.get("email") or "").strip().lower() or None
    if role not in ROLES:
        return {"error": f"Role must be one of: {', '.join(ROLES)}."}, 400
    token = secrets.token_urlsafe(24)
    connection = _db()
    try:
        connection.execute(
            "INSERT INTO invites (token, org_id, role, email, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
            (token, g.org_id, role, email, g.user_id, time.time() + INVITE_TTL_S),
        )
        audit(connection, "invite.create", f"{role}:{email or '-'}")
        connection.commit()
    finally:
        connection.close()
    return {"token": token, "role": role, "email": email, "expires_in_days": INVITE_TTL_S // 86400}, 201


def _admin_count(connection) -> int:
    return connection.execute(
        "SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND role = 'admin'", (g.org_id,)
    ).fetchone()["n"]


@org_bp.patch("/members/<int:user_id>")
@require_role("admin")
def change_role(user_id):
    role = str((request.get_json(silent=True) or {}).get("role") or "")
    if role not in ROLES:
        return {"error": f"Role must be one of: {', '.join(ROLES)}."}, 400
    connection = _db()
    try:
        row = connection.execute(
            "SELECT role FROM memberships WHERE user_id = ? AND org_id = ?", (user_id, g.org_id)
        ).fetchone()
        if row is None:
            return {"error": "Not found."}, 404
        if row["role"] == "admin" and role != "admin" and _admin_count(connection) <= 1:
            return {"error": "An organisation needs at least one admin."}, 400
        connection.execute("UPDATE memberships SET role = ? WHERE user_id = ? AND org_id = ?", (role, user_id, g.org_id))
        audit(connection, "member.role", f"{user_id}:{role}")
        connection.commit()
        return {"user_id": user_id, "role": role}, 200
    finally:
        connection.close()


@org_bp.delete("/members/<int:user_id>")
@require_role("admin")
def remove_member(user_id):
    connection = _db()
    try:
        row = connection.execute(
            "SELECT role FROM memberships WHERE user_id = ? AND org_id = ?", (user_id, g.org_id)
        ).fetchone()
        if row is None:
            return {"error": "Not found."}, 404
        if row["role"] == "admin" and _admin_count(connection) <= 1:
            return {"error": "An organisation needs at least one admin."}, 400
        connection.execute("DELETE FROM memberships WHERE user_id = ? AND org_id = ?", (user_id, g.org_id))
        connection.execute(
            "DELETE FROM team_members WHERE user_id = ? AND team_id IN (SELECT id FROM teams WHERE org_id = ?)",
            (user_id, g.org_id),
        )
        audit(connection, "member.remove", str(user_id))
        connection.commit()
        return {"removed": user_id}, 200
    finally:
        connection.close()


@org_bp.get("/teams")
@require_role(*ROLES)
def list_teams():
    connection = _db()
    try:
        teams = connection.execute("SELECT id, name FROM teams WHERE org_id = ? ORDER BY name", (g.org_id,)).fetchall()
        out = []
        for t in teams:
            members = connection.execute("SELECT user_id FROM team_members WHERE team_id = ?", (t["id"],)).fetchall()
            out.append({"id": t["id"], "name": t["name"], "member_ids": [m["user_id"] for m in members]})
        return {"teams": out}, 200
    finally:
        connection.close()


@org_bp.post("/teams")
@require_role("admin")
def create_team():
    name = str((request.get_json(silent=True) or {}).get("name") or "").strip()[:80]
    if not name:
        return {"error": "Team name is required."}, 400
    connection = _db()
    try:
        try:
            team_id = connection.execute("INSERT INTO teams (org_id, name) VALUES (?, ?)", (g.org_id, name)).lastrowid
        except sqlite3.IntegrityError:
            return {"error": "A team with that name already exists."}, 409
        audit(connection, "team.create", name)
        connection.commit()
        return {"id": team_id, "name": name, "member_ids": []}, 201
    finally:
        connection.close()


@org_bp.put("/teams/<int:team_id>/members")
@require_role("admin")
def set_team_members(team_id):
    ids = (request.get_json(silent=True) or {}).get("member_ids") or []
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        return {"error": "member_ids must be a list of user ids."}, 400
    connection = _db()
    try:
        if connection.execute("SELECT 1 FROM teams WHERE id = ? AND org_id = ?", (team_id, g.org_id)).fetchone() is None:
            return {"error": "Not found."}, 404
        members = {
            r["user_id"]
            for r in connection.execute("SELECT user_id FROM memberships WHERE org_id = ?", (g.org_id,)).fetchall()
        }
        if not set(ids) <= members:
            return {"error": "Every team member must belong to this organisation."}, 400
        connection.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
        connection.executemany("INSERT INTO team_members (team_id, user_id) VALUES (?, ?)", [(team_id, i) for i in set(ids)])
        audit(connection, "team.members", str(team_id))
        connection.commit()
        return {"id": team_id, "member_ids": sorted(set(ids))}, 200
    finally:
        connection.close()


@org_bp.get("/ai-usage")
@require_role("admin")
def ai_usage():
    """AI calls, tokens and average latency per feature for this organisation."""
    from app.ai.gateway import usage_summary

    try:
        days = max(1, min(int(request.args.get("days", 7)), 90))
    except ValueError:
        days = 7
    connection = _db()
    try:
        return {"days": days, "features": usage_summary(connection, g.org_id, days)}, 200
    finally:
        connection.close()
