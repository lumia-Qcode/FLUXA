import React from "react";
import { Block } from "../../../../shared/spec";

interface Props {
  block: Block | any;
}

export const MarketSizeBlockRenderer: React.FC<Props> = ({ block }) => {
  const data = block.marketSize || block.props?.marketSize || {
    tam: { value: "$185B", label: "Total Addressable Market", sub: "Global Healthcare AI Market by 2030" },
    sam: { value: "$48B", label: "Serviceable Addressable Market", sub: "Hospital Diagnostic & Clinical Automation" },
    som: { value: "$9.2B", label: "Serviceable Obtainable Market", sub: "Immediate High-Acuity Provider Systems" },
  };

  const tiers = [
    {
      code: "TAM",
      title: data.tam?.label || "Total Addressable Market",
      val: data.tam?.value || "$185B",
      desc: data.tam?.sub || "Broadest industry scope",
      bg: "rgba(37, 99, 235, 0.08)",
      border: "rgba(37, 99, 235, 0.3)",
      color: "#2563EB",
      widthPct: 100,
    },
    {
      code: "SAM",
      title: data.sam?.label || "Serviceable Addressable Market",
      val: data.sam?.value || "$48B",
      desc: data.sam?.sub || "Core target segment",
      bg: "rgba(16, 185, 129, 0.08)",
      border: "rgba(16, 185, 129, 0.3)",
      color: "#10B981",
      widthPct: 78,
    },
    {
      code: "SOM",
      title: data.som?.label || "Serviceable Obtainable Market",
      val: data.som?.value || "$9.2B",
      desc: data.som?.sub || "Direct serviceable capture",
      bg: "rgba(245, 158, 11, 0.08)",
      border: "rgba(245, 158, 11, 0.3)",
      color: "#F59E0B",
      widthPct: 56,
    },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "18px",
        boxSizing: "border-box",
        fontFamily: "var(--theme-font-body, system-ui, sans-serif)",
      }}
    >
      {tiers.map((t, idx) => (
        <div
          key={idx}
          style={{
            flex: 1,
            width: `${t.widthPct}%`,
            background: t.bg,
            border: `2px solid ${t.border}`,
            borderRadius: "14px",
            padding: "20px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  background: t.color,
                  color: "#FFFFFF",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                }}
              >
                {t.code}
              </span>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--theme-text, #111827)" }}>
                {t.title}
              </span>
            </div>
            <span style={{ fontSize: "16px", color: "var(--theme-secondary, #64748B)" }}>
              {t.desc}
            </span>
          </div>

          <div
            style={{
              fontSize: "44px",
              fontWeight: 800,
              color: t.color,
              fontFamily: "var(--theme-font-heading, system-ui, sans-serif)",
              letterSpacing: "-0.02em",
            }}
          >
            {t.val}
          </div>
        </div>
      ))}
    </div>
  );
};
