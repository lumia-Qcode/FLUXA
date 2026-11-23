import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { SketchfabEmbed, isSketchfabModel } from "../rendering/blocks/SketchfabEmbed";
import { HtmlBlockRenderer } from "../rendering/blocks/HtmlBlockRenderer";
import { ConsentAsker, keywords, slideText, SPEECH_LANGUAGES } from "./speech";
import { describeCommand, parseVoiceCommand, VoiceCommand } from "./voiceCommands";
import { SayHelloSplash } from "./SayHelloSplash";

type Engine = {
  listening: boolean;
  error: string;
  lastHeard: string;
  lang: string;
  setLang: (code: string) => void;
  start: (ask?: ConsentAsker) => Promise<boolean>;
  stop: () => void;
  subscribe: (fn: (e: { text: string; final: boolean; at: number }) => void) => () => void;
  subscribeLevel: (fn: (level: number) => void) => () => void;
};

/** Commands safe to run on an unfinished phrase (so "next slide" reacts instantly). */
const QUICK = new Set(["next", "previous", "close"]);

const VOICE_HELP: [string, string][] = [
  ["“Next slide” / “Go back”", "Move one slide"],
  ["“Go to slide 5” / “Last slide”", "Jump to a slide"],
  ["“I have 5 minutes left”", "Hide slides so the talk fits"],
  ["“Show a 3D model of a heart”", "Open a rotatable 3D model"],
  ["“Demonstrate a loan calculator”", "Build a live demo"],
  ["“Back to the slides”", "Close the model or demo"],
];

/** Five bars that follow the microphone input level, so the presenter can see it hears them. */
const MicLevel: React.FC<{ subscribe: Engine["subscribeLevel"] }> = ({ subscribe }) => {
  const [level, setLevel] = useState(0);
  useEffect(() => subscribe((l) => setLevel((prev) => (Math.abs(prev - l) > 0.04 || l === 0 ? l : prev))), [subscribe]);
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 12 }}>
      {[0.1, 0.25, 0.4, 0.6, 0.8].map((t, i) => (
        <span key={i} style={{ width: 3, height: 4 + i * 2, borderRadius: 1, background: level > t ? "#F7CAD5" : "rgba(255,255,255,0.25)", transition: "background 80ms" }} />
      ))}
    </span>
  );
};

interface Props {
  engine: Engine;
  slides: any[];
  allSlides: any[];
  currentIndex: number;
  presentationId?: number | string;
  onGoTo: (index: number) => void;
  onSkip: (slideIds: string[]) => void;
  /** Live session, when presenting live: enables captions for the audience (#10). */
  live?: { session_id: string; host_token?: string } | null;
}

type Overlay = { kind: "model"; model: any } | { kind: "demo"; title: string; code: any } | null;

const AUTOPILOT_COOLDOWN_MS = 4000;

/**
 * Voice in present mode: commands ("next slide", "go to slide 5", "I have 5 minutes left",
 * "show a 3D model of a heart", "demonstrate a compound interest calculator") and Autopilot (#15),
 * which advances when the speech matches the next slide. Arrow keys always override.
 */
export const PresenterVoice: React.FC<Props> = ({ engine, slides, allSlides, currentIndex, presentationId, onGoTo, onSkip, live }) => {
  const [autopilot, setAutopilot] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [status, setStatus] = useState("");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [heard, setHeard] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [consentAsk, setConsentAsk] = useState<((ok: boolean) => void) | null>(null);
  const quickRef = useRef<string>("");
  const bufferRef = useRef<string[]>([]);
  const lastAdvanceRef = useRef(0);
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  // Distinctive keywords of each slide (minus words the neighbouring slide also uses).
  const slideKeys = useMemo(() => slides.map((s) => new Set(keywords(`${slideText(s).title} ${slideText(s).text}`))), [slides]);

  useEffect(() => {
    bufferRef.current = [];
  }, [currentIndex]);

  const run = async (cmd: VoiceCommand) => {
    setStatus(describeCommand(cmd));
    const i = indexRef.current;
    try {
      if (cmd.type === "next") onGoTo(Math.min(slides.length - 1, i + 1));
      else if (cmd.type === "previous") onGoTo(Math.max(0, i - 1));
      else if (cmd.type === "goto") onGoTo(cmd.slide === -1 ? slides.length - 1 : Math.max(0, Math.min(slides.length - 1, cmd.slide - 1)));
      else if (cmd.type === "close") setOverlay(null);
      else if (cmd.type === "time") {
        const res = await fetch(`/api/presentations/${presentationId}/ai/time-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minutes: cmd.minutes }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't plan the time.");
        const skip = (data.slides || []).filter((s: any) => !s.keep).map((s: any) => s.slideId);
        // Plan slide ids may be "slide-<db id>"; match against the deck's slide ids.
        const ids = allSlides.map((s) => s.id);
        onSkip(skip.filter((id: string) => ids.includes(id)));
        setStatus(`Fits ${cmd.minutes} min: skipping ${skip.length} slide${skip.length === 1 ? "" : "s"}. ${data.bridge || ""}`);
      } else if (cmd.type === "model") {
        const res = await fetch(`/api/ai/models3d/search?q=${encodeURIComponent(cmd.query)}`);
        const data = await res.json().catch(() => ({}));
        const model = (data.models || [])[0];
        if (!isSketchfabModel(model)) throw new Error(`No 3D model found for "${cmd.query}".`);
        setOverlay({ kind: "model", model });
        setStatus(`3D: ${model.name}`);
      } else if (cmd.type === "demo") {
        const res = await fetch(`/api/presentations/${presentationId}/ai/demo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: cmd.request }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't build the demo.");
        setOverlay({ kind: "demo", title: data.title, code: data.code });
        setStatus(`Demo: ${data.title}`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "That didn't work.");
    }
  };

  // Listen: commands on final phrases; Autopilot on the rolling transcript.
  useEffect(() => {
    return engine.subscribe((e) => {
      setHeard(e.text);
      const cmd = parseVoiceCommand(e.text);
      if (!e.final) {
        // Simple navigation reacts on the unfinished phrase; once per phrase.
        if (cmd && QUICK.has(cmd.type) && !quickRef.current) {
          quickRef.current = cmd.type;
          run(cmd);
          bufferRef.current = [];
          return;
        }
      } else {
        const already = quickRef.current;
        quickRef.current = "";
        if (cmd) {
          if (already !== cmd.type) run(cmd);
          bufferRef.current = [];
          return;
        }
        if (already) return;
      }
      if (quickRef.current) return;
      if (!autopilot) return;
      const words = keywords(e.text);
      if (e.final) bufferRef.current = [...bufferRef.current, ...words].slice(-60);
      const heard = new Set([...bufferRef.current, ...(e.final ? [] : words)]);
      const i = indexRef.current;
      if (i >= slides.length - 1 || Date.now() - lastAdvanceRef.current < AUTOPILOT_COOLDOWN_MS) return;
      const next = slideKeys[i + 1];
      const current = slideKeys[i];
      if (!next) return;
      const distinctive = [...next].filter((w) => !current?.has(w));
      const hits = distinctive.filter((w) => heard.has(w)).length;
      const needed = distinctive.length >= 8 ? 3 : 2;
      if (distinctive.length > 0 && hits >= needed) {
        lastAdvanceRef.current = Date.now();
        onGoTo(i + 1);
        setStatus(`Autopilot: moved to slide ${i + 2}`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.subscribe, autopilot, slideKeys, slides.length]);

  // #10: send finished sentences to the live session as captions (kept in memory on the server).
  useEffect(() => {
    if (!captions || !live?.session_id) return;
    return engine.subscribe((e) => {
      if (!e.final || parseVoiceCommand(e.text)) return;
      fetch(`/api/presentations/live/${encodeURIComponent(live.session_id)}/captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: e.text, host_token: live.host_token }),
      }).catch(() => {});
    });
  }, [captions, live?.session_id, live?.host_token, engine.subscribe]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOverlay(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [overlay]);

  // In-page consent prompt: a browser confirm() would drop the presenter out of fullscreen.
  const askConsent: ConsentAsker = () => new Promise<boolean>((resolve) => setConsentAsk(() => resolve));
  const answerConsent = (ok: boolean) => {
    consentAsk?.(ok);
    setConsentAsk(null);
  };

  const toggleMic = async () => {
    if (engine.listening) {
      engine.stop();
      setAutopilot(false);
      setStatus("");
      setHeard("");
    } else {
      setStatus("Starting the microphone…");
      const ok = await engine.start(askConsent);
      setStatus(ok ? "Listening. Try “next slide” or “I have 5 minutes left”." : "");
      if (ok) setHello(true);
    }
  };
  const [hello, setHello] = useState(false);
  const toggleRef = useRef(toggleMic);
  toggleRef.current = toggleMic;

  // "V" turns the microphone on or off (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === "v" || e.key === "V") toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hide the transcript line after a pause in speech.
  useEffect(() => {
    if (!heard) return;
    const t = window.setTimeout(() => setHeard(""), 4000);
    return () => window.clearTimeout(t);
  }, [heard]);

  // Clear the "Listening…" hint after a few seconds so it doesn't cover the slide.
  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(""), 6000);
    return () => window.clearTimeout(t);
  }, [status]);

  const pill = (on: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", cursor: "pointer", fontSize: 12, fontWeight: 600,
    padding: "4px 10px", borderRadius: 999, border: `1px solid ${on ? "#F2B5C4" : "rgba(255,255,255,0.25)"}`,
    background: on ? "rgba(242,181,196,0.22)" : "transparent", color: on ? "#F7CAD5" : "#E2E8F0",
  });

  return (
    <>
      {hello && <SayHelloSplash onDone={() => setHello(false)} />}
      <button type="button" onClick={toggleMic} style={pill(engine.listening)} title="Voice commands and Autopilot (V)" aria-pressed={engine.listening}>
        {engine.listening ? <Mic size={13} /> : <MicOff size={13} />}
        {engine.listening ? "Listening" : "Voice"}
        {engine.listening && <MicLevel subscribe={engine.subscribeLevel} />}
      </button>
      <select
        aria-label="Spoken language"
        value={engine.lang}
        onChange={(e) => engine.setLang(e.target.value)}
        title="The language you will speak in. Voice commands are in English."
        style={{ background: "transparent", color: "#E2E8F0", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 999, fontSize: 12, padding: "3px 6px", cursor: "pointer" }}
      >
        {SPEECH_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} style={{ color: "#111" }}>{l.label}</option>
        ))}
      </select>
      <button type="button" onClick={() => setShowHelp((v) => !v)} style={pill(showHelp)} aria-pressed={showHelp} aria-label="Voice commands" title="What you can say">
        ?
      </button>
      {engine.listening && (
        <button type="button" onClick={() => setAutopilot((v) => !v)} style={pill(autopilot)} aria-pressed={autopilot}
          title="Advance automatically when your speech reaches the next slide">
          Autopilot {autopilot ? "on" : "off"}
        </button>
      )}
      {engine.listening && live?.session_id && (
        <button type="button" onClick={() => setCaptions((v) => !v)} style={pill(captions)} aria-pressed={captions}
          title="Send live captions to the audience, who can pick a language for translated subtitles">
          Captions {captions ? "on" : "off"}
        </button>
      )}

      {showHelp && (
        <div role="dialog" aria-label="Voice commands"
          style={{ position: "fixed", right: 24, bottom: 76, zIndex: 10004, width: 340, background: "rgba(10,10,12,0.94)", color: "#F1F5F9", borderRadius: 12, padding: "12px 14px", fontSize: 13, lineHeight: 1.4, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>What you can say</div>
          {VOICE_HELP.map(([say, does]) => (
            <div key={say} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
              <span>{say}</span>
              <span style={{ color: "#94A3B8", textAlign: "right" }}>{does}</span>
            </div>
          ))}
          <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 8 }}>
            Autopilot moves on when you start talking about the next slide. Arrow keys always work. Press V to turn the microphone on or off. Needs Chrome or Edge and an internet connection.
          </div>
        </div>
      )}

      {consentAsk && (
        <div role="dialog" aria-modal="true" aria-label="Turn on the microphone"
          style={{ position: "fixed", inset: 0, zIndex: 10005, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 440, background: "#FFFFFF", color: "#1D1D1F", borderRadius: 12, padding: 20, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14, lineHeight: 1.5 }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Turn on the microphone?</div>
            <p style={{ margin: "0 0 8px" }}>
              While it is on, your speech is turned into text to follow your talk, run voice commands, and (if you switch them on) show captions to your audience.
            </p>
            <p style={{ margin: "0 0 16px", color: "#5B5B61", fontSize: 13 }}>
              In Chrome and Edge the audio goes to the browser's speech service. Nothing is recorded or kept. You can turn it off at any time with V.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => answerConsent(false)}
                style={{ border: "1px solid #D9D9DD", background: "#FFFFFF", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>Not now</button>
              <button type="button" autoFocus onClick={() => answerConsent(true)}
                style={{ border: 0, background: "#F2B5C4", color: "#1D1D1F", fontWeight: 600, borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>Turn on</button>
            </div>
          </div>
        </div>
      )}

      {(status || engine.error || (engine.listening && heard)) && (
        <div
          role="status"
          style={{
            position: "fixed", left: "50%", bottom: 76, transform: "translateX(-50%)", zIndex: 10003, maxWidth: "70vw",
            background: "rgba(10,10,12,0.85)", color: "#F1F5F9", borderRadius: 10, padding: "6px 12px", fontSize: 13, lineHeight: 1.4,
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif", pointerEvents: "none",
          }}
        >
          {engine.error || status}
          {engine.listening && heard && <div style={{ color: "#94A3B8", fontSize: 12 }}>Heard: “{heard.slice(-120)}”</div>}
        </div>
      )}

      {overlay && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(2,6,23,0.92)", display: "flex", flexDirection: "column", padding: "28px 40px 96px", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#F1F5F9", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{overlay.kind === "model" ? overlay.model.name : overlay.title}</div>
            <button type="button" onClick={() => setOverlay(null)} aria-label="Back to the slides"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", color: "#fff", border: 0, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>
              <X size={14} /> Back to the slides (Esc)
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, borderRadius: 14, overflow: "hidden", background: overlay.kind === "demo" ? "#FFFFFF" : undefined }}>
            {overlay.kind === "model" ? (
              <SketchfabEmbed model={overlay.model} interactive radius={14} />
            ) : (
              <HtmlBlockRenderer block={{ id: "voice-demo", type: "html", x: 0, y: 0, w: 1, h: 1, code: overlay.code } as any} interactive />
            )}
          </div>
        </div>
      )}
    </>
  );
};
