import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
  style = {},
  disabled,
  ...props
}) => {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";

  let bg = "var(--bg-panel)";
  let color = "var(--ink)";
  let border = "1px solid var(--line)";

  if (isPrimary) {
    bg = "var(--signal)";
    color = "var(--signal-text)";
    border = "1px solid var(--signal)";
  } else if (isDanger) {
    bg = "var(--danger)";
    color = "var(--danger-text)";
    border = "1px solid var(--danger)";
  } else if (isGhost) {
    bg = "transparent";
    color = "var(--ink-2)";
    border = "1px solid transparent";
  }

  const height = size === "sm" ? "var(--control-height-sm, 24px)" : "var(--control-height, 28px)";
  const padding = size === "sm" ? "0 8px" : "0 10px";
  const fontSize = size === "sm" ? "12px" : "13px";

  return (
    <button
      {...props}
      disabled={disabled}
      className={`ui-button ui-button-${variant} ui-button-${size} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        height,
        padding,
        fontSize,
        fontWeight: isPrimary ? 500 : 400,
        fontFamily: "var(--font-sans)",
        lineHeight: 1,
        borderRadius: "var(--radius-sm, 4px)",
        background: bg,
        color,
        border,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        userSelect: "none",
        whiteSpace: "nowrap",
        transition: "background 100ms ease, border-color 100ms ease",
        ...style,
      }}
    >
      {icon && <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>}
      {children}
    </button>
  );
};
