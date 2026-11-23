"""Job queue on SQLite: the `jobs` table, handler registry, enqueue, claim and finish.

Chosen over RQ + Redis (the original plan) because Redis isn't installed here and RQ's
worker needs fork(), which Windows lacks. Claiming is one atomic UPDATE ... RETURNING,
so several worker threads or processes can share the table safely. Feature code only
uses `job_handler`, `enqueue` and the JobContext it receives, so a Redis/RQ backend can
replace this module later without touching features.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Dict, Optional

if TYPE_CHECKING:
    from app.jobs.worker import JobContext

STATUSES = ("queued", "running", "succeeded", "failed", "cancelled")
TERMINAL = ("succeeded", "failed", "cancelled")
MAX_PAYLOAD_BYTES = 256 * 1024
MAX_RESULT_BYTES = 1024 * 1024
RETENTION_DAYS = 30


class JobCancelled(Exception):
    """Raised inside a handler (by JobContext.check_cancelled) when cancel was requested."""


class JobError(Exception):
    """A handler failure with a message that is safe to show the user."""


@dataclass(frozen=True)
class Handler:
    kind: str
    fn: Callable[["JobContext", Dict[str, Any]], Optional[Dict[str, Any]]]
    max_attempts: int = 1
    timeout_s: int = 15 * 60
    retry_delay_s: float = 5.0


HANDLERS: Dict[str, Handler] = {}
PERIODIC: Dict[str, float] = {}  # kind -> interval in seconds
SYSTEM_ORG_ID = 0  # owner of system jobs (retention etc.); no real org has id 0, so the API never shows them


def job_handler(kind: str, *, max_attempts: int = 1, timeout_s: int = 15 * 60, retry_delay_s: float = 5.0):
    """Register `fn(ctx, payload) -> result dict | None` as the handler for `kind`."""

    def decorator(fn):
        if kind in HANDLERS and HANDLERS[kind].fn is not fn:
            raise ValueError(f"job kind {kind!r} already has a handler")
        HANDLERS[kind] = Handler(kind, fn, max(1, max_attempts), timeout_s, retry_delay_s)
        return fn

    return decorator


def register_periodic(kind: str, every_s: float) -> None:
    """Run the handler for `kind` once per `every_s` seconds (queued by the worker's janitor)."""
    PERIODIC[kind] = float(every_s)


def enqueue_due_periodic(db_path: str, now: Optional[float] = None) -> list:
    """Queue each periodic job once per interval; the idempotency key makes repeats no-ops."""
    now = time.time() if now is None else now
    ids = []
    for kind, every in PERIODIC.items():
        if kind in HANDLERS:
            bucket = int(now // every)
            ids.append(enqueue(db_path, kind, {}, org_id=SYSTEM_ORG_ID, idempotency_key=f"periodic:{bucket}"))
    return ids


def init_schema(connection: sqlite3.Connection) -> None:
    # WAL lets the SSE progress readers and the workers' writes run side by side.
    connection.execute("PRAGMA journal_mode=WAL")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            org_id INTEGER NOT NULL,
            user_id INTEGER,
            kind TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
            progress REAL NOT NULL DEFAULT 0,
            stage TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            result_json TEXT,
            error TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 1,
            cancel_requested INTEGER NOT NULL DEFAULT 0,
            idempotency_key TEXT,
            run_after REAL NOT NULL DEFAULT 0,
            heartbeat_at REAL,
            created_at REAL NOT NULL,
            started_at REAL,
            finished_at REAL,
            updated_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, run_after, created_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_org_user ON jobs(org_id, user_id, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency
            ON jobs(org_id, kind, idempotency_key) WHERE idempotency_key IS NOT NULL;
        """
    )


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def enqueue(
    db_path: str,
    kind: str,
    payload: Optional[Dict[str, Any]] = None,
    *,
    org_id: int,
    user_id: Optional[int] = None,
    idempotency_key: Optional[str] = None,
) -> str:
    """Queue a job and return its id. With an idempotency key, an existing job is returned."""
    if kind not in HANDLERS:
        raise ValueError(f"no handler registered for job kind {kind!r}")
    body = json.dumps(payload or {})
    if len(body) > MAX_PAYLOAD_BYTES:
        raise ValueError("job payload is too large; store files and pass their ids instead")
    now = time.time()
    conn = _connect(db_path)
    try:
        if idempotency_key:
            row = conn.execute(
                "SELECT id FROM jobs WHERE org_id = ? AND kind = ? AND idempotency_key = ?",
                (org_id, kind, idempotency_key),
            ).fetchone()
            if row:
                return row["id"]
        job_id = uuid.uuid4().hex
        conn.execute(
            """
            INSERT INTO jobs (id, org_id, user_id, kind, payload_json, max_attempts, idempotency_key,
                              created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (job_id, org_id, user_id, kind, body, HANDLERS[kind].max_attempts, idempotency_key, now, now),
        )
        conn.commit()
        return job_id
    finally:
        conn.close()


def claim_next(conn: sqlite3.Connection, kinds=None) -> Optional[sqlite3.Row]:
    """Atomically move the oldest runnable queued job to running and return it."""
    now = time.time()
    kinds = list(kinds) if kinds is not None else list(HANDLERS)
    if not kinds:
        return None
    marks = ",".join("?" * len(kinds))
    row = conn.execute(
        f"""
        UPDATE jobs
        SET status = 'running', attempts = attempts + 1, started_at = COALESCE(started_at, ?),
            heartbeat_at = ?, updated_at = ?
        WHERE id = (
            SELECT id FROM jobs
            WHERE status = 'queued' AND run_after <= ? AND kind IN ({marks})
            ORDER BY created_at LIMIT 1
        ) AND status = 'queued'
        RETURNING *
        """,
        (now, now, now, now, *kinds),
    ).fetchone()
    conn.commit()
    return row


def update_progress(conn, job_id: str, progress=None, stage=None, message=None) -> bool:
    """Record progress and refresh the heartbeat. Returns whether cancel was requested."""
    now = time.time()
    sets, args = ["heartbeat_at = ?", "updated_at = ?"], [now, now]
    if progress is not None:
        sets.append("progress = ?")
        args.append(min(1.0, max(0.0, float(progress))))
    if stage is not None:
        sets.append("stage = ?")
        args.append(str(stage)[:80])
    if message is not None:
        sets.append("message = ?")
        args.append(str(message)[:500])
    conn.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id = ? AND status = 'running'", (*args, job_id))
    conn.commit()
    row = conn.execute("SELECT cancel_requested FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return bool(row and row["cancel_requested"])


def finish(conn, job_id: str, status: str, result=None, error: Optional[str] = None) -> None:
    assert status in TERMINAL
    now = time.time()
    result_json = None
    if result is not None:
        result_json = json.dumps(result)
        if len(result_json) > MAX_RESULT_BYTES:
            status, result_json, error = "failed", None, "The job's result was too large to store."
    conn.execute(
        """
        UPDATE jobs SET status = ?, result_json = ?, error = ?, finished_at = ?, updated_at = ?,
               progress = CASE WHEN ? = 'succeeded' THEN 1 ELSE progress END
        WHERE id = ?
        """,
        (status, result_json, (error or None) and error[:1000], now, now, status, job_id),
    )
    conn.commit()


def retry_later(conn, job_id: str, delay_s: float, error: str) -> None:
    now = time.time()
    conn.execute(
        "UPDATE jobs SET status = 'queued', run_after = ?, error = ?, updated_at = ? WHERE id = ?",
        (now + delay_s, error[:1000], now, job_id),
    )
    conn.commit()


def request_cancel(conn, job_id: str) -> Optional[str]:
    """Cancel a queued job now, or ask a running one to stop. Returns the new status."""
    now = time.time()
    conn.execute(
        "UPDATE jobs SET status = 'cancelled', finished_at = ?, updated_at = ?, cancel_requested = 1 "
        "WHERE id = ? AND status = 'queued'",
        (now, now, job_id),
    )
    conn.execute(
        "UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND status = 'running'",
        (now, job_id),
    )
    conn.commit()
    row = conn.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return row["status"] if row else None


def recover_stale(conn, stale_after_s: float = 120.0) -> int:
    """Jobs whose worker died (no heartbeat) go back to the queue, or fail if out of attempts."""
    now = time.time()
    cutoff = now - stale_after_s
    requeued = conn.execute(
        "UPDATE jobs SET status = 'queued', updated_at = ? "
        "WHERE status = 'running' AND heartbeat_at < ? AND attempts < max_attempts AND cancel_requested = 0",
        (now, cutoff),
    ).rowcount
    conn.execute(
        "UPDATE jobs SET status = CASE WHEN cancel_requested = 1 THEN 'cancelled' ELSE 'failed' END, "
        "error = COALESCE(error, 'The worker stopped while running this job.'), finished_at = ?, updated_at = ? "
        "WHERE status = 'running' AND heartbeat_at < ?",
        (now, now, cutoff),
    )
    conn.commit()
    return requeued


def purge_old(conn, days: int = RETENTION_DAYS) -> int:
    cutoff = time.time() - days * 86400
    n = conn.execute(
        "DELETE FROM jobs WHERE status IN ('succeeded', 'failed', 'cancelled') AND finished_at < ?", (cutoff,)
    ).rowcount
    conn.commit()
    return n


def job_dict(row) -> Dict[str, Any]:
    """The public view of a job (no payload: it may hold internal ids)."""
    return {
        "id": row["id"],
        "kind": row["kind"],
        "status": row["status"],
        "progress": round(row["progress"], 4),
        "stage": row["stage"],
        "message": row["message"],
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "error": row["error"] if row["status"] in ("failed", "cancelled") else None,
        "attempts": row["attempts"],
        "cancelRequested": bool(row["cancel_requested"]),
        "createdAt": row["created_at"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
    }
