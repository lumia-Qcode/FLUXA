"""Worker threads that run queued jobs.

Each thread claims one job at a time, runs its handler inside an AI-gateway session
(so model usage is logged against the job's org and user), and records the outcome.
Python threads can't be killed, so cancellation and time limits are cooperative: a
handler calls `ctx.progress(...)` or `ctx.check_cancelled()` between steps, and those
raise when a cancel was requested or the job ran past its time limit.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from app.jobs import queue as q

log = logging.getLogger(__name__)


class JobContext:
    def __init__(self, conn, row, handler: q.Handler, db_path: str):
        self._conn = conn
        self.job_id: str = row["id"]
        self.kind: str = row["kind"]
        self.org_id: int = row["org_id"]
        self.user_id: Optional[int] = row["user_id"]
        self.attempt: int = row["attempts"]
        self.db_path = db_path
        self._deadline = time.time() + handler.timeout_s

    def progress(self, fraction: Optional[float] = None, stage: Optional[str] = None, message: Optional[str] = None) -> None:
        """Report progress (0..1) and a short stage label; also a cancel/timeout checkpoint."""
        if q.update_progress(self._conn, self.job_id, fraction, stage, message):
            raise q.JobCancelled()
        self._check_deadline()

    def check_cancelled(self) -> None:
        row = self._conn.execute("SELECT cancel_requested FROM jobs WHERE id = ?", (self.job_id,)).fetchone()
        if row and row["cancel_requested"]:
            raise q.JobCancelled()
        self._check_deadline()

    def _check_deadline(self) -> None:
        if time.time() > self._deadline:
            raise q.JobError("The job took longer than its time limit and was stopped.")


def run_one(db_path: str, kinds=None) -> Optional[str]:
    """Claim and run a single job. Returns its id, or None when the queue is empty."""
    from app.ai import gateway  # local: gateway imports the database module

    conn = q._connect(db_path)
    try:
        row = q.claim_next(conn, kinds)
        if row is None:
            return None
        handler = q.HANDLERS.get(row["kind"])
        if handler is None:
            q.finish(conn, row["id"], "failed", error=f"No handler for job kind {row['kind']!r}.")
            return row["id"]
        ctx = JobContext(conn, row, handler, db_path)
        payload: Dict[str, Any] = json.loads(row["payload_json"] or "{}")
        try:
            with gateway.session(f"job.{row['kind']}", org_id=row["org_id"], user_id=row["user_id"], db_path=db_path):
                result = handler.fn(ctx, payload)
            if q.update_progress(conn, row["id"]):
                q.finish(conn, row["id"], "cancelled", error="Cancelled.")
            else:
                q.finish(conn, row["id"], "succeeded", result=result)
        except q.JobCancelled:
            q.finish(conn, row["id"], "cancelled", error="Cancelled.")
        except q.JobError as exc:
            q.finish(conn, row["id"], "failed", error=str(exc))
        except Exception as exc:  # unexpected: maybe retry, never leak internals to the user
            log.exception("job %s (%s) failed on attempt %s", row["id"], row["kind"], row["attempts"])
            if row["attempts"] < handler.max_attempts:
                q.retry_later(conn, row["id"], handler.retry_delay_s * row["attempts"], type(exc).__name__)
            else:
                q.finish(conn, row["id"], "failed", error="The job failed. Try again, or contact an admin if it keeps failing.")
        return row["id"]
    finally:
        conn.close()


class JobWorker:
    """A small pool of threads polling the jobs table."""

    def __init__(self, db_path: str, concurrency: int = 2, poll_s: float = 0.5):
        self.db_path = db_path
        self.concurrency = max(1, concurrency)
        self.poll_s = poll_s
        self._stop = threading.Event()
        self._threads: List[threading.Thread] = []

    def start(self) -> "JobWorker":
        conn = q._connect(self.db_path)
        try:
            q.recover_stale(conn)
            q.purge_old(conn)
        finally:
            conn.close()
        q.enqueue_due_periodic(self.db_path)
        for i in range(self.concurrency):
            t = threading.Thread(target=self._loop, name=f"fluxa-job-worker-{i}", daemon=True)
            t.start()
            self._threads.append(t)
        threading.Thread(target=self._janitor, name="fluxa-job-janitor", daemon=True).start()
        return self

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        for t in self._threads:
            t.join(timeout)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                ran = run_one(self.db_path)
            except Exception:
                log.exception("job worker loop error")
                ran = None
            if ran is None:
                self._stop.wait(self.poll_s)

    def _janitor(self) -> None:
        while not self._stop.wait(60):
            try:
                conn = q._connect(self.db_path)
                try:
                    q.recover_stale(conn)
                finally:
                    conn.close()
                q.enqueue_due_periodic(self.db_path)
            except Exception:
                log.exception("job janitor error")


_WORKER: Optional[JobWorker] = None
_LOCK = threading.Lock()


def start_worker(db_path: str, concurrency: int = 2) -> JobWorker:
    """Start the process-wide worker once."""
    global _WORKER
    with _LOCK:
        if _WORKER is None:
            _WORKER = JobWorker(db_path, concurrency).start()
        return _WORKER
