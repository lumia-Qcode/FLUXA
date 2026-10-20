import React from "react";

export interface SwitchProps {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        userSelect: "none",
        fontSize: "13px",
        color: "var(--ink)",
      }}
    >
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        style={{
          width: "32px",
          height: "18px",
          borderRadius: "9px",
          background: checked ? "var(--signal)" : "var(--line)",
          position: "relative",
          transition: "background 120ms ease-out",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "14px",
            height: "14px",
            borderRadius: "7px",
            background: "#FFFFFF",
            position: "absolute",
            top: "2px",
            left: checked ? "16px" : "2px",
            transition: "left 120ms ease-out",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
      </div>
      {label && <span>{label}</span>}
    </label>
  );
};
