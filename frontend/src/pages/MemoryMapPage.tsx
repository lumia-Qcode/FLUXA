import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface Concept { id: string; label: string; slide?: number | null; importance: number }
interface MapData {
  deckTitle: string;
  title: string;
  concepts: Concept[];
  links: { from: string; to: string; label: string }[];
  numbers: { value: string; label: string; slide?: number | null }[];
  takeaways: string[];
}

const W = 860;
const H = 560;

/** Lay concepts out on an ellipse, the most important one in the middle. */
function layout(concepts: Concept[]) {
  const sorted = [...concepts].sort((a, b) => b.importance - a.importance);
  const pos: Record<string, { x: number; y: number }> = {};
  if (!sorted.length) return pos;
  const [hub, ...rest] = sorted;
  pos[hub.id] = { x: W / 2, y: H / 2 };
  rest.forEach((c, i) => {
    const a = (i / rest.length) * Math.PI * 2 - Math.PI / 2;
    pos[c.id] = { x: W / 2 + Math.cos(a) * (W / 2 - 120), y: H / 2 + Math.sin(a) * (H / 2 - 70) };
  });
  return pos;
}

/** #14 Visual Memory: a one-page recap of a deck as a concept map, numbers and takeaways. */
export const MemoryMapPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/presentations/${id}/ai/memory-map`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Couldn't build the recap.");
        return body;
      })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const pos = useMemo(() => layout(data?.concepts || []), [data]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app, #F2F2F3)", color: "var(--ink, #1D1D1F)", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", background: "var(--bg-panel, #fff)", borderBottom: "1px solid var(--line, #D9D9DD)" }}>
        <Link to={`/presentations/${id}`} style={{ color: "var(--signal, #2352F5)", fontSize: 13, textDecoration: "none" }}>Back to the deck</Link>
        <button type="button" onClick={() => window.print()} style={{ border: "1px solid var(--line, #D9D9DD)", background: "var(--bg-panel, #fff)", borderRadius: 4, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
          Print or save as PDF
        </button>
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px" }}>
        {!data && !error && <p style={{ color: "var(--ink-2, #5B5B61)" }}>Building the visual recap…</p>}
        {error && <p role="alert" style={{ color: "var(--danger, #C4262E)" }}>{error}</p>}
        {data && (
          <>
            <div style={{ fontSize: 13, color: "var(--ink-2, #5B5B61)" }}>Visual recap of “{data.deckTitle}”</div>
            <h1 style={{ fontSize: 30, margin: "4px 0 20px", letterSpacing: "-0.01em" }}>{data.title}</h1>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 24, alignItems: "start" }}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Concept map" style={{ width: "100%", background: "var(--bg-panel, #fff)", border: "1px solid var(--line, #D9D9DD)", borderRadius: 8 }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#9CA3AF" />
                  </marker>
                </defs>
                {data.links.map((l, i) => {
                  const a = pos[l.from];
                  const b = pos[l.to];
                  if (!a || !b) return null;
                  const mx = (a.x + b.x) / 2;
                  const my = (a.y + b.y) / 2;
                  return (
                    <g key={i}>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#C4C4CC" strokeWidth={1.5} markerEnd="url(#arrow)" />
                      {l.label && (
                        <text x={mx} y={my - 4} textAnchor="middle" fontSize={12} fill="#75757B" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 4 }}>
                          {l.label}
                        </text>
                      )}
                    </g>
                  );
                })}
                {data.concepts.map((c) => {
                  const p = pos[c.id];
                  if (!p) return null;
                  const r = 26 + c.importance * 10;
                  const fill = c.importance === 3 ? "#2352F5" : c.importance === 2 ? "#F2B5C4" : "#E6E6E8";
                  const ink = c.importance === 3 ? "#FFFFFF" : "#1D1D1F";
                  const words = c.label.split(" ");
                  const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [c.label];
                  return (
                    <g key={c.id}>
                      <circle cx={p.x} cy={p.y} r={r} fill={fill} />
                      {lines.map((ln, i) => (
                        <text key={i} x={p.x} y={p.y + (i - (lines.length - 1) / 2) * 15 + 5} textAnchor="middle" fontSize={13} fontWeight={600} fill={ink}>
                          {ln}
                        </text>
                      ))}
                      {c.slide ? (
                        <text x={p.x} y={p.y + r + 14} textAnchor="middle" fontSize={11} fill="#75757B">slide {c.slide}</text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {data.numbers.length > 0 && (
                  <section>
                    <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Numbers to remember</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {data.numbers.map((n, i) => (
                        <div key={i} style={{ background: "var(--bg-panel, #fff)", border: "1px solid var(--line, #D9D9DD)", borderRadius: 6, padding: "10px 12px" }}>
                          <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{n.value}</div>
                          <div style={{ fontSize: 12, color: "var(--ink-2, #5B5B61)" }}>{n.label}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {data.takeaways.length > 0 && (
                  <section>
                    <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Takeaways</h2>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 14, lineHeight: 1.45 }}>
                      {data.takeaways.map((t, i) => <li key={i}>{t}</li>)}
                    </ol>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default MemoryMapPage;
