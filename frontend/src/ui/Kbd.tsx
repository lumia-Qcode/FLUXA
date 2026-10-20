import React from "react";

export interface KbdProps {
  children: React.ReactNode;
}

export const Kbd: React.FC<KbdProps> = ({ children }) => {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "18px",
        height: "18px",
        padding: "0 4px",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        color: "var(--ink-2)",
        background: "var(--bg-app)",
        border: "1px solid var(--line)",
        borderRadius: "3px",
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {children}
    </kbd>
  );
};
