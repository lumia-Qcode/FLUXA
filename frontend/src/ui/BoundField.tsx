import React, { useId, useMemo, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Dataset, Variable } from "../../../shared/spec";
import { evaluateExpression } from "../runtime/evaluator";
import { buildReactiveScope } from "../runtime/reactiveEngine";

export interface BoundFieldProps {
  label: string;
  value: any; // primitive number/string or { $bind: string }
  onChange: (val: any) => void;
  type?: "text" | "number";
  variables?: Record<string, Variable>;
  datasets?: Record<string, Dataset>;
  className?: string;
}

export const BoundField: React.FC<BoundFieldProps> = ({
  label,
  value,
  onChange,
  type = "number",
  variables = {},
  datasets = {},
  className = "",
}) => {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);

  const isBound = Boolean(value && typeof value === "object" && typeof value.$bind === "string");
  const bindExpr = isBound ? value.$bind : "";

  // Temporary expression buffer while editing
  const [exprDraft, setExprDraft] = useState("");

  const handleOpen = () => {
    setExprDraft(isBound ? bindExpr : String(value ?? ""));
    setIsOpen(true);
  };

  // Compile reactive scope for live preview
  const reactiveScope = useMemo(() => {
    return buildReactiveScope(datasets, variables);
  }, [datasets, variables]);

  // Autocomplete suggestions
  const suggestions = useMemo(() => {
    const list: { name: string; type: "variable" | "column" | "function"; preview?: any }[] = [];

    // Functions
    ["sum", "avg", "min", "max", "round", "clamp", "first", "last"].forEach((fn) => {
      list.push({ name: `${fn}()`, type: "function" });
    });

    // Variables
    Object.entries(variables).forEach(([k, v]) => {
      list.push({ name: k, type: "variable", preview: v.value });
    });

    // Dataset columns (e.g. adoption.pct)
    Object.entries(datasets).forEach(([dsId, ds]) => {
      (ds.columns || []).forEach((col) => {
        list.push({ name: `${dsId}.${col.key}`, type: "column" });
      });
    });

    return list;
  }, [variables, datasets]);

  // Evaluate current draft live
  const previewResult = useMemo(() => {
    if (!exprDraft.trim()) return { value: undefined };
    return evaluateExpression(exprDraft, {
      variables: reactiveScope.variables,
      datasets: reactiveScope.datasets,
    });
  }, [exprDraft, reactiveScope]);

  const handleApplyBind = () => {
    if (!exprDraft.trim()) return;
    onChange({ $bind: exprDraft.trim() });
    setIsOpen(false);
  };

  const handleUnbind = () => {
    // Revert to evaluated preview value or 0/empty
    const fallback = previewResult.value !== undefined ? previewResult.value : (type === "number" ? 0 : "");
    onChange(fallback);
    setIsOpen(false);
  };

  return (
    <div
      className={`ui-bound-field-root ${className}`}
      style={{ display: "flex", flexDirection: "column", gap: "4px" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label
          htmlFor={id}
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--ink-2)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {label}
        </label>

        {/* Link Glyph Affordance */}
        <button
          type="button"
          onClick={handleOpen}
          title={isBound ? "Edit reactive binding" : "Bind to variable or dataset"}
          aria-label={isBound ? "Edit reactive binding" : "Bind to variable or dataset"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            fontSize: "11px",
            fontWeight: 500,
            color: isBound ? "var(--signal)" : "var(--ink-3)",
            background: isBound ? "var(--signal-weak)" : "transparent",
            border: isBound ? "1px solid var(--signal)" : "1px solid transparent",
            borderRadius: "4px",
            padding: "2px 6px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <Link2 size={12} strokeWidth={isBound ? 2.5 : 2} />
          {isBound ? "Bound" : "Bind"}
        </button>
      </div>

      {/* Main Input Display */}
      {isBound ? (
        <div
          onClick={handleOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            borderRadius: "4px",
            background: "var(--signal-weak)",
            border: "1px solid var(--signal)",
            cursor: "pointer",
            fontSize: "12px",
            fontFamily: "var(--theme-font-mono, monospace)",
            color: "var(--signal)",
            minHeight: "32px",
            boxSizing: "border-box",
          }}
          title="Click to edit formula"
        >
          <span style={{ fontWeight: 600 }}>$bind:</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bindExpr}
          </span>
          <span
            style={{
              fontSize: "11px",
              padding: "1px 5px",
              background: "rgba(35, 82, 245, 0.12)",
              borderRadius: "3px",
              fontWeight: 600,
            }}
          >
            ={String(previewResult.value ?? "…")}
          </span>
        </div>
      ) : (
        <input
          id={id}
          type={type === "number" ? "number" : "text"}
          value={value ?? ""}
          onChange={(e) => {
            const v = type === "number" ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value;
            onChange(v);
          }}
          style={{
            height: "32px",
            padding: "0 8px",
            borderRadius: "4px",
            border: "1px solid var(--line)",
            background: "var(--bg-app)",
            color: "var(--ink)",
            fontSize: "13px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Expression Editor Popover */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              width: "420px",
              background: "var(--bg-panel)",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.2)",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                Edit Expression ({label})
              </span>
              {isBound && (
                <button
                  type="button"
                  onClick={handleUnbind}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    border: "none",
                    background: "transparent",
                    color: "var(--danger, #C4262E)",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <Unlink size={13} />
                  Unbind
                </button>
              )}
            </div>

            {/* Formula Input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <input
                type="text"
                autoFocus
                value={exprDraft}
                onChange={(e) => setExprDraft(e.target.value)}
                placeholder="e.g. last(adoption.pct) or growth * 100"
                style={{
                  height: "36px",
                  padding: "0 10px",
                  borderRadius: "4px",
                  border: previewResult.error ? "1px solid var(--danger, #C4262E)" : "1px solid var(--signal)",
                  background: "var(--bg-app)",
                  color: "var(--ink)",
                  fontFamily: "var(--theme-font-mono, monospace)",
                  fontSize: "13px",
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleApplyBind();
                  } else if (e.key === "Escape") {
                    setIsOpen(false);
                  }
                }}
              />

              {/* Evaluation Preview or Error */}
              {previewResult.error ? (
                <span style={{ fontSize: "12px", color: "var(--danger, #C4262E)", marginTop: "2px" }}>
                  {previewResult.error}
                </span>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "var(--ink-2)",
                    marginTop: "2px",
                  }}
                >
                  <span>Evaluates to:</span>
                  <strong style={{ color: "var(--ink)", fontFamily: "monospace" }}>
                    {JSON.stringify(previewResult.value) ?? "undefined"}
                  </strong>
                </div>
              )}
            </div>

            {/* Quick Suggestions Chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)" }}>
                AVAILABLE VARIABLES & DATASETS
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  maxHeight: "120px",
                  overflowY: "auto",
                  padding: "4px",
                  background: "var(--bg-app)",
                  borderRadius: "4px",
                  border: "1px solid var(--line)",
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      if (s.type === "function") {
                        setExprDraft((prev) => prev ? `${prev} + ${s.name}` : s.name);
                      } else {
                        setExprDraft((prev) => prev ? `${prev} ${s.name}` : s.name);
                      }
                    }}
                    style={{
                      fontSize: "11px",
                      fontFamily: "var(--theme-font-mono, monospace)",
                      padding: "3px 7px",
                      borderRadius: "3px",
                      border: "1px solid var(--line)",
                      background: "var(--bg-panel)",
                      color: s.type === "variable" ? "var(--signal)" : "var(--ink)",
                      cursor: "pointer",
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  borderRadius: "4px",
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBind}
                disabled={Boolean(previewResult.error || !exprDraft.trim())}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "4px",
                  border: "none",
                  background: "var(--signal)",
                  color: "#FFFFFF",
                  cursor: previewResult.error || !exprDraft.trim() ? "not-allowed" : "pointer",
                  opacity: previewResult.error || !exprDraft.trim() ? 0.5 : 1,
                }}
              >
                Apply Binding
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
