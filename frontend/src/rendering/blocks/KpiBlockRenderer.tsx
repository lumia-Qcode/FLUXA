import React, { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Block, Dataset, Variable } from "../../../../shared/spec";
import { resolveBinding, buildReactiveScope } from "../../runtime/reactiveEngine";

type KpiBlock = Extract<Block, { type: "kpi" }>;

interface Props {
  block: KpiBlock;
  datasets?: Record<string, Dataset>;
  variables?: Record<string, Variable>;
}

export const KpiBlockRenderer: React.FC<Props> = ({ block, datasets = {}, variables = {} }) => {
  const { value, label, delta, format } = block;

  const reactiveScope = React.useMemo(() => {
    return buildReactiveScope(datasets, variables);
  }, [datasets, variables]);

  const resolvedValueResult = resolveBinding(value, reactiveScope);
  const resolvedDeltaResult = delta !== undefined ? resolveBinding(delta, reactiveScope) : null;

  const boundVarName =
    (block as any).variable ||
    (block as any).props?.variable ||
    Object.keys(variables).find((k) => k.startsWith("target_metric") || k.startsWith("metric_scale"));
  const boundVar = boundVarName ? variables[boundVarName] : undefined;
  const scaleMultiplier =
    boundVar && typeof boundVar.value === "number" && boundVar.value !== 50
      ? boundVar.value / 50
      : 1;

  const rawTargetVal = resolvedValueResult.value;
  const isNumeric = typeof rawTargetVal === "number" && !isNaN(rawTargetVal);
  const targetNum = isNumeric
    ? (scaleMultiplier !== 1 ? Math.round(rawTargetVal * scaleMultiplier) : rawTargetVal)
    : 0;

  // Animated count-up state
  const [currentNum, setCurrentNum] = useState<number>(() => targetNum);
  const prevNumRef = useRef<number>(targetNum);

  useEffect(() => {
    if (!isNumeric) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setCurrentNum(targetNum);
      prevNumRef.current = targetNum;
      return;
    }

    const startVal = prevNumRef.current;
    const endVal = targetNum;
    if (startVal === endVal) return;

    const duration = 650; // ms
    const startTime = performance.now();

    let animationFrameId: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic: 1 - pow(1 - progress, 3)
      const ease = 1 - Math.pow(1 - progress, 3);
      const val = startVal + (endVal - startVal) * ease;
      setCurrentNum(val);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        prevNumRef.current = endVal;
        setCurrentNum(endVal);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [targetNum, isNumeric]);

  // Format value
  const decimals = format?.decimals ?? (isNumeric && Number.isInteger(targetNum) ? 0 : 1);
  const displayVal = isNumeric
    ? currentNum.toFixed(decimals)
    : resolvedValueResult.error
    ? "Error"
    : String(rawTargetVal ?? "");

  const formattedVal = `${format?.prefix || ""}${displayVal}${format?.suffix || ""}`;

  // Format delta
  const rawDeltaVal = resolvedDeltaResult?.value;
  const deltaStr =
    rawDeltaVal !== undefined && rawDeltaVal !== null ? String(rawDeltaVal) : null;

  const isPositive = deltaStr && (deltaStr.includes("+") || deltaStr.toLowerCase().includes("up"));
  const isNegative = deltaStr && (deltaStr.includes("-") || deltaStr.toLowerCase().includes("down"));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "1.5rem 2rem",
        boxSizing: "border-box",
        position: "relative",
        background: "var(--theme-card-bg, rgba(255, 255, 255, 0.05))",
        border: "1px solid var(--theme-card-border, rgba(255, 255, 255, 0.12))",
        borderRadius: "18px",
        backdropFilter: "blur(10px)",
        boxShadow: "0 14px 36px rgba(0, 0, 0, 0.12)",
      }}
      className="kpi-block-container block-kpi"
    >
      {/* Inline Error Badge if expression has error */}
      {resolvedValueResult.error && (
        <div
          title={resolvedValueResult.error}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "rgba(196, 38, 46, 0.15)",
            color: "var(--danger, #C4262E)",
            fontSize: "11px",
            fontWeight: 500,
          }}
        >
          <AlertCircle size={12} />
          <span>Formula error</span>
        </div>
      )}

      <div
        style={{
          fontSize: "clamp(32px, 5vw, 68px)",
          fontWeight: 800,
          lineHeight: 1.1,
          fontFamily: "var(--theme-font-heading)",
          color: resolvedValueResult.error ? "var(--danger, #C4262E)" : "var(--theme-text)",
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          letterSpacing: "-0.02em",
        }}
      >
        <span className="kpi-value-text">{formattedVal}</span>
        {deltaStr && (
          <span
            style={{
              fontSize: "0.35em",
              fontWeight: 600,
              padding: "0.2rem 0.5rem",
              borderRadius: "4px",
              background: isPositive
                ? "rgba(34, 197, 94, 0.15)"
                : isNegative
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(128, 128, 128, 0.15)",
              color: isPositive ? "#16A34A" : isNegative ? "#DC2626" : "var(--theme-secondary)",
              letterSpacing: "normal",
            }}
          >
            {deltaStr}
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "16px",
          fontWeight: 500,
          color: "var(--theme-secondary)",
          fontFamily: "var(--theme-font-body)",
        }}
      >
        {label}
      </div>
    </div>
  );
};
