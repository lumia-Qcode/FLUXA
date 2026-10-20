import React from "react";

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, id, className = "", style = {}, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div
        className="ui-field"
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
        <input
          {...props}
          id={inputId}
          ref={ref}
          className={`ui-input ${error ? "has-error" : ""} ${className}`}
          style={{
            height: "var(--control-height, 28px)",
            padding: "0 8px",
            fontSize: "13px",
            fontFamily: "var(--font-sans)",
            color: "var(--ink)",
            background: "var(--bg-panel)",
            border: `1px solid ${error ? "var(--danger)" : "var(--line)"}`,
            borderRadius: "var(--radius-sm, 4px)",
            outline: "none",
            width: "100%",
            transition: "border-color 100ms ease",
            ...style,
          }}
        />
        {error && (
          <span style={{ fontSize: "11px", color: "var(--danger)" }}>{error}</span>
        )}
        {!error && hint && (
          <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>{hint}</span>
        )}
      </div>
    );
  }
);

Field.displayName = "Field";
