"""Background jobs (F12): queue, worker, retries, cancel, recovery, API, SSE, isolation."""

import sqlite3
import threading
import time

import pytest

from app import auth, create_app
from app.ai import gateway
from app.database import init_db
from app.jobs import JobError, enqueue, job_handler
from app.jobs import queue as q
from app.jobs.worker import JobWorker, run_one

CALLS = {"flaky": 0}
GATE = threading.Event()


@job_handler("test.echo")
def _echo(ctx, payload):
    ctx.progress(0.5, "Halfway", "working on it")
    return {"echo": payload.get("value"), "org": ctx.org_id, "user": ctx.user_id}


@job_handler("test.flaky", max_attempts=2, retry_delay_s=0)
def _flaky(ctx, payload):
    CALLS["flaky"] += 1
    if CALLS["flaky"] == 1:
        raise RuntimeError("secret internal detail")
    return {"ok": True}


@job_handler("test.broken")
def _broken(ctx, payload):
    raise RuntimeError("secret internal detail")


@job_handler("test.user_error")
def _user_error(ctx, payload):
    raise JobError("That file isn't a PowerPoint deck.")


@job_handler("test.slow")
def _slow(ctx, payload):
    for i in range(200):
        ctx.progress(i / 200, "Looping")
        if GATE.wait(0.01):
            break
    return {"done": True}


@job_handler("test.timeout", timeout_s=0)
def _timeout(ctx, payload):
    time.sleep(0.01)
    ctx.progress(0.1)
    return {}


@job_handler("test.usage")
def _usage(ctx, payload):
    gateway.record("fake route", "ok", {"prompt_tokens": 3, "completion_tokens": 2}, 5)
    return {}


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "jobs.db")
    init_db(path)
    CALLS["flaky"] = 0
    GATE.clear()
    return path


def job(db, job_id):
    conn = q._connect(db)
    try:
        return q.job_dict(conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone())
    finally:
        conn.close()


# --- queue and worker ------------------------------------------------------------------

def test_a_job_runs_and_records_progress_and_result(db):
    jid = enqueue(db, "test.echo", {"value": 42}, org_id=3, user_id=9)
    assert job(db, jid)["status"] == "queued"
    assert run_one(db) == jid
    got = job(db, jid)
    assert got["status"] == "succeeded" and got["progress"] == 1
    assert got["stage"] == "Halfway" and got["message"] == "working on it"
    assert got["result"] == {"echo": 42, "org": 3, "user": 9}
    assert run_one(db) is None  # queue empty


def test_unknown_kinds_and_big_payloads_are_refused(db):
    with pytest.raises(ValueError):
        enqueue(db, "nope.missing", {}, org_id=1)
    with pytest.raises(ValueError):
        enqueue(db, "test.echo", {"x": "y" * (q.MAX_PAYLOAD_BYTES + 1)}, org_id=1)


def test_idempotency_key_returns_the_existing_job(db):
    a = enqueue(db, "test.echo", {}, org_id=1, idempotency_key="deck-5")
    assert enqueue(db, "test.echo", {}, org_id=1, idempotency_key="deck-5") == a
    assert enqueue(db, "test.echo", {}, org_id=2, idempotency_key="deck-5") != a


def test_unexpected_errors_retry_then_succeed_without_leaking_details(db):
    jid = enqueue(db, "test.flaky", {}, org_id=1)
    run_one(db)
    first = job(db, jid)
    assert first["status"] == "queued" and first["attempts"] == 1 and first["error"] is None
    run_one(db)
    assert job(db, jid)["status"] == "succeeded" and CALLS["flaky"] == 2


def test_failures_show_a_safe_message(db):
    broken = enqueue(db, "test.broken", {}, org_id=1)
    user_err = enqueue(db, "test.user_error", {}, org_id=1)
    run_one(db)
    run_one(db)
    assert job(db, broken)["status"] == "failed"
    assert "secret" not in job(db, broken)["error"]
    assert job(db, user_err)["error"] == "That file isn't a PowerPoint deck."


def test_cooperative_time_limit(db):
    jid = enqueue(db, "test.timeout", {}, org_id=1)
    run_one(db)
    assert job(db, jid)["status"] == "failed" and "time limit" in job(db, jid)["error"]


def test_cancel_queued_and_running_jobs(db):
    queued = enqueue(db, "test.echo", {}, org_id=1)
    conn = q._connect(db)
    assert q.request_cancel(conn, queued) == "cancelled"
    conn.close()
    assert run_one(db) is None  # cancelled jobs never run

    jid = enqueue(db, "test.slow", {}, org_id=1)
    t = threading.Thread(target=run_one, args=(db,))
    t.start()
    for _ in range(200):
        if job(db, jid)["status"] == "running":
            break
        time.sleep(0.01)
    conn = q._connect(db)
    q.request_cancel(conn, jid)
    conn.close()
    t.join(5)
    assert job(db, jid)["status"] == "cancelled"


def test_jobs_from_a_dead_worker_are_requeued_or_failed(db):
    a = enqueue(db, "test.flaky", {}, org_id=1)  # 2 attempts allowed
    b = enqueue(db, "test.echo", {}, org_id=1)  # 1 attempt
    conn = q._connect(db)
    q.claim_next(conn, ["test.flaky"])
    q.claim_next(conn, ["test.echo"])
    conn.execute("UPDATE jobs SET heartbeat_at = 0")
    conn.commit()
    assert q.recover_stale(conn) == 1
    conn.close()
    assert job(db, a)["status"] == "queued"
    assert job(db, b)["status"] == "failed" and "worker stopped" in job(db, b)["error"]


def test_two_claimers_never_take_the_same_job(db):
    ids = {enqueue(db, "test.echo", {"value": i}, org_id=1) for i in range(20)}
    claimed, lock = [], threading.Lock()

    def claimer():
        conn = q._connect(db)
        while True:
            row = q.claim_next(conn, ["test.echo"])
            if row is None:
                break
            with lock:
                claimed.append(row["id"])
        conn.close()

    threads = [threading.Thread(target=claimer) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(10)
    assert sorted(claimed) == sorted(ids)


def test_worker_threads_drain_the_queue(db):
    ids = [enqueue(db, "test.echo", {"value": i}, org_id=1) for i in range(6)]
    worker = JobWorker(db, concurrency=3, poll_s=0.05).start()
    try:
        deadline = time.time() + 10
        while time.time() < deadline and any(job(db, i)["status"] != "succeeded" for i in ids):
            time.sleep(0.05)
    finally:
        worker.stop()
    assert all(job(db, i)["status"] == "succeeded" for i in ids)


def test_ai_usage_inside_a_job_is_logged_to_its_org_and_user(db):
    enqueue(db, "test.usage", {}, org_id=4, user_id=8)
    run_one(db)
    conn = sqlite3.connect(db)
    row = conn.execute("SELECT org_id, user_id, feature FROM ai_usage").fetchone()
    conn.close()
    assert row == (4, 8, "job.test.usage")


def test_old_finished_jobs_are_purged(db):
    jid = enqueue(db, "test.echo", {}, org_id=1)
    run_one(db)
    conn = q._connect(db)
    conn.execute("UPDATE jobs SET finished_at = 0 WHERE id = ?", (jid,))
    conn.commit()
    assert q.purge_old(conn) == 1
    conn.close()


# --- API -------------------------------------------------------------------------------

@pytest.fixture
def app_db(tmp_path, anon_client_class):
    app = create_app()
    path = str(tmp_path / "jobs_api.db")
    app.config.update(TESTING=True, DATABASE_PATH=path)
    init_db(path)
    auth._FAILED.clear()
    CALLS["flaky"] = 0
    GATE.clear()
    return app, path


def signed_in(app, email, invite=None):
    c = app.test_client()
    body = {"email": email, "password": "long-enough-pw"}
    if invite:
        body["invite"] = invite
    assert c.post("/api/auth/signup", json=body).status_code == 201
    me = c.get("/api/auth/me").get_json()
    return c, me


def ids(me):
    return me["org"]["id"], me["user"]["id"]


def test_members_see_their_own_jobs_admins_see_the_org_and_other_orgs_see_nothing(app_db):
    app, db = app_db
    admin, admin_me = signed_in(app, "admin@example.com")
    token = admin.post("/api/org/invites", json={"role": "employee"}).get_json()["token"]
    emp, emp_me = signed_in(app, "emp@example.com", invite=token)
    other, _ = signed_in(app, "other@example.com")

    org_id, emp_id = ids(emp_me)
    jid = enqueue(db, "test.echo", {"value": 1}, org_id=org_id, user_id=emp_id)
    admin_job = enqueue(db, "test.echo", {}, org_id=org_id, user_id=ids(admin_me)[1])

    assert emp.get(f"/api/jobs/{jid}").get_json()["job"]["status"] == "queued"
    assert emp.get(f"/api/jobs/{admin_job}").status_code == 404
    assert admin.get(f"/api/jobs/{jid}").status_code == 200
    assert other.get(f"/api/jobs/{jid}").status_code == 404
    assert other.post(f"/api/jobs/{jid}/cancel").status_code == 404
    assert other.get(f"/api/jobs/{jid}/events").status_code == 404

    assert [j["id"] for j in emp.get("/api/jobs").get_json()["jobs"]] == [jid]
    assert len(admin.get("/api/jobs?all=1").get_json()["jobs"]) == 2
    assert len(emp.get("/api/jobs?all=1").get_json()["jobs"]) == 1  # ?all is admin-only
    assert "payload" not in emp.get(f"/api/jobs/{jid}").get_json()["job"]


def test_cancel_endpoint(app_db):
    app, db = app_db
    c, me = signed_in(app, "a@example.com")
    jid = enqueue(db, "test.echo", {}, org_id=ids(me)[0], user_id=ids(me)[1])
    assert c.post(f"/api/jobs/{jid}/cancel").get_json()["job"]["status"] == "cancelled"


def test_jobs_api_requires_sign_in(app_db):
    app, db = app_db
    jid = enqueue(db, "test.echo", {}, org_id=1)
    assert app.test_client().get(f"/api/jobs/{jid}").status_code == 401


def test_sse_stream_reports_progress_then_done(app_db):
    app, db = app_db
    c, me = signed_in(app, "a@example.com")
    jid = enqueue(db, "test.echo", {"value": 7}, org_id=ids(me)[0], user_id=ids(me)[1])
    run_one(db)
    r = c.get(f"/api/jobs/{jid}/events")
    assert r.status_code == 200 and r.mimetype == "text/event-stream"
    text = r.get_data(as_text=True)
    assert "event: progress" in text and "event: done" in text
    assert '"status": "succeeded"' in text and '"echo": 7' in text
