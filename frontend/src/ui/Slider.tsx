import React from "react";

export interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  unit?: string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = "",
  disabled = false,
}) => {
  return (
    <div
      className="ui-slider-group"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: "var(--ink-2)",
          userSelect: "none",
        }}
      >
        {label && <span style={{ fontWeight: 500 }}>{label}</span>}
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%",
          height: "4px",
          accentColor: "var(--signal)",
          cursor: disabled ? "not-allowed" : "pointer",
          margin: "8px 0",
        }}
      />
    </div>
  );
};
