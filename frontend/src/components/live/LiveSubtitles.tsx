import React, { useEffect, useRef, useState } from "react";
import { Captions } from "lucide-react";

const LANGS: { code: string; label: string; speech: string; rtl?: boolean }[] = [
  { code: "", label: "Subtitles off", speech: "" },
  { code: "en", label: "English (original)", speech: "en-US" },
  { code: "ur", label: "اردو Urdu", speech: "ur-PK", rtl: true },
  { code: "ar", label: "العربية Arabic", speech: "ar-SA", rtl: true },
  { code: "hi", label: "हिन्दी Hindi", speech: "hi-IN" },
  { code: "es", label: "Español", speech: "es-ES" },
  { code: "fr", label: "Français", speech: "fr-FR" },
  { code: "de", label: "Deutsch", speech: "de-DE" },
  { code: "zh", label: "中文", speech: "zh-CN" },
  { code: "tr", label: "Türkçe", speech: "tr-TR" },
];

interface Line { seq: number; text: string | null; original: string; translated: boolean }

/**
 * #10 Live translation for the audience: the presenter's captions in the chosen language,
 * optionally read aloud by the browser's voice. Right-to-left scripts are laid out correctly.
 */
export const LiveSubtitles: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [lang, setLang] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [speak, setSpeak] = useState(false);
  const afterRef = useRef(0);
  const spokenRef = useRef<Set<number>>(new Set());
  const meta = LANGS.find((l) => l.code === lang);

  useEffect(() => {
    setLines([]);
    afterRef.current = 0;
    if (!lang) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/presentations/live/${encodeURIComponent(sessionId)}/captions?after=${afterRef.current}&lang=${lang}`);
        const data = await res.json();
        if (!alive || !res.ok) return;
        const incoming: Line[] = data.captions || [];
        if (incoming.length) {
          setLines((prev) => {
            const map = new Map(prev.map((l) => [l.seq, l]));
            incoming.forEach((l) => map.set(l.seq, l));
            return [...map.values()].sort((a, b) => a.seq - b.seq).slice(-6);
          });
          // Next poll starts before the first line still waiting for its translation.
          const pending = incoming.filter((l) => lang !== "en" && !l.translated).map((l) => l.seq);
          afterRef.current = pending.length ? Math.min(...pending) - 1 : Math.max(...incoming.map((l) => l.seq));
        }
      } catch {
        /* keep polling */
      }
    };
    tick();
    const t = window.setInterval(tick, 1500);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [lang, sessionId]);

  // Read new translated lines aloud in the chosen language.
  useEffect(() => {
    if (!speak || !meta?.speech || typeof window.speechSynthesis === "undefined") return;
    lines.forEach((l) => {
      const text = lang === "en" ? l.original : l.text;
      if (text && !spokenRef.current.has(l.seq)) {
        spokenRef.current.add(l.seq);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = meta.speech;
        window.speechSynthesis.speak(u);
      }
    });
  }, [lines, speak, meta, lang]);

  const shown = lines.slice(-2);

  return (
    <>
      <div style={{ position: "absolute", right: 20, top: 16, zIndex: 9985, display: "flex", gap: 6, alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(18,20,28,0.88)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
          <Captions size={14} aria-hidden="true" />
          <select
            aria-label="Subtitles language"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            style={{ background: "transparent", color: "#fff", border: 0, fontSize: 12, outline: "none" }}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code} style={{ color: "#111" }}>{l.label}</option>
            ))}
          </select>
        </label>
        {lang && (
          <button type="button" onClick={() => { setSpeak((v) => !v); window.speechSynthesis?.cancel(); }} aria-pressed={speak}
            style={{ background: speak ? "#F2B5C4" : "rgba(18,20,28,0.88)", color: speak ? "#1D1D1F" : "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
            {speak ? "Voice on" : "Read aloud"}
          </button>
        )}
      </div>
      {lang && (
        <div
          aria-live="polite"
          dir={meta?.rtl ? "rtl" : "ltr"}
          lang={lang}
          style={{
            position: "absolute", left: "50%", bottom: 76, transform: "translateX(-50%)", zIndex: 9984, width: "min(900px, calc(100vw - 32px))",
            textAlign: "center", fontFamily: meta?.rtl ? "'Noto Naskh Arabic', 'Noto Nastaliq Urdu', serif" : "'IBM Plex Sans', system-ui, sans-serif",
            pointerEvents: "none",
          }}
        >
          {shown.length === 0 ? (
            <span style={{ background: "rgba(0,0,0,0.6)", color: "#CBD5E1", padding: "4px 10px", borderRadius: 6, fontSize: 13 }}>
              Waiting for the presenter to speak…
            </span>
          ) : (
            shown.map((l) => (
              <div key={l.seq} style={{ display: "block", width: "fit-content", margin: "4px auto", background: "rgba(0,0,0,0.72)", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: meta?.rtl ? 24 : 20, lineHeight: 1.5 }}>
                {lang === "en" ? l.original : l.text || <span style={{ opacity: 0.6 }}>{l.original}</span>}
              </div>
            ))
          )}
          {lang !== "en" && shown.length > 0 && (
            <div style={{ fontSize: 11, color: "#CBD5E1", marginTop: 2 }}>Machine-translated</div>
          )}
        </div>
      )}
    </>
  );
};
