import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Brief "Say Hello!" moment when the presenter's microphone turns on: black stage, a glossy ring
 * in the landing page's periwinkle, then it fades back to the slide on its own (~0.9 s).
 * Rendered into document.body so a transformed parent (the controls bar) can't clip it.
 */
export const SayHelloSplash: React.FC<{ onDone: () => void; durationMs?: number }> = ({ onDone, durationMs = 900 }) => {
  const [leaving, setLeaving] = useState(false);
  // The parent re-renders many times a second while listening; keep the timers independent of that.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), Math.max(200, durationMs - 300));
    const done = window.setTimeout(() => doneRef.current(), durationMs);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [durationMs]);

  return createPortal(
    <div
      className="fx-say-hello"
      role="status"
      aria-live="polite"
      aria-label="Microphone on. Say hello."
      onClick={onDone}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "#000",
        display: "grid",
        placeItems: "center",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        opacity: leaving ? 0 : 1,
        transition: "opacity 280ms ease-out",
        cursor: "pointer",
      }}
    >
      <style>{`
        @keyframes fxHelloSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fxHelloIn { from { transform: scale(.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .fx-say-hello * { animation: none !important } }
      `}</style>
      <div style={{ position: "relative", width: "min(46vmin, 420px)", aspectRatio: "1", display: "grid", placeItems: "center", animation: "fxHelloIn 260ms ease-out" }}>
        {/* Glossy ring: two offset conic gradients masked to a band */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "38%",
            background: "conic-gradient(from 210deg, #ffffff, #dfe5ff, #8aa0ff, #3f55d9, #aebfff, #ffffff)",
            WebkitMask: "radial-gradient(farthest-side, transparent 58%, #000 60%, #000 78%, transparent 80%)",
            mask: "radial-gradient(farthest-side, transparent 58%, #000 60%, #000 78%, transparent 80%)",
            filter: "drop-shadow(0 0 28px rgba(138,160,255,.45))",
            animation: "fxHelloSpin 2.4s linear infinite",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "9%",
            borderRadius: "42%",
            transform: "rotate(45deg)",
            background: "conic-gradient(from 30deg, rgba(255,255,255,.9), rgba(174,191,255,.2), rgba(138,160,255,.85), rgba(255,255,255,.15), rgba(255,255,255,.9))",
            WebkitMask: "radial-gradient(farthest-side, transparent 66%, #000 68%, #000 80%, transparent 82%)",
            mask: "radial-gradient(farthest-side, transparent 66%, #000 68%, #000 80%, transparent 82%)",
            opacity: 0.85,
          }}
        />
        <span style={{ position: "relative", color: "#fff", fontSize: "clamp(40px, 8vmin, 84px)", fontWeight: 500, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
          Say Hello!
        </span>
      </div>
      <span style={{ position: "absolute", bottom: 36, left: 0, right: 0, textAlign: "center", color: "#a4a4ac", fontSize: 13 }}>
        Microphone on
      </span>
    </div>,
    document.body
  );
};
