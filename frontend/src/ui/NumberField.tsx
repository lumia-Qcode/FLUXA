import React from "react";

export interface NumberFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label?: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  id,
  className = "",
  style = {},
  disabled,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      let clamped = parsed;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onChange(clamped);
    }
  };

  return (
    <div
      className="ui-number-field"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        width: "100%",
      }}
    >
      {label && (
        <label
          htmlFor={inputId}
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
          display: "flex",
          alignItems: "center",
          height: "var(--control-height, 28px)",
          background: "var(--bg-panel)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-sm, 4px)",
          padding: "0 6px",
          ...style,
        }}
      >
        <input
          {...props}
          id={inputId}
          type="number"
          value={isNaN(value) ? "" : value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={`ui-number-input tabular-nums ${className}`}
          style={{
            flex: 1,
            width: "100%",
            border: "none",
            background: "transparent",
            outline: "none",
            color: "var(--ink)",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            textAlign: "left",
          }}
        />
        {unit && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--ink-3)",
              userSelect: "none",
              marginLeft: "4px",
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};
