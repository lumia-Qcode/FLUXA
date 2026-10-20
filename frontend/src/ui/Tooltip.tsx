import React, { useState } from "react";

export interface TooltipProps {
  content: string;
  shortcut?: string;
  children: React.ReactElement;
  placement?: "top" | "bottom";
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  children,
  placement = "top",
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            [placement === "top" ? "bottom" : "top"]: "100%",
            left: "50%",
            transform: `translateX(-50%) ${placement === "top" ? "translateY(-4px)" : "translateY(4px)"}`,
            background: "var(--ink)",
            color: "var(--bg-panel)",
            padding: "3px 7px",
            borderRadius: "4px",
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            whiteSpace: "nowrap",
            zIndex: 99999,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <span>{content}</span>
          {shortcut && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                opacity: 0.75,
                fontSize: "10px",
              }}
            >
              {shortcut}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
