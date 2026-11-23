import React, { useEffect, useRef } from "react";
import { AlertCircle, Check, Pause, Play, X } from "lucide-react";

export type StepStatus = "done" | "active" | "pending" | "error";

export interface PipelineStep {
  id: string;
  title: string;
  status: StepStatus;
  /** One line under the title. */
  note?: string;
  /** Extra content shown under the step (sources, titles, thumbnails). */
  detail?: React.ReactNode;
}

export interface PipelineTimelineProps {
  heading: string;
  subheading?: string;
  steps: PipelineStep[];
  log?: string[];
  elapsedSeconds?: number;
  paused?: boolean;
  onTogglePause?: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  extraActions?: React.ReactNode;
}

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const PipelineTimeline: React.FC<PipelineTimelineProps> = ({
  heading,
  subheading,
  steps,
  log = [],
  elapsedSeconds,
  paused,
  onTogglePause,
  onCancel,
  cancelLabel = "Cancel",
  extraActions,
}) => {
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const activeIdx = steps.findIndex((s) => s.status === "active" || s.status === "error");

  return (
    <section className="fx-paper fx-timeline" aria-label={heading}>
      <div className="fx-timeline-head">
        <div>
          <h1>{heading}</h1>
          {subheading && <p>{subheading}</p>}
        </div>
        {elapsedSeconds !== undefined && (
          <span className="fx-clock" aria-label={`${elapsedSeconds} seconds elapsed`}>
            {clock(elapsedSeconds)}
          </span>
        )}
      </div>

      <ol className="fx-tl">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={`fx-tl-step is-${s.status} ${paused && s.status === "active" ? "is-paused" : ""}`}
            aria-current={s.status === "active" ? "step" : undefined}
          >
            <span className="fx-tl-node" aria-hidden="true">
              {s.status === "done" ? <Check size={15} /> : s.status === "error" ? <AlertCircle size={15} /> : i + 1}
            </span>
            <div className="fx-tl-body">
              <h2>{s.title}</h2>
              {s.note && <p className="fx-tl-status">{s.note}</p>}
              {s.detail && <div className="fx-tl-detail">{s.detail}</div>}
              {i === activeIdx && log.length > 0 && (
                <ol className="fx-log" ref={logRef} aria-live="polite" aria-label="Live log">
                  {log.slice(-40).map((line, li) => (
                    <li key={`${li}-${line}`}>{line}</li>
                  ))}
                </ol>
              )}
            </div>
          </li>
        ))}
      </ol>

      {(onTogglePause || onCancel || extraActions) && (
        <div className="fx-tl-actions">
          {onTogglePause && (
            <button type="button" className="fx-btn" onClick={onTogglePause} aria-pressed={!!paused}>
              {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
              {paused ? "Resume" : "Pause"}
            </button>
          )}
          {onCancel && (
            <button type="button" className="fx-btn is-quiet" onClick={onCancel}>
              <X size={15} aria-hidden="true" />
              {cancelLabel}
            </button>
          )}
          {extraActions}
        </div>
      )}
    </section>
  );
};
