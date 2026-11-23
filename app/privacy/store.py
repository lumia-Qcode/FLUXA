"""Consent records, privacy settings, audience notice and data retention (F15).

Consents are append-only: granting adds a row, revoking stamps `revoked_at` on it. That
keeps a record of who agreed to what, when, and in which scope. Consent rows hold ids,
never names or contact details.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Callable, Dict, List, Optional

# Purposes -------------------------------------------------------------------------------
AUDIENCE_PARTICIPATION = "audience_participation"  # live audience: name, votes, comments, questions
VOICE_TRANSLATION = "voice_translation"            # #10: speaker audio sent to speech-to-text / translation
VOICE_CLONE = "voice_clone"                        # #10: voice-preserving translation (voice model)
TRANSCRIPT_STORAGE = "transcript_storage"          # #15: keep talk transcripts after the session
MIC_CAPTURE = "mic_capture"                        # #15: continuous microphone capture (Autopilot)

PARTICIPANT_PURPOSES = {AUDIENCE_PARTICIPATION}
USER_PURPOSES = {VOICE_TRANSLATION, VOICE_CLONE, TRANSCRIPT_STORAGE, MIC_CAPTURE}
PURPOSE_LABELS = {
    AUDIENCE_PARTICIPATION: "Take part in a live session (name, votes, comments, questions)",
    VOICE_TRANSLATION: "Process my voice with speech-to-text and translation during talks",
    VOICE_CLONE: "Create a model of my voice for voice-preserving translation",
    TRANSCRIPT_STORAGE: "Keep transcripts of my talks after the session ends",
    MIC_CAPTURE: "Listen to my microphone continuously while Autopilot is on",
}

DEFAULT_AUDIENCE_RETENTION_DAYS = 30
MIN_RETENTION_DAYS, MAX_RETENTION_DAYS = 1, 365

# Audience notice ------------------------------------------------------------------------
AUDIENCE_NOTICE_VERSION = 1
AUDIENCE_NOTICE = (
    "By joining, the name you enter, your poll votes, comments and questions are shared with "
    "the presenter and other attendees of this session. They are kept for {days} days and then "
    "deleted. You can delete them yourself at any time from the Privacy button. No account, "
    "email or location is collected."
)


def init_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id INTEGER NOT NULL,
            subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'participant')),
            subject_id TEXT NOT NULL,
            purpose TEXT NOT NULL,
            scope_json TEXT NOT NULL DEFAULT '{}',
            session_id TEXT,
            notice_version INTEGER,
            granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            revoked_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_consents_subject ON consents(org_id, subject_type, subject_id, purpose);
        CREATE TABLE IF NOT EXISTS org_privacy (
            org_id INTEGER PRIMARY KEY,
            audience_retention_days INTEGER NOT NULL DEFAULT 30,
            store_transcripts INTEGER NOT NULL DEFAULT 0,
            updated_by INTEGER,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


# Settings -------------------------------------------------------------------------------

def settings(conn, org_id: int) -> Dict[str, Any]:
    row = conn.execute("SELECT * FROM org_privacy WHERE org_id = ?", (org_id,)).fetchone()
    return {
        "audienceRetentionDays": row["audience_retention_days"] if row else DEFAULT_AUDIENCE_RETENTION_DAYS,
        "storeTranscripts": bool(row["store_transcripts"]) if row else False,
    }


def save_settings(conn, org_id: int, user_id: int, retention_days: int, store_transcripts: bool) -> None:
    conn.execute(
        """
        INSERT INTO org_privacy (org_id, audience_retention_days, store_transcripts, updated_by, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(org_id) DO UPDATE SET audience_retention_days = excluded.audience_retention_days,
            store_transcripts = excluded.store_transcripts, updated_by = excluded.updated_by,
            updated_at = CURRENT_TIMESTAMP
        """,
        (org_id, retention_days, 1 if store_transcripts else 0, user_id),
    )


def audience_notice(conn, org_id: Optional[int]) -> Dict[str, Any]:
    days = settings(conn, org_id)["audienceRetentionDays"] if org_id else DEFAULT_AUDIENCE_RETENTION_DAYS
    return {"version": AUDIENCE_NOTICE_VERSION, "retentionDays": days, "text": AUDIENCE_NOTICE.format(days=days)}


# Consents -------------------------------------------------------------------------------

def grant(conn, org_id: int, subject_type: str, subject_id, purpose: str, scope=None, session_id=None, notice_version=None) -> int:
    """Record a consent. An existing active consent for the same purpose is revoked first,
    so there is at most one active row per subject and purpose (scope changes are kept)."""
    revoke(conn, org_id, subject_type, subject_id, purpose, run_hooks=False)
    cur = conn.execute(
        """
        INSERT INTO consents (org_id, subject_type, subject_id, purpose, scope_json, session_id, notice_version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (org_id, subject_type, str(subject_id), purpose, json.dumps(scope or {}), session_id, notice_version),
    )
    return cur.lastrowid


def active(conn, org_id: int, subject_type: str, subject_id, purpose: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        """
        SELECT * FROM consents
        WHERE org_id = ? AND subject_type = ? AND subject_id = ? AND purpose = ? AND revoked_at IS NULL
        ORDER BY id DESC LIMIT 1
        """,
        (org_id, subject_type, str(subject_id), purpose),
    ).fetchone()


def has_consent(conn, org_id: int, subject_type: str, subject_id, purpose: str, needs: Optional[Dict[str, Any]] = None) -> bool:
    """True if an active consent exists and covers `needs` (e.g. {"languages": ["ur"]})."""
    row = active(conn, org_id, subject_type, subject_id, purpose)
    if row is None:
        return False
    if not needs:
        return True
    scope = json.loads(row["scope_json"] or "{}")
    for key, wanted in needs.items():
        allowed = scope.get(key)
        if allowed is None:
            return False
        wanted_list = wanted if isinstance(wanted, list) else [wanted]
        allowed_list = allowed if isinstance(allowed, list) else [allowed]
        if not set(wanted_list) <= set(allowed_list):
            return False
    return True


_REVOKE_HOOKS: Dict[str, List[Callable]] = {}


def on_revoke(purpose: str):
    """Register cleanup to run when a consent is withdrawn, e.g. deleting a voice model:

        @on_revoke(VOICE_CLONE)
        def delete_voice_model(conn, org_id, subject_type, subject_id): ...
    """

    def decorator(fn):
        _REVOKE_HOOKS.setdefault(purpose, []).append(fn)
        return fn

    return decorator


def revoke(conn, org_id: int, subject_type: str, subject_id, purpose: str, run_hooks: bool = True) -> bool:
    cur = conn.execute(
        """
        UPDATE consents SET revoked_at = CURRENT_TIMESTAMP
        WHERE org_id = ? AND subject_type = ? AND subject_id = ? AND purpose = ? AND revoked_at IS NULL
        """,
        (org_id, subject_type, str(subject_id), purpose),
    )
    if cur.rowcount and run_hooks:
        for hook in _REVOKE_HOOKS.get(purpose, []):
            hook(conn, org_id, subject_type, str(subject_id))
    return bool(cur.rowcount)


def consent_dict(row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "purpose": row["purpose"],
        "label": PURPOSE_LABELS.get(row["purpose"], row["purpose"]),
        "scope": json.loads(row["scope_json"] or "{}"),
        "grantedAt": row["granted_at"],
        "revokedAt": row["revoked_at"],
        "active": row["revoked_at"] is None,
    }


# Audience data ------------------------------------------------------------------------

def session_org(conn, session_id: str) -> Optional[int]:
    row = conn.execute(
        "SELECT p.org_id FROM live_sessions s JOIN presentations p ON p.id = s.presentation_id WHERE s.id = ?",
        (session_id,),
    ).fetchone()
    return row["org_id"] if row else None


def erase_participant(conn, participant_id: str) -> Dict[str, int]:
    """Delete everything an audience member contributed, and withdraw their consent."""
    votes = conn.execute("DELETE FROM live_poll_votes WHERE participant_id = ?", (participant_id,)).rowcount
    comments = conn.execute("DELETE FROM live_comments WHERE participant_id = ?", (participant_id,)).rowcount
    people = conn.execute("DELETE FROM live_participants WHERE id = ?", (participant_id,)).rowcount
    conn.execute(
        "UPDATE consents SET revoked_at = CURRENT_TIMESTAMP "
        "WHERE subject_type = 'participant' AND subject_id = ? AND revoked_at IS NULL",
        (participant_id,),
    )
    return {"votes": votes, "comments": comments, "participants": people}


def apply_retention(conn) -> Dict[str, int]:
    """Delete audience data older than each org's retention period."""
    totals = {"votes": 0, "comments": 0, "participants": 0}
    orgs = conn.execute("SELECT id FROM orgs").fetchall()
    for org in orgs:
        days = settings(conn, org["id"])["audienceRetentionDays"]
        cutoff = f"-{int(days)} days"
        org_sessions = "SELECT s.id FROM live_sessions s JOIN presentations p ON p.id = s.presentation_id WHERE p.org_id = ?"
        totals["votes"] += conn.execute(
            f"""
            DELETE FROM live_poll_votes WHERE created_at < datetime('now', ?)
              AND poll_id IN (SELECT id FROM live_polls WHERE session_id IN ({org_sessions}))
            """,
            (cutoff, org["id"]),
        ).rowcount
        totals["comments"] += conn.execute(
            f"DELETE FROM live_comments WHERE created_at < datetime('now', ?) AND session_id IN ({org_sessions})",
            (cutoff, org["id"]),
        ).rowcount
        totals["participants"] += conn.execute(
            f"DELETE FROM live_participants WHERE created_at < datetime('now', ?) AND session_id IN ({org_sessions})",
            (cutoff, org["id"]),
        ).rowcount
    conn.commit()
    return totals
