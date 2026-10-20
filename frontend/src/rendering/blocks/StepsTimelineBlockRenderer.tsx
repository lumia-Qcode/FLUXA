import React from "react";
import { Block } from "../../../../shared/spec";

type StepsBlock = Extract<Block, { type: "steps" | "timeline" }>;

interface Props {
  block: StepsBlock;
}

export const StepsTimelineBlockRenderer: React.FC<Props> = ({ block }) => {
  const { items = [], orientation = "h" } = block;
  const isHorizontal = orientation === "h";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        gap: "1.25rem",
        alignItems: isHorizontal ? "stretch" : "flex-start",
        justifyContent: "space-between",
        fontFamily: "var(--theme-font-body)",
        overflow: "hidden",
      }}
    >
      {items.map((item, idx) => (
        <div
          key={idx}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "rgba(128, 128, 128, 0.06)",
            border: "1px solid rgba(128, 128, 128, 0.18)",
            borderRadius: "6px",
            padding: "1rem 1.25rem",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {/* Step / Milestone index marker */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--theme-primary)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {idx + 1}
            </span>
            {item.date && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--theme-secondary)",
                }}
              >
                {item.date}
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--theme-text)",
              marginBottom: "0.35rem",
              fontFamily: "var(--theme-font-heading)",
            }}
          >
            {item.title}
          </div>

          {item.body && (
            <div
              style={{
                fontSize: "13px",
                color: "var(--theme-secondary)",
                lineHeight: 1.5,
              }}
            >
              {item.body}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
