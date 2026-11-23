"""Background jobs that check and read uploads (F12 handlers)."""

from __future__ import annotations

import json
import os

from app.ingest import store
from app.ingest.guards import Rejected
from app.ingest.sandbox import SandboxError, run_sandboxed
from app.ingest.sniff import EXTENSIONS
from app.jobs import JobError, job_handler
from app.jobs.queue import _connect


def _mark_failed_on_crash(fn):
    def wrapped(ctx, payload):
        try:
            return fn(ctx, payload)
        except JobError:
            raise
        except Exception:
            conn = _connect(ctx.db_path)
            try:
                if store.get(conn, ctx.org_id, int(payload.get("upload_id", 0))):
                    store.update(conn, int(payload["upload_id"]), status="failed", error="Reading the upload failed.")
            finally:
                conn.close()
            raise

    wrapped.__name__ = fn.__name__
    return wrapped


@job_handler("ingest.file", max_attempts=1, timeout_s=5 * 60)
@_mark_failed_on_crash
def ingest_file(ctx, payload):
    conn = _connect(ctx.db_path)
    try:
        row = store.get(conn, ctx.org_id, int(payload["upload_id"]))
        if row is None or not row["tmp_path"]:
            raise JobError("The upload is no longer available.")
        store.update(conn, row["id"], status="processing")
        ctx.progress(0.1, "Checking the file")
        cleaned = row["tmp_path"] + ".clean"
        try:
            outcome = run_sandboxed(row["kind"], row["tmp_path"], cleaned)
        except SandboxError as exc:
            store.update(conn, row["id"], status="failed", error=str(exc))
            store.remove_quietly(row["tmp_path"])
            store.remove_quietly(cleaned)
            raise JobError(str(exc)) from None
        if not outcome.get("ok"):
            message = outcome.get("rejected") or "The file was refused."
            store.update(conn, row["id"], status="rejected", error=message)
            store.remove_quietly(row["tmp_path"])
            store.remove_quietly(cleaned)
            raise JobError(message)

        ctx.progress(0.8, "Saving")
        source = cleaned if outcome.get("cleaned") else row["tmp_path"]
        dest = store.final_path(ctx.db_path, ctx.org_id, row["area"], row["sha256"], EXTENSIONS.get(row["kind"], ""))
        store.move_into_place(source, dest)
        if source != row["tmp_path"]:
            store.remove_quietly(row["tmp_path"])
        extract = outcome["extract"]
        store.update(
            conn,
            row["id"],
            status="ready",
            error=None,
            tmp_path=None,
            storage_path=dest,
            size=os.path.getsize(dest),
            extract_json=json.dumps(extract),
            injection_suspected=1 if extract.get("injection_suspected") else 0,
        )
        return {"upload_id": row["id"], "kind": row["kind"], "injection_suspected": bool(extract.get("injection_suspected"))}
    finally:
        conn.close()


@job_handler("ingest.url", max_attempts=2, timeout_s=2 * 60, retry_delay_s=10)
@_mark_failed_on_crash
def ingest_url_job(ctx, payload):
    from app.ingest.web import ingest_url

    conn = _connect(ctx.db_path)
    try:
        row = store.get(conn, ctx.org_id, int(payload["upload_id"]))
        if row is None:
            raise JobError("The upload is no longer available.")
        store.update(conn, row["id"], status="processing")
        try:
            extract = ingest_url(row["source_url"], progress=lambda f, s=None: ctx.progress(f, s))
        except Rejected as exc:
            store.update(conn, row["id"], status="rejected", error=str(exc))
            raise JobError(str(exc)) from None
        store.update(
            conn,
            row["id"],
            status="ready",
            error=None,
            kind="url",
            mime="text/html",
            extract_json=json.dumps(extract),
            injection_suspected=1 if extract.get("injection_suspected") else 0,
        )
        return {"upload_id": row["id"], "kind": "url", "injection_suspected": bool(extract.get("injection_suspected"))}
    finally:
        conn.close()
