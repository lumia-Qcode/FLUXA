"""Consent and privacy (F15): audience notice on join, self-erase, speaker consents, retention."""

import sqlite3

import pytest
from flask import Blueprint, g

from app import auth, create_app
from app.database import init_db
from app.jobs.queue import PERIODIC, SYSTEM_ORG_ID, enqueue_due_periodic
from app.jobs.worker import run_one
from app.privacy import store
from app.privacy.routes import consent_required

JOIN = {"name": "Sam", "accept_notice": True, "notice_version": store.AUDIENCE_NOTICE_VERSION}


@pytest.fixture
def app_db(tmp_path, anon_client_class):
    app = create_app()
    path = str(tmp_path / "privacy.db")
    app.config.update(TESTING=True, DATABASE_PATH=path)
    init_db(path)
    auth._FAILED.clear()
    return app, path


def signed_in(app, email="host@example.com"):
    c = app.test_client()
    assert c.post("/api/auth/signup", json={"email": email, "password": "long-enough-pw"}).status_code == 201
    return c


def live_session(host):
    pid = host.post("/api/presentations", json={"title": "Talk"}).get_json()["presentation"]["id"]
    r = host.post("/api/live/sessions", json={"presentation_id": pid})
    assert r.status_code in (200, 201), r.get_json()
    return r.get_json().get("session_id") or r.get_json()["id"]


def rows(db, sql, *args):
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()


# --- audience -------------------------------------------------------------------------

def test_joining_requires_the_notice_and_records_it(app_db):
    app, db = app_db
    host = signed_in(app)
    sid = live_session(host)
    visitor = app.test_client()

    notice = visitor.get(f"/api/privacy/notice?session_id={sid}").get_json()
    assert notice["version"] == 1 and notice["retentionDays"] == 30 and "30 days" in notice["text"]

    r = visitor.post(f"/api/live/sessions/{sid}/join", json={"name": "Sam"})
    assert r.status_code == 400 and r.get_json()["code"] == "notice_required"
    r = visitor.post(f"/api/live/sessions/{sid}/join", json={**JOIN, "notice_version": 0})
    assert r.status_code == 400

    pid = visitor.post(f"/api/live/sessions/{sid}/join", json=JOIN).get_json()["participant_id"]
    consent = rows(db, "SELECT * FROM consents WHERE subject_id = ?", pid)[0]
    assert consent["subject_type"] == "participant" and consent["purpose"] == "audience_participation"
    assert consent["session_id"] == sid and consent["notice_version"] == 1 and consent["revoked_at"] is None
    assert "Sam" not in str(consent)  # consent rows hold ids, not names


def test_the_notice_shows_the_orgs_retention_period(app_db):
    app, _ = app_db
    host = signed_in(app)
    sid = live_session(host)
    assert host.put("/api/privacy/settings", json={"audienceRetentionDays": 7}).status_code == 200
    assert "7 days" in app.test_client().get(f"/api/privacy/notice?session_id={sid}").get_json()["text"]


def test_attendees_can_erase_their_own_contributions(app_db):
    app, db = app_db
    host = signed_in(app)
    sid = live_session(host)
    visitor = app.test_client()
    pid = visitor.post(f"/api/live/sessions/{sid}/join", json=JOIN).get_json()["participant_id"]
    other = visitor.post(f"/api/live/sessions/{sid}/join", json={**JOIN, "name": "Kim"}).get_json()["participant_id"]
    visitor.post(f"/api/live/sessions/{sid}/comments", json={"participant_id": pid, "participant_name": "Sam", "text": "Hi"})
    visitor.post(f"/api/live/sessions/{sid}/comments", json={"participant_id": other, "participant_name": "Kim", "text": "Yo"})

    # the session id must match: a participant id alone isn't enough
    assert visitor.post("/api/privacy/participant/erase", json={"participant_id": pid, "session_id": "nope"}).status_code == 404
    r = visitor.post("/api/privacy/participant/erase", json={"participant_id": pid, "session_id": sid})
    assert r.status_code == 200 and r.get_json()["deleted"]["comments"] == 1
    assert rows(db, "SELECT * FROM live_participants WHERE id = ?", pid) == []
    assert [c["text"] for c in rows(db, "SELECT text FROM live_comments")] == ["Yo"]
    assert rows(db, "SELECT revoked_at FROM consents WHERE subject_id = ?", pid)[0]["revoked_at"] is not None


# --- speaker consents -----------------------------------------------------------------

def test_speaker_consent_grant_scope_and_withdraw(app_db):
    app, db = app_db
    c = signed_in(app)
    assert c.post("/api/privacy/consents", json={"purpose": "voice_clone", "scope": {"languages": ["ur"]}}).get_json()["code"] == "confirm_required"
    assert c.post("/api/privacy/consents", json={"purpose": "voice_clone", "confirm": True}).get_json()["code"] == "bad_scope"
    assert c.post("/api/privacy/consents", json={"purpose": "audience_participation", "confirm": True}).status_code == 400
    assert c.post("/api/privacy/consents", json={"purpose": "voice_clone", "confirm": True, "scope": {"languages": ["../x"]}}).status_code == 400

    r = c.post("/api/privacy/consents", json={"purpose": "voice_clone", "confirm": True, "scope": {"languages": ["ur", "ar"]}})
    assert r.status_code == 201 and r.get_json()["consent"]["scope"] == {"languages": ["ar", "ur"]}
    # granting again replaces the active one (history kept)
    c.post("/api/privacy/consents", json={"purpose": "voice_clone", "confirm": True, "scope": {"languages": ["ur"]}})
    listed = c.get("/api/privacy/consents").get_json()["consents"]
    assert [x["active"] for x in listed] == [True, False]

    assert c.delete("/api/privacy/consents/voice_clone").get_json() == {"withdrawn": True}
    assert c.delete("/api/privacy/consents/voice_clone").get_json() == {"withdrawn": False}
    actions = [r["action"] for r in rows(db, "SELECT action FROM audit_log WHERE action LIKE 'consent.%'")]
    assert actions == ["consent.grant", "consent.grant", "consent.revoke"]


def test_withdrawing_runs_cleanup_hooks(app_db):
    app, _ = app_db
    deleted = []

    @store.on_revoke("transcript_storage")
    def _cleanup(conn, org_id, subject_type, subject_id):
        deleted.append((subject_type, subject_id))

    try:
        c = signed_in(app)
        c.post("/api/privacy/consents", json={"purpose": "transcript_storage", "confirm": True})
        c.delete("/api/privacy/consents/transcript_storage")
        assert deleted and deleted[0][0] == "user"
    finally:
        store._REVOKE_HOOKS["transcript_storage"].remove(_cleanup)


def test_consent_gate_blocks_until_consent_covers_the_scope(app_db):
    app, db = app_db
    bp = Blueprint("gate_test", __name__)

    @bp.post("/api/test-voice/<lang>")
    @consent_required("voice_translation", needs=lambda req: {"languages": [req.view_args["lang"]]})
    def voice(lang):
        return {"ok": True, "user": g.user_id}

    app.register_blueprint(bp)
    c = signed_in(app)
    r = c.post("/api/test-voice/ur")
    assert r.status_code == 403 and r.get_json()["code"] == "consent_required" and r.get_json()["purpose"] == "voice_translation"
    c.post("/api/privacy/consents", json={"purpose": "voice_translation", "confirm": True, "scope": {"languages": ["ur"]}})
    assert c.post("/api/test-voice/ur").status_code == 200
    assert c.post("/api/test-voice/ar").status_code == 403  # not covered
    c.delete("/api/privacy/consents/voice_translation")
    assert c.post("/api/test-voice/ur").status_code == 403


def test_consents_are_per_org_and_per_person(app_db):
    app, db = app_db
    a = signed_in(app, "a@example.com")
    a.post("/api/privacy/consents", json={"purpose": "mic_capture", "confirm": True})
    b = signed_in(app, "b@example.com")
    assert b.get("/api/privacy/consents").get_json()["consents"] == []
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    b_ids = rows(db, "SELECT id FROM users WHERE email = 'b@example.com'")[0]["id"]
    assert not store.has_consent(conn, 1, "user", b_ids, "mic_capture")
    conn.close()


def test_settings_are_admin_only_and_validated(app_db):
    app, _ = app_db
    admin = signed_in(app)
    token = admin.post("/api/org/invites", json={"role": "employee"}).get_json()["token"]
    emp = app.test_client()
    emp.post("/api/auth/signup", json={"email": "e@example.com", "password": "long-enough-pw", "invite": token})
    assert emp.put("/api/privacy/settings", json={"audienceRetentionDays": 5}).status_code == 403
    assert emp.get("/api/privacy/settings").get_json()["settings"]["audienceRetentionDays"] == 30
    for bad in ({"audienceRetentionDays": 0}, {"audienceRetentionDays": 999}, {"audienceRetentionDays": "7"}, {"storeTranscripts": "yes"}):
        assert admin.put("/api/privacy/settings", json=bad).status_code == 400
    assert admin.put("/api/privacy/settings", json={"audienceRetentionDays": 14, "storeTranscripts": True}).get_json()["settings"] == {
        "audienceRetentionDays": 14,
        "storeTranscripts": True,
    }


# --- retention ------------------------------------------------------------------------

def test_retention_job_deletes_expired_audience_data_per_org(app_db):
    app, db = app_db
    host = signed_in(app)
    sid = live_session(host)
    visitor = app.test_client()
    old = visitor.post(f"/api/live/sessions/{sid}/join", json=JOIN).get_json()["participant_id"]
    new = visitor.post(f"/api/live/sessions/{sid}/join", json={**JOIN, "name": "New"}).get_json()["participant_id"]
    visitor.post(f"/api/live/sessions/{sid}/comments", json={"participant_id": old, "participant_name": "Sam", "text": "old"})
    visitor.post(f"/api/live/sessions/{sid}/comments", json={"participant_id": new, "participant_name": "New", "text": "new"})
    conn = sqlite3.connect(db)
    conn.execute("UPDATE live_participants SET created_at = datetime('now', '-40 days') WHERE id = ?", (old,))
    conn.execute("UPDATE live_comments SET created_at = datetime('now', '-40 days') WHERE text = 'old'")
    conn.commit()
    conn.close()

    assert "privacy.retention" in PERIODIC
    ids = enqueue_due_periodic(db)
    assert enqueue_due_periodic(db) == ids  # once per day
    assert run_one(db) == ids[0]
    job = rows(db, "SELECT org_id, status, result_json FROM jobs WHERE id = ?", ids[0])[0]
    assert job["org_id"] == SYSTEM_ORG_ID and job["status"] == "succeeded"
    assert [c["text"] for c in rows(db, "SELECT text FROM live_comments")] == ["new"]
    assert [p["id"] for p in rows(db, "SELECT id FROM live_participants WHERE role = 'viewer'")] == [new]
    # system jobs are invisible through the jobs API
    assert host.get(f"/api/jobs/{ids[0]}").status_code == 404
