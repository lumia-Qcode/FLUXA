import React, { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";

interface Answer { question: string; answer: string; slides: number[]; covered: boolean }

interface Props {
  shareId: string;
  participantId?: string;
  onGoToSlide: (index: number) => void;
}

/** #7 Ask Anything: audience questions answered from the deck, with slide references. */
export const AskAnythingPanel: React.FC<Props> = ({ shareId, participantId, onGoToSlide }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);

  const ask = async () => {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/presentations/share/${encodeURIComponent(shareId)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, participant_id: participantId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't answer right now.");
      setAnswers((prev) => [data as Answer, ...prev].slice(0, 10));
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't answer right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="ask-anything-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "absolute", left: 20, bottom: 20, zIndex: 9990, display: "flex", alignItems: "center", gap: 6,
          background: "#F2B5C4", color: "#1D1D1F", border: 0, borderRadius: 999, padding: "8px 14px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        <MessageCircleQuestion size={15} />
        Ask about this deck
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Ask about this deck"
          style={{
            position: "absolute", left: 20, bottom: 64, zIndex: 9990, width: 360, maxWidth: "calc(100vw - 32px)",
            maxHeight: "60vh", overflowY: "auto", background: "#FFFFFF", color: "#1D1D1F", borderRadius: 14,
            border: "1px solid #E6E6E8", padding: 14, display: "flex", flexDirection: "column", gap: 10,
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 12, color: "#5B5B61" }}>Answers come only from this presentation, with the slides they use.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={question}
              autoFocus
              maxLength={300}
              placeholder="e.g. What does the 58% refer to?"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ask();
                }
              }}
              style={{ flex: 1, border: "1px solid #D9D9DD", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
            <button
              type="button"
              onClick={ask}
              disabled={busy || question.trim().length < 3}
              style={{ border: 0, borderRadius: 8, background: "#F2B5C4", padding: "0 12px", fontWeight: 600, cursor: "pointer" }}
            >
              {busy ? "…" : "Ask"}
            </button>
          </div>
          {error && <div role="alert" style={{ fontSize: 12, color: "#C4262E" }}>{error}</div>}
          {answers.map((a, i) => (
            <div key={i} style={{ borderTop: "1px solid #E6E6E8", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#5B5B61" }}>{a.question}</div>
              <div style={{ fontSize: 14, lineHeight: 1.45 }}>{a.answer}</div>
              {a.slides.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {a.slides.map((n) => (
                    <button key={n} type="button" onClick={() => onGoToSlide(n - 1)}
                      style={{ border: "1px solid #D9D9DD", background: "#FFFFFF", borderRadius: 999, padding: "2px 8px", fontSize: 12, color: "#B4456C", cursor: "pointer" }}>
                      Slide {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
