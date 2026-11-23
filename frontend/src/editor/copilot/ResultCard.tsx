import React from "react";
import { AIOperation } from "../store/opsEngine";

interface ResultCardProps {
  title?: string;
  summary: string;
  slideNumber?: number | string;
  slideId?: string;
  ops?: AIOperation[];
  applied?: boolean;
  timestamp?: string;
  diff?: { added: string[]; changed: string[]; removed: string[] };
  onApply?: () => void;
  onReject?: () => void;
  onViewSlide?: (id?: string) => void;
  onUndo?: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  title = "Slide 3 updated",
  summary = "Applied slide refinements, refreshed layout metrics, and optimized presentation visual balance.",
  slideNumber = 3,
  applied = true,
  timestamp,
  diff,
  onApply,
  onReject,
  onViewSlide,
  onUndo,
}) => {
  const hasDiff = diff && (diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0);
  const isDiffEmpty = diff !== undefined && !hasDiff;
  return (
    <div className="fluxa-result-card-wrapper fluxa-card-animated">
      <div className="fluxa-result-card">
        {/* Lavender Graphic Header with Mini Slide Thumbnail */}
        <div className="fluxa-card-header">
          <div
            style={{
              width: "180px",
              height: "100px",
              backgroundColor: "#101013",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 10px 24px rgba(10, 8, 30, 0.35)",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxSizing: "border-box",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Top row with slide badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "#F2B5C4",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                SLIDE {slideNumber}
              </span>
              <div
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  backgroundColor: "#AEBFFF",
                  opacity: 0.9,
                }}
              />
            </div>

            {/* Slide title mockup lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <div
                style={{
                  width: "80%",
                  height: "5px",
                  backgroundColor: "#FFFFFF",
                  borderRadius: "2.5px",
                  opacity: 0.95,
                }}
              />
              <div
                style={{
                  width: "50%",
                  height: "3.5px",
                  backgroundColor: "#8A8A96",
                  borderRadius: "2px",
                  opacity: 0.6,
                }}
              />
            </div>

            {/* Mini visual elements / chart mockup */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "6px",
                height: "32px",
                paddingTop: "4px",
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: "50%",
                  backgroundColor: "#AEBFFF",
                  borderRadius: "3px",
                  opacity: 0.85,
                }}
              />
              <div
                style={{
                  flex: 1.2,
                  height: "85%",
                  backgroundColor: "#F2B5C4",
                  borderRadius: "3px",
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: "40%",
                  backgroundColor: "#F2B5C4",
                  borderRadius: "3px",
                  opacity: 0.75,
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: "65%",
                  backgroundColor: "rgba(255, 255, 255, 0.4)",
                  borderRadius: "3px",
                }}
              />
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="fluxa-card-body">
          <h4 className="fluxa-card-title">{title}</h4>
          <p className="fluxa-card-description">{summary}</p>

          {/* Diff chips */}
          {diff && (
            <>
              {hasDiff && (
                <div className="fluxa-diff-chips">
                  {diff.added.map((item, i) => (
                    <span key={`added-${i}`} className="fluxa-diff-chip added">{item}</span>
                  ))}
                  {diff.changed.map((item, i) => (
                    <span key={`changed-${i}`} className="fluxa-diff-chip changed">{item}</span>
                  ))}
                  {diff.removed.map((item, i) => (
                    <span key={`removed-${i}`} className="fluxa-diff-chip removed">{item}</span>
                  ))}
                </div>
              )}
              {isDiffEmpty && (
                <p className="fluxa-no-diff-warning">
                  No changes detected — the copilot reply did not modify the deck.
                </p>
              )}
            </>
          )}

          {/* Action Links */}
          <div className="fluxa-card-actions">
            {!applied ? (
              <>
                {onApply && (
                  <button
                    type="button"
                    onClick={onApply}
                    className="fluxa-lime-link"
                  >
                    Apply
                  </button>
                )}
                {onViewSlide && (
                  <button
                    type="button"
                    onClick={() => onViewSlide()}
                    className="fluxa-lime-link"
                  >
                    View slide
                  </button>
                )}
                {onReject && (
                  <button
                    type="button"
                    onClick={onReject}
                    className="fluxa-lime-link"
                    style={{ color: "#5B5B61" }}
                  >
                    Reject
                  </button>
                )}
              </>
            ) : (
              <>
                {onViewSlide && (
                  <button
                    type="button"
                    onClick={() => onViewSlide()}
                    className="fluxa-lime-link"
                  >
                    View slide
                  </button>
                )}
                {onUndo && (
                  <button
                    type="button"
                    onClick={onUndo}
                    className="fluxa-lime-link"
                  >
                    Undo
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {timestamp && (
        <span className="fluxa-timestamp-bot">
          {timestamp}
        </span>
      )}
    </div>
  );
};
