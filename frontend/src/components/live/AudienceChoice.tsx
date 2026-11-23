import React, { useMemo, useState } from "react";
import { LivePoll, closeLivePoll, createLivePoll } from "./liveApi";

interface Props {
  slides: any[];
  currentIndex: number;
  sessionId: string;
  activePoll: LivePoll | null;
  onPollCreated: (poll: LivePoll) => void;
  onPollClosed: () => void;
  onGoTo: (index: number) => void;
}

const slideTitle = (s: any, i: number) => {
  const t = (s?.blocks || []).find((b: any) => b.role === "title");
  const text = t?.content || t?.text || (t?.doc ? JSON.stringify(t.doc).match(/"text":"([^"]+)"/)?.[1] : "") || `Slide ${i + 1}`;
  return String(text).slice(0, 60);
};

/**
 * #3 Audience-Controlled: the audience votes on what to cover next from the remaining slides;
 * the presenter jumps to the winner. Ordering is deterministic (no AI).
 */
export const AudienceChoice: React.FC<Props> = ({ slides, currentIndex, sessionId, activePoll, onPollCreated, onPollClosed, onGoTo }) => {
  const [mapping, setMapping] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const remaining = useMemo(
    () => slides.map((s, i) => ({ i, title: slideTitle(s, i) })).filter((x) => x.i > currentIndex).slice(0, 4),
    [slides, currentIndex]
  );
  const ours = activePoll && mapping && activePoll.question === "What should we cover next?";

  const start = async () => {
    setError("");
    if (remaining.length < 2) {
      setError("Need at least 2 slides left to choose from.");
      return;
    }
    try {
      const poll = await createLivePoll(sessionId, currentIndex, "What should we cover next?", remaining.map((r) => r.title));
      setMapping(remaining.map((r) => r.i));
      onPollCreated(poll);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the vote.");
    }
  };

  const goToWinner = async () => {
    if (!activePoll || !mapping) return;
    const best = [...activePoll.options].sort((a, b) => b.votes - a.votes)[0];
    await closeLivePoll(activePoll.id).catch(() => {});
    onPollClosed();
    if (best && mapping[best.index] !== undefined) onGoTo(mapping[best.index]);
    setMapping(null);
  };

  const pill: React.CSSProperties = {
    background: "rgba(242, 181, 196, 0.18)", border: "1px solid rgba(242, 181, 196, 0.5)", color: "#F7CAD5",
    cursor: "pointer", fontSize: 12, padding: "4px 10px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap",
  };

  if (ours && activePoll) {
    const total = activePoll.total_votes || 0;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#E2E8F0", whiteSpace: "nowrap" }}>
          {total} vote{total === 1 ? "" : "s"}
          {activePoll.options.length > 0 && total > 0 && `: ${[...activePoll.options].sort((a, b) => b.votes - a.votes)[0].text} leads`}
        </span>
        <button type="button" onClick={goToWinner} style={pill}>Go to the winner</button>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" onClick={start} style={pill} title="The audience votes on which slide to cover next">
        Let the audience choose
      </button>
      {error && <span role="alert" style={{ fontSize: 11, color: "#FCA5A5" }}>{error}</span>}
    </span>
  );
};
