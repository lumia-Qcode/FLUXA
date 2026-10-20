import React, { useState } from "react";
import { Block } from "../../../../shared/spec";

type ControlBlock = Extract<Block, { type: "control" }>;

interface Props {
  block: ControlBlock;
  onValueChange?: (variable: string, value: any) => void;
  interactive?: boolean;
}

export const ControlBlockRenderer: React.FC<Props> = ({
  block,
  onValueChange,
  interactive = true,
}) => {
  const { control, variable, label, min = 0, max = 100, step = 1, options = [] } = block;
  const [localVal, setLocalVal] = useState<any>(min);

  const handleChange = (newVal: any) => {
    setLocalVal(newVal);
    if (variable && onValueChange) {
      onValueChange(variable, newVal);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        background: "rgba(128, 128, 128, 0.08)",
        border: "1px solid rgba(128, 128, 128, 0.2)",
        borderRadius: "6px",
        padding: "0.75rem 1.25rem",
        boxSizing: "border-box",
        fontFamily: "var(--theme-font-body)",
        color: "var(--theme-text)",
      }}
      onClick={(e) => {
        // Prevent click from bubbling to slide stage advancement
        e.stopPropagation();
      }}
    >
      {label && (
        <span style={{ fontSize: "14px", fontWeight: 600, minWidth: "120px" }}>
          {label}
        </span>
      )}

      {control === "slider" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={localVal}
            disabled={!interactive}
            onChange={(e) => handleChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--theme-primary)", cursor: interactive ? "pointer" : "default" }}
          />
          <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--theme-font-mono)", minWidth: "40px" }}>
            {localVal}
          </span>
        </div>
      )}

      {control === "toggle" && (
        <label style={{ display: "inline-flex", alignItems: "center", cursor: interactive ? "pointer" : "default" }}>
          <input
            type="checkbox"
            checked={Boolean(localVal)}
            disabled={!interactive}
            onChange={(e) => handleChange(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--theme-primary)" }}
          />
          <span style={{ marginLeft: "0.5rem", fontSize: "13px" }}>
            {localVal ? "Enabled" : "Disabled"}
          </span>
        </label>
      )}

      {control === "select" && (
        <select
          value={localVal}
          disabled={!interactive}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: "4px",
            border: "1px solid rgba(128, 128, 128, 0.3)",
            background: "var(--theme-bg)",
            color: "var(--theme-text)",
            fontSize: "13px",
            cursor: interactive ? "pointer" : "default",
          }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {control === "button" && (
        <button
          type="button"
          disabled={!interactive}
          onClick={() => handleChange(true)}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            border: "none",
            background: "var(--theme-primary)",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: "13px",
            cursor: interactive ? "pointer" : "default",
          }}
        >
          {label || "Trigger Action"}
        </button>
      )}
    </div>
  );
};
