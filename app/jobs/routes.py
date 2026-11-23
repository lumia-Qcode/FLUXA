"""Job status API (F12).

GET  /api/jobs                 your recent jobs (admins: the whole org's, with ?all=1)
GET  /api/jobs/<id>            one job's status
GET  /api/jobs/<id>/events     Server-Sent Events: `progress` on every change, then `done`
POST /api/jobs/<id>/cancel     cancel a queued job, or ask a running one to stop

Jobs are created by features, never directly through this API. A member sees their own
jobs; admins see every job in their org. Anything else answers 404.
"""

from __future__ import annotations

import json
import time

from flask import Blueprint, Response, current_app, g, request, stream_with_context

from app.jobs import queue as q

jobs_bp = Blueprint("jobs", __name__)

NOT_FOUND = ({"error": "Job not found."}, 404)
STREAM_POLL_S = 0.5
STREAM_HEARTBEAT_S = 15.0
STREAM_MAX_S = 15 * 60


def _db():
    return q._connect(current_app.config["DATABASE_PATH"])


def _visible_job(conn, job_id):
    row = conn.execute("SELECT * FROM jobs WHERE id = ? AND org_id = ?", (job_id, g.org_id)).fetchone()
    if row is None:
        return None
    if g.get("role") != "admin" and row["user_id"] != g.user_id:
        return None
    return row


@jobs_bp.get("")
def list_jobs():
    try:
        limit = max(1, min(int(request.args.get("limit", 20)), 100))
    except ValueError:
        limit = 20
    sql = "SELECT * FROM jobs WHERE org_id = ?"
    args = [g.org_id]
    if not (g.get("role") == "admin" and request.args.get("all") == "1"):
        sql += " AND user_id = ?"
        args.append(g.user_id)
    if request.args.get("kind"):
        sql += " AND kind = ?"
        args.append(request.args["kind"])
    sql += " ORDER BY created_at DESC LIMIT ?"
    args.append(limit)
    conn = _db()
    try:
        return {"jobs": [q.job_dict(r) for r in conn.execute(sql, args).fetchall()]}
    finally:
        conn.close()


@jobs_bp.get("/<job_id>")
def get_job(job_id):
    conn = _db()
    try:
        row = _visible_job(conn, job_id)
        return {"job": q.job_dict(row)} if row else NOT_FOUND
    finally:
        conn.close()


@jobs_bp.post("/<job_id>/cancel")
def cancel_job(job_id):
    conn = _db()
    try:
        row = _visible_job(conn, job_id)
        if row is None:
            return NOT_FOUND
        if row["status"] in q.TERMINAL:
            return {"job": q.job_dict(row)}
        q.request_cancel(conn, job_id)
        return {"job": q.job_dict(conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone())}
    finally:
        conn.close()


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@jobs_bp.get("/<job_id>/events")
def job_events(job_id):
    conn = _db()
    try:
        if _visible_job(conn, job_id) is None:
            return NOT_FOUND
    finally:
        conn.close()
    db_path = current_app.config["DATABASE_PATH"]

    def stream():
        c = q._connect(db_path)
        try:
            last = None
            started = last_beat = time.time()
            while True:
                row = c.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
                if row is None:
                    yield _sse("error", {"error": "Job not found."})
                    return
                job = q.job_dict(row)
                if row["updated_at"] != last:
                    last = row["updated_at"]
                    yield _sse("progress", job)
                    last_beat = time.time()
                if row["status"] in q.TERMINAL:
                    yield _sse("done", job)
                    return
                now = time.time()
                if now - started > STREAM_MAX_S:
                    yield _sse("timeout", {"message": "Still running; reconnect to keep following it."})
                    return
                if now - last_beat > STREAM_HEARTBEAT_S:
                    yield ": keep-alive\n\n"
                    last_beat = now
                time.sleep(STREAM_POLL_S)
        finally:
            c.close()

    return Response(
        stream_with_context(stream()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
