import React from "react";
import { Block } from "../../../../shared/spec";

type KpiBlock = Extract<Block, { type: "kpi" }>;

interface Props {
  block: KpiBlock;
}

export const KpiBlockRenderer: React.FC<Props> = ({ block }) => {
  const { value, label, delta, format } = block;

  // Resolve raw value
  const displayVal = typeof value === "object" && "$bind" in value ? value.$bind : String(value ?? "");
  const formattedVal = `${format?.prefix || ""}${displayVal}${format?.suffix || ""}`;

  const deltaStr =
    delta !== undefined
      ? typeof delta === "object" && "$bind" in delta
        ? delta.$bind
        : String(delta)
      : null;

  const isPositive = deltaStr && (deltaStr.includes("+") || deltaStr.toLowerCase().includes("up"));
  const isNegative = deltaStr && (deltaStr.includes("-") || deltaStr.toLowerCase().includes("down"));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "1rem 1.5rem",
        boxSizing: "border-box",
      }}
      className="kpi-block-container block-kpi"
    >
      <div
        style={{
          fontSize: "clamp(32px, 5vw, 68px)",
          fontWeight: 800,
          lineHeight: 1.1,
          fontFamily: "var(--theme-font-heading)",
          color: "var(--theme-text)",
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          letterSpacing: "-0.02em",
        }}
      >
        <span>{formattedVal}</span>
        {deltaStr && (
          <span
            style={{
              fontSize: "0.35em",
              fontWeight: 600,
              padding: "0.2rem 0.5rem",
              borderRadius: "4px",
              background: isPositive
                ? "rgba(34, 197, 94, 0.15)"
                : isNegative
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(128, 128, 128, 0.15)",
              color: isPositive ? "#16A34A" : isNegative ? "#DC2626" : "var(--theme-secondary)",
              letterSpacing: "normal",
            }}
          >
            {deltaStr}
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "16px",
          fontWeight: 500,
          color: "var(--theme-secondary)",
          fontFamily: "var(--theme-font-body)",
        }}
      >
        {label}
      </div>
    </div>
  );
};
