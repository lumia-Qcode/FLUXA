import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/** A background job as /api/jobs returns it (F12). */
export interface Job {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  stage: string;
  message: string;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  cancelRequested: boolean;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export const isFinished = (job: Job | null) =>
  !!job && (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled");

const POLL_MS = 1500;

/**
 * Follow a background job until it finishes: the SSE stream when the browser has it,
 * polling otherwise (or if the stream drops). Pass null to follow nothing.
 */
export function useJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string>("");
  const doneRef = useRef(false);

  useEffect(() => {
    setJob(null);
    setError("");
    doneRef.current = false;
    if (!jobId) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | undefined;

    const accept = (next: Job) => {
      if (stopped) return;
      setJob(next);
      if (isFinished(next)) {
        doneRef.current = true;
        source?.close();
      }
    };

    const poll = async () => {
      if (stopped || doneRef.current) return;
      try {
        const data = await api.getJob(jobId);
        accept(data.job as Job);
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : "Couldn't load the job.");
      }
      if (!stopped && !doneRef.current) timer = setTimeout(poll, POLL_MS);
    };

    if (typeof EventSource !== "undefined") {
      source = new EventSource(`/api/jobs/${jobId}/events`);
      const onJob = (e: MessageEvent) => {
        try {
          accept(JSON.parse(e.data) as Job);
        } catch {
          /* ignore a malformed event; the next one or polling catches up */
        }
      };
      source.addEventListener("progress", onJob as EventListener);
      source.addEventListener("done", onJob as EventListener);
      source.onerror = () => {
        // Stream dropped (or timed out after 15 min): keep following by polling.
        source?.close();
        source = undefined;
        if (!stopped && !doneRef.current) poll();
      };
    } else {
      poll();
    }

    return () => {
      stopped = true;
      source?.close();
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await api.cancelJob(jobId);
      setJob(data.job as Job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel the job.");
    }
  }, [jobId]);

  return { job, error, cancel, finished: isFinished(job) };
}
