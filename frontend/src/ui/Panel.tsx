import React from "react";

export interface PanelProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  borderRight?: boolean;
  borderLeft?: boolean;
  borderBottom?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  actions,
  children,
  borderRight = false,
  borderLeft = false,
  borderBottom = false,
  className = "",
  style = {},
}) => {
  return (
    <div
      className={`ui-panel ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-panel)",
        borderRight: borderRight ? "1px solid var(--line)" : "none",
        borderLeft: borderLeft ? "1px solid var(--line)" : "none",
        borderBottom: borderBottom ? "1px solid var(--line)" : "none",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderBottom: "1px solid var(--line)",
            minHeight: "36px",
            background: "var(--bg-panel)",
            userSelect: "none",
          }}
        >
          {title && (
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>
              {title}
            </span>
          )}
          {actions && <div style={{ display: "flex", gap: "6px" }}>{actions}</div>}
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
    </div>
  );
};
