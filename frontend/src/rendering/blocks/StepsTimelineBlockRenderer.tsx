import React from "react";
import { Block } from "../../../../shared/spec";

type StepsBlock = Extract<Block, { type: "steps" | "timeline" }>;

interface Props {
  block: StepsBlock;
}

export const StepsTimelineBlockRenderer: React.FC<Props> = ({ block }) => {
  const items: any[] =
    block.items ||
    (block as any).props?.items ||
    ((block as any).props?.steps
      ? (block as any).props.steps.map((s: any, idx: number) => ({
          title: s.title || s.step || `Phase ${idx + 1}`,
          body: s.body || s.desc || "",
          date: s.date || `0${idx + 1}`,
        }))
      : []);
  const orientation = block.orientation || (block as any).props?.orientation || "h";
  const isHorizontal = orientation === "h";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        gap: "1.75rem",
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
            background: "rgba(128, 128, 128, 0.05)",
            border: "1px solid rgba(128, 128, 128, 0.18)",
            borderRadius: "14px",
            padding: "1.75rem 2rem",
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
              marginBottom: "1rem",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--theme-primary, #2563EB)",
                color: "#FFFFFF",
                fontSize: "20px",
                fontWeight: 700,
              }}
            >
              {idx + 1}
            </span>
            {item.date && (
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--theme-secondary)",
                  background: "rgba(128, 128, 128, 0.1)",
                  padding: "4px 12px",
                  borderRadius: "16px",
                }}
              >
                {item.date}
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--theme-text)",
              marginBottom: "0.75rem",
              fontFamily: "var(--theme-font-heading)",
            }}
          >
            {item.title}
          </div>

          {item.body && (
            <div
              style={{
                fontSize: "22px",
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
