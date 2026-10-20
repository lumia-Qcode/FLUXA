import React from "react";
import { Block, Variable } from "../../../../shared/spec";

type ControlBlock = Extract<Block, { type: "control" }>;

interface Props {
  block: ControlBlock;
  variables?: Record<string, Variable>;
  onValueChange?: (variable: string, value: any) => void;
  onNavigateSlide?: (slideId: string) => void;
  interactive?: boolean;
}

export const ControlBlockRenderer: React.FC<Props> = ({
  block,
  variables = {},
  onValueChange,
  onNavigateSlide,
  interactive = true,
}) => {
  const { control, variable, label, min = 0, max = 100, step = 1, options = [], action } = block;

  // Retrieve current value from bound variable or fallback
  const boundVar = variable ? variables[variable] : undefined;
  const currentVal = boundVar ? boundVar.value : (control === "toggle" ? false : min);

  const handleChange = (newVal: any) => {
    if (variable && onValueChange) {
      onValueChange(variable, newVal);
    }
  };

  const handleButtonClick = () => {
    if (!interactive) return;

    if (action?.goToSlide && onNavigateSlide) {
      onNavigateSlide(action.goToSlide);
    } else if (action?.setVariable && onValueChange) {
      const [varName, varVal] = action.setVariable;
      onValueChange(varName, varVal);
    } else if (action?.openUrl) {
      window.open(action.openUrl, "_blank", "noopener,noreferrer");
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
      className="control-block-container block-control"
      onClick={(e) => {
        // Prevent click from bubbling to slide advancement in PresentMode
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        // Prevent canvas drag initiation
        e.stopPropagation();
      }}
    >
      {label && control !== "button" && (
        <span style={{ fontSize: "14px", fontWeight: 600, minWidth: "120px" }}>
          {label}
        </span>
      )}

      {/* Slider */}
      {control === "slider" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={Number(currentVal ?? min)}
            disabled={!interactive}
            onChange={(e) => handleChange(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: "var(--theme-primary, #2352F5)",
              cursor: interactive ? "pointer" : "default",
            }}
          />
          <span
            style={{
              fontSize: "14px",
              fontWeight: 700,
              fontFamily: "var(--theme-font-mono, monospace)",
              minWidth: "48px",
              textAlign: "right",
            }}
          >
            {Number(currentVal ?? min)}
          </span>
        </div>
      )}

      {/* Toggle */}
      {control === "toggle" && (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            cursor: interactive ? "pointer" : "default",
            gap: "0.5rem",
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(currentVal)}
            disabled={!interactive}
            onChange={(e) => handleChange(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--theme-primary, #2352F5)" }}
          />
          <span style={{ fontSize: "13px" }}>
            {currentVal ? "Enabled" : "Disabled"}
          </span>
        </label>
      )}

      {/* Select */}
      {control === "select" && (
        <select
          value={String(currentVal ?? "")}
          disabled={!interactive}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: "4px",
            border: "1px solid rgba(128, 128, 128, 0.3)",
            background: "var(--theme-bg, #FFFFFF)",
            color: "var(--theme-text, #111827)",
            fontSize: "13px",
            cursor: interactive ? "pointer" : "default",
            outline: "none",
          }}
        >
          {(options.length > 0 ? options : ["Option 1", "Option 2"]).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {/* Segmented */}
      {control === "segmented" && (
        <div style={{ display: "inline-flex", borderRadius: "4px", border: "1px solid var(--line)", overflow: "hidden" }}>
          {(options.length > 0 ? options : ["Option A", "Option B"]).map((opt) => {
            const isSelected = String(currentVal) === opt;
            return (
              <button
                key={opt}
                type="button"
                disabled={!interactive}
                onClick={() => handleChange(opt)}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: isSelected ? 600 : 400,
                  border: "none",
                  borderRight: "1px solid var(--line)",
                  background: isSelected ? "var(--signal, #2352F5)" : "var(--bg-app)",
                  color: isSelected ? "#FFFFFF" : "var(--ink)",
                  cursor: interactive ? "pointer" : "default",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {/* Button */}
      {control === "button" && (
        <button
          type="button"
          disabled={!interactive}
          onClick={handleButtonClick}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "4px",
            background: "var(--theme-primary, #2352F5)",
            color: "#FFFFFF",
            border: "none",
            fontSize: "14px",
            fontWeight: 600,
            cursor: interactive ? "pointer" : "default",
            transition: "opacity 0.15s ease",
          }}
        >
          {label || "Action"}
        </button>
      )}
    </div>
  );
};
