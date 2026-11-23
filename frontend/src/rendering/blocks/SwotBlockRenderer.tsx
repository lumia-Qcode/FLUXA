import React from "react";
import { Block } from "../../../../shared/spec";
import { ShieldCheck, AlertTriangle, TrendingUp, AlertOctagon } from "lucide-react";

interface Props {
  block: Block | any;
}

export const SwotBlockRenderer: React.FC<Props> = ({ block }) => {
  const swot = block.swot || block.props?.swot || {
    strengths: ["High accuracy in image diagnostics", "Substantial staff time savings"],
    weaknesses: ["High initial integration and compute cost", "Clinician adoption curve"],
    opportunities: ["Expansion across outpatient regional clinics", "Predictive clinical triage"],
    threats: ["Regulatory compliance requirements", "Interoperability fragmentation"],
  };

  const sections = [
    {
      title: "Strengths",
      icon: <ShieldCheck size={22} color="#10B981" />,
      color: "#10B981",
      bg: "rgba(16, 185, 129, 0.08)",
      border: "rgba(16, 185, 129, 0.25)",
      items: swot.strengths || [],
    },
    {
      title: "Weaknesses",
      icon: <AlertTriangle size={22} color="#F59E0B" />,
      color: "#F59E0B",
      bg: "rgba(245, 158, 11, 0.08)",
      border: "rgba(245, 158, 11, 0.25)",
      items: swot.weaknesses || [],
    },
    {
      title: "Opportunities",
      icon: <TrendingUp size={22} color="#3B82F6" />,
      color: "#3B82F6",
      bg: "rgba(59, 130, 246, 0.08)",
      border: "rgba(59, 130, 246, 0.25)",
      items: swot.opportunities || [],
    },
    {
      title: "Threats",
      icon: <AlertOctagon size={22} color="#EF4444" />,
      color: "#EF4444",
      bg: "rgba(239, 68, 68, 0.08)",
      border: "rgba(239, 68, 68, 0.25)",
      items: swot.threats || [],
    },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: "20px",
        boxSizing: "border-box",
        fontFamily: "var(--theme-font-body, system-ui, sans-serif)",
      }}
    >
      {sections.map((sec, idx) => (
        <div
          key={idx}
          style={{
            background: sec.bg,
            border: `1.5px solid ${sec.border}`,
            borderRadius: "14px",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "24px",
              fontWeight: 700,
              color: sec.color,
              borderBottom: `2px solid ${sec.border}`,
              paddingBottom: "10px",
              marginBottom: "14px",
            }}
          >
            {sec.icon}
            <span>{sec.title}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, overflowY: "auto" }}>
            {sec.items.map((item: string, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: "19px",
                  lineHeight: 1.45,
                  color: "var(--theme-text, #111827)",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: sec.color,
                    flexShrink: 0,
                    marginTop: 8,
                  }}
                />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
