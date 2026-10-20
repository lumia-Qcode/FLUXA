import React from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (val: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Select: React.FC<SelectProps> = ({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  style = {},
}) => {
  const id = React.useId();

  return (
    <div
      className="ui-select-wrapper"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        width: "100%",
      }}
    >
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--ink-2)",
            userSelect: "none",
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "center",
          ...style,
        }}
      >
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`ui-select ${className}`}
          style={{
            width: "100%",
            height: "var(--control-height, 28px)",
            padding: "0 24px 0 8px",
            fontSize: "13px",
            fontFamily: "var(--font-sans)",
            color: "var(--ink)",
            background: "var(--bg-panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm, 4px)",
            outline: "none",
            appearance: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.45 : 1,
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          style={{
            position: "absolute",
            right: "8px",
            pointerEvents: "none",
            color: "var(--ink-3)",
          }}
        />
      </div>
    </div>
  );
};
