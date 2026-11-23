import React, { useState } from "react";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { useDocument } from "../store/DocumentContext";
import { NumberField } from "../../ui/NumberField";

type Mode = "audience" | "debate" | "time";

interface TimePlan {
  minutes: number; totalMinutes: number; summary: string; bridge: string;
  slides: { slide: number; slideId: string; title: string; keep: boolean; minutes: number; note: string }[];
}

interface Question { question: string; slide?: number | null; slideId?: string | null; why?: string }
interface PersonaResult {
  persona: string;
  questions: Question[];
  confusingSlides: { slide?: number; slideId?: string | null; reason: string }[];
  weakArguments: { slide?: number; slideId?: string | null; argument: string; howToStrengthen: string }[];
}
interface Challenge {
  slide?: number; slideId?: string | null; claim: string; challenge: string; counter: string;
  evidenceNeeded: string; severity: "high" | "medium" | "low";
}

const DEFAULT_PERSONAS = ["Skeptical CFO", "Domain expert", "First-time listener"];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--ink-2)", margin: "4px 0" };
const card: React.CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", background: "var(--bg-panel)",
  display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--ink)",
};
const muted: React.CSSProperties = { fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45 };
const severityColor = { high: "var(--danger, #C4262E)", medium: "var(--warn, #9A5B00)", low: "var(--ink-2)" } as const;

/** #1 Audience Twin and #4 Debate Mode: rehearse the deck against simulated audiences. */
export const RehearseInspector: React.FC = () => {
  const { doc, setSelectedSlideId, execute } = useDocument();
  const [minutes, setMinutes] = useState<number>(5);
  const [timePlan, setTimePlan] = useState<TimePlan | null>(null);
  const [mode, setMode] = useState<Mode>("audience");
  const [personas, setPersonas] = useState<string[]>(DEFAULT_PERSONAS);
  const [newPersona, setNewPersona] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audience, setAudience] = useState<PersonaResult[] | null>(null);
  const [debate, setDebate] = useState<{ verdict: string; challenges: Challenge[] } | null>(null);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "audience") {
        const data = await post(`/api/presentations/${doc.id}/ai/rehearse`, { personas });
        setAudience(data.personas || []);
      } else if (mode === "time") {
        const data = await post(`/api/presentations/${doc.id}/ai/time-plan`, { minutes });
        setTimePlan(data);
      } else {
        const data = await post(`/api/presentations/${doc.id}/ai/stress-test`, {});
        setDebate({ verdict: data.verdict || "", challenges: data.challenges || [] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const SlideLink: React.FC<{ n?: number | null; id?: string | null }> = ({ n, id }) =>
    n && id ? (
      <button
        type="button"
        onClick={() => setSelectedSlideId(id)}
        style={{ border: 0, background: "none", padding: 0, color: "var(--signal)", fontSize: 12, cursor: "pointer", alignSelf: "flex-start" }}
      >
        Slide {n}
      </button>
    ) : null;

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div role="tablist" aria-label="Rehearsal mode" style={{ display: "flex", gap: 4, background: "var(--bg-well)", padding: 3, borderRadius: 6 }}>
        {(["audience", "debate", "time"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, border: 0, borderRadius: 4, padding: "6px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: mode === m ? "var(--bg-panel)" : "transparent", color: mode === m ? "var(--ink)" : "var(--ink-2)",
            }}
          >
            {m === "audience" ? "Audience" : m === "debate" ? "Stress test" : "Time Machine"}
          </button>
        ))}
      </div>

      {mode === "audience" ? (
        <>
          <div style={muted}>Simulated audience members read the deck and ask what they would really ask.</div>
          <div style={label}>Audience</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {personas.map((p) => (
              <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--line)", borderRadius: 999, padding: "3px 8px", fontSize: 12, color: "var(--ink)" }}>
                {p}
                <button type="button" aria-label={`Remove ${p}`} onClick={() => setPersonas(personas.filter((x) => x !== p))}
                  style={{ border: 0, background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 0, fontSize: 13 }}>×</button>
              </span>
            ))}
          </div>
          {personas.length < 4 && (
            <Field
              placeholder="Add someone, e.g. Hospital board member"
              value={newPersona}
              onChange={(e) => setNewPersona(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPersona.trim()) {
                  e.preventDefault();
                  setPersonas([...personas, newPersona.trim().slice(0, 60)]);
                  setNewPersona("");
                }
              }}
            />
          )}
        </>
      ) : mode === "time" ? (
        <>
          <div style={muted}>Short on time? Get a plan for which slides to keep. Skipped slides are only hidden for the talk, never deleted.</div>
          <NumberField label="I have this many minutes" value={minutes} min={1} max={240} onChange={(v) => setMinutes(Number(v) || 1)} />
        </>
      ) : (
        <div style={muted}>A hostile panel looks for the claims most likely to be attacked, with counters and the evidence that would settle them.</div>
      )}

      <a
        href={`/map/${doc.id}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 12, color: "var(--signal)", alignSelf: "flex-end" }}
      >
        Open visual recap of the deck
      </a>
      <a href={`/watch/${doc.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--signal)", alignSelf: "flex-end" }}>
        Narrated playback and video
      </a>

      <Button variant="primary" onClick={run} disabled={busy || (mode === "audience" && personas.length === 0)}>
        {busy ? "Thinking…" : mode === "audience" ? "Rehearse with this audience" : mode === "time" ? `Plan a ${minutes}-minute talk` : "Stress-test the deck"}
      </Button>
      {error && <div role="alert" style={{ ...muted, color: "var(--danger, #C4262E)" }}>{error}</div>}

      {mode === "audience" && audience && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {audience.map((p) => (
            <div key={p.persona} style={card}>
              <div style={{ fontWeight: 600 }}>{p.persona}</div>
              {p.questions.map((q, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div>{q.question}</div>
                  {q.why && <div style={muted}>{q.why}</div>}
                  <SlideLink n={q.slide} id={q.slideId} />
                </div>
              ))}
              {p.confusingSlides.length > 0 && <div style={label}>Might confuse them</div>}
              {p.confusingSlides.map((c, i) => (
                <div key={`c${i}`} style={muted}>
                  <SlideLink n={c.slide} id={c.slideId} /> {c.reason}
                </div>
              ))}
              {p.weakArguments.length > 0 && <div style={label}>Weak spots</div>}
              {p.weakArguments.map((w, i) => (
                <div key={`w${i}`} style={muted}>
                  <SlideLink n={w.slide} id={w.slideId} /> {w.argument} <em>Fix: {w.howToStrengthen}</em>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {mode === "time" && timePlan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...card, background: "var(--signal-weak)" }}>
            <div>{timePlan.summary}</div>
            <div style={muted}>
              Keeps {timePlan.slides.filter((s) => s.keep).length} of {timePlan.slides.length} slides, about {timePlan.totalMinutes} of {timePlan.minutes} min.
            </div>
          </div>
          {timePlan.slides.map((s) => (
            <div key={s.slideId} style={{ ...card, opacity: s.keep ? 1 : 0.6, padding: "8px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <button type="button" onClick={() => setSelectedSlideId(s.slideId)}
                  style={{ border: 0, background: "none", padding: 0, color: "var(--signal)", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
                  {s.slide}. {s.title}
                </button>
                <span style={{ fontSize: 12, whiteSpace: "nowrap", color: s.keep ? "var(--ink)" : "var(--ink-3)" }}>
                  {s.keep ? `${s.minutes} min` : "Skip"}
                </span>
              </div>
              {s.note && <div style={muted}>{s.note}</div>}
            </div>
          ))}
          {timePlan.bridge && <div style={muted}><strong>Bridge line:</strong> {timePlan.bridge}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="primary"
              onClick={() =>
                execute("Time Machine: hide skipped slides", (draft) => {
                  const keep = new Map(timePlan.slides.map((s) => [s.slideId, s.keep]));
                  draft.slides.forEach((sl) => {
                    if (keep.has(sl.id)) sl.hidden = !keep.get(sl.id);
                  });
                })
              }
            >
              Hide skipped slides
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                execute("Show all slides", (draft) => {
                  draft.slides.forEach((sl) => {
                    sl.hidden = false;
                  });
                })
              }
            >
              Show all slides again
            </Button>
          </div>
        </div>
      )}

      {mode === "debate" && debate && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {debate.verdict && <div style={{ ...card, background: "var(--signal-weak)" }}>{debate.verdict}</div>}
          {debate.challenges.map((c, i) => (
            <div key={i} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <SlideLink n={c.slide} id={c.slideId} />
                <span style={{ fontSize: 11, fontWeight: 600, color: severityColor[c.severity] }}>
                  {c.severity === "high" ? "High risk" : c.severity === "medium" ? "Medium risk" : "Low risk"}
                </span>
              </div>
              <div style={{ fontWeight: 600 }}>“{c.claim}”</div>
              <div><strong>Challenge:</strong> {c.challenge}</div>
              <div><strong>Your counter:</strong> {c.counter}</div>
              <div style={muted}><strong>Evidence to bring:</strong> {c.evidenceNeeded}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RehearseInspector;
