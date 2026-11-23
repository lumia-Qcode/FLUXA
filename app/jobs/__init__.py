"""Background jobs (F12).

Feature code uses three things:

    from app.jobs import job_handler, enqueue

    @job_handler("brand.ingest", max_attempts=2)
    def ingest(ctx, payload):
        ctx.progress(0.1, "Reading files")
        ...
        return {"brand_version_id": 7}

    job_id = enqueue(db_path, "brand.ingest", {"source_ids": [1, 2]}, org_id=g.org_id, user_id=g.user_id)

The UI follows a job with GET /api/jobs/<id> or the SSE stream /api/jobs/<id>/events.
"""

from app.jobs.queue import JobCancelled, JobError, enqueue, job_handler  # noqa: F401
