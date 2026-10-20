import React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  active = false,
  size = "md",
  className = "",
  style = {},
  disabled,
  ...props
}) => {
  const dim = size === "sm" ? "24px" : "28px";

  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`ui-icon-button ${active ? "is-active" : ""} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim,
        height: dim,
        padding: 0,
        borderRadius: "var(--radius-sm, 4px)",
        background: active ? "var(--signal-weak)" : "transparent",
        color: active ? "var(--signal-weak-text)" : "var(--ink-2)",
        border: "1px solid",
        borderColor: active ? "var(--signal)" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background 100ms ease, color 100ms ease",
        ...style,
      }}
    >
      {icon}
    </button>
  );
};
