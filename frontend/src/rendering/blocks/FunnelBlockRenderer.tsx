import React from "react";
import { Block } from "../../../../shared/spec";

interface Props {
  block: Block | any;
}

export const FunnelBlockRenderer: React.FC<Props> = ({ block }) => {
  const funnel = block.funnel || block.props?.funnel || {
    stages: [
      { name: "Initial Screening", value: "10,000", pct: "100%", desc: "Patient population screened" },
      { name: "Risk Flagged by AI", value: "3,200", pct: "32%", desc: "Early warning detection" },
      { name: "Clinical Validation", value: "1,850", pct: "18.5%", desc: "Physician diagnostic review" },
      { name: "Targeted Treatment", value: "1,420", pct: "14.2%", desc: "Optimized therapeutic delivery" },
    ],
  };

  const stages: any[] = funnel.stages || [];
  const colors = ["#2563EB", "#0284C7", "#0D9488", "#10B981", "#059669"];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "14px",
        boxSizing: "border-box",
        fontFamily: "var(--theme-font-body, system-ui, sans-serif)",
      }}
    >
      {stages.map((st, idx) => {
        const widthPct = Math.max(45, 100 - idx * 14);
        const stageColor = colors[idx % colors.length];

        return (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                width: `${widthPct}%`,
                background: `linear-gradient(90deg, ${stageColor}15, ${stageColor}25)`,
                border: `1.5px solid ${stageColor}50`,
                borderRadius: "12px",
                padding: "16px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxSizing: "border-box",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: stageColor,
                    color: "#FFFFFF",
                    fontSize: "15px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {idx + 1}
                </span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--theme-text, #111827)" }}>
                    {st.name}
                  </span>
                  {st.desc && (
                    <span style={{ fontSize: "14px", color: "var(--theme-secondary, #64748B)" }}>
                      {st.desc}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontSize: "30px",
                    fontWeight: 800,
                    color: stageColor,
                    fontFamily: "var(--theme-font-heading, system-ui, sans-serif)",
                  }}
                >
                  {st.value}
                </span>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "var(--theme-secondary, #64748B)",
                  }}
                >
                  ({st.pct})
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
