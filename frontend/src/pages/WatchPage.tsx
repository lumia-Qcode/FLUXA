import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SlideStage } from "../rendering/SlideStage";
import { resolveDeckTheme } from "../rendering/themes";

interface Narration { slide: number; title: string; script: string }

const sentences = (text: string) => (text.match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * #6 Slide-to-Video (browser version): narrated playback (the browser voice reads an AI-written
 * script and the slides advance) and a downloadable captioned video. Browsers can't record their
 * own speech, so the downloaded video is silent with the narration burned in as subtitles.
 */
export const WatchPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [deck, setDeck] = useState<any>(null);
  const [script, setScript] = useState<Narration[] | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const playToken = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/presentations/${id}`).then((r) => r.json()),
      fetch(`/api/presentations/${id}/ai/narration`).then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Couldn't write the narration.");
        return body;
      }),
    ])
      .then(([d, n]) => {
        if (!alive) return;
        setDeck(d.presentation);
        setScript(n.slides || []);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis?.getVoices() || [];
      setVoices(v);
      if (!voiceName) setVoiceName((v.find((x) => /en[-_](US|GB)/i.test(x.lang) && /natural|online|google/i.test(x.name)) || v.find((x) => x.lang.startsWith("en")))?.name || "");
    };
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, [voiceName]);

  const slides = deck?.slides || [];
  const theme = useMemo(() => resolveDeckTheme(deck?.theme?.themeId, deck?.brand, deck?.theme?.fontPairing), [deck]);

  const speak = (text: string, token: number) =>
    new Promise<void>((resolve) => {
      if (token !== playToken.current || !window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = voices.find((x) => x.name === voiceName);
      if (v) u.voice = v;
      u.rate = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });

  const play = useCallback(async (from: number) => {
    if (!script) return;
    const token = ++playToken.current;
    window.speechSynthesis?.cancel();
    setPlaying(true);
    for (let i = from; i < slides.length; i++) {
      if (token !== playToken.current) return;
      setIndex(i);
      for (const s of sentences(script[i]?.script || "")) {
        if (token !== playToken.current) return;
        setCaption(s);
        await speak(s, token);
      }
      await wait(600);
    }
    if (token === playToken.current) {
      setPlaying(false);
      setCaption("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, slides.length, voiceName, voices]);

  const pause = () => {
    playToken.current++;
    window.speechSynthesis?.cancel();
    setPlaying(false);
  };

  const recordVideo = async () => {
    if (!script || !slides.length) return;
    pause();
    const { toCanvas } = await import("html-to-image");
    const W = 1280;
    const H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const stream = (canvas as any).captureStream(30) as MediaStream;
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m));
    if (!mime) {
      setError("This browser can't record video. Use Chrome or Edge.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start(500);
    try {
      for (let i = 0; i < slides.length; i++) {
        setRecording(`Recording slide ${i + 1} of ${slides.length}…`);
        setIndex(i);
        setCaption("");
        await wait(900);
        const el = stageRef.current?.querySelector(".slide-stage-canvas") as HTMLElement | null;
        let frame: HTMLCanvasElement | null = null;
        if (el) {
          try {
            frame = await toCanvas(el, { width: 1920, height: 1080, style: { transform: "none" }, pixelRatio: W / 1920, cacheBust: true });
          } catch {
            frame = null;
          }
        }
        const parts = sentences(script[i]?.script || "");
        for (const part of parts) {
          const seconds = Math.min(9, Math.max(2.5, part.split(/\s+/).length / 2.6));
          const end = performance.now() + seconds * 1000;
          while (performance.now() < end) {
            ctx.fillStyle = "#0B1120";
            ctx.fillRect(0, 0, W, H);
            if (frame) ctx.drawImage(frame, 0, 0, W, H);
            ctx.font = "600 30px 'IBM Plex Sans', system-ui, sans-serif";
            const lines = wrap(ctx, part, W - 160).slice(0, 3);
            const boxH = lines.length * 40 + 24;
            ctx.fillStyle = "rgba(0,0,0,0.72)";
            ctx.fillRect(60, H - boxH - 30, W - 120, boxH);
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            lines.forEach((ln, k) => ctx.fillText(ln, W / 2, H - boxH - 30 + 42 + k * 40));
            ctx.textAlign = "start";
            await new Promise((r) => requestAnimationFrame(() => r(null)));
          }
        }
      }
    } finally {
      rec.stop();
      await done;
      setRecording("");
    }
    const blob = new Blob(chunks, { type: "video/webm" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(deck?.title || "presentation").slice(0, 60).replace(/[^\w-]+/g, "-")}-narrated.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  useEffect(() => () => {
    playToken.current++;
    window.speechSynthesis?.cancel();
  }, []);

  const btn: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 999, padding: "6px 14px", fontSize: 13, cursor: "pointer" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", color: "#fff", display: "flex", flexDirection: "column", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", gap: 12 }}>
        <Link to={`/presentations/${id}`} style={{ color: "#CBD5E1", fontSize: 13, textDecoration: "none" }}>Back to the deck</Link>
        <div style={{ fontSize: 13, color: "#94A3B8" }}>Narrated playback{deck ? `: ${deck.title}` : ""}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {voices.length > 0 && (
            <select aria-label="Narrator voice" value={voiceName} onChange={(e) => setVoiceName(e.target.value)}
              style={{ background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6, fontSize: 12, padding: "4px 6px", maxWidth: 200 }}>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          )}
        </div>
      </header>

      <div ref={stageRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {error && <p role="alert" style={{ color: "#FCA5A5", padding: 24 }}>{error}</p>}
        {!error && (!deck || !script) && <p style={{ color: "#94A3B8", padding: 24 }}>Writing the narration…</p>}
        {deck && slides[index] && <SlideStage slide={slides[index]} theme={theme} datasets={deck.datasets} mode="present" />}
        {caption && (
          <div aria-live="polite" style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", width: "min(1000px, calc(100% - 32px))", textAlign: "center", pointerEvents: "none" }}>
            <span style={{ display: "inline-block", background: "rgba(0,0,0,0.75)", padding: "8px 16px", borderRadius: 8, fontSize: 22, lineHeight: 1.45 }}>{caption}</span>
          </div>
        )}
      </div>

      <footer style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "12px 18px" }}>
        <button type="button" style={btn} disabled={!script || !!recording} onClick={() => (playing ? pause() : play(index))}>
          {playing ? "Pause" : index > 0 ? "Resume" : "Play narration"}
        </button>
        <button type="button" style={btn} disabled={!script || !!recording} onClick={() => { pause(); setIndex((i) => Math.max(0, i - 1)); }}>Previous</button>
        <span style={{ fontSize: 13, color: "#94A3B8", minWidth: 60, textAlign: "center" }}>{slides.length ? `${index + 1} / ${slides.length}` : ""}</span>
        <button type="button" style={btn} disabled={!script || !!recording} onClick={() => { pause(); setIndex((i) => Math.min(slides.length - 1, i + 1)); }}>Next</button>
        <button type="button" style={{ ...btn, background: "#F2B5C4", color: "#1D1D1F", border: 0, fontWeight: 600 }} disabled={!script || !!recording} onClick={recordVideo}
          title="Downloads a captioned WebM video. Browsers can't record their own voice, so the video is silent with subtitles.">
          {recording || "Download captioned video"}
        </button>
      </footer>
    </div>
  );
};

export default WatchPage;
