/**
 * Presenter speech engine (browser Web Speech API) shared by voice commands (#2/#8 in present
 * mode), Autopilot (#15) and live captions (#10). No server speech dependencies.
 *
 * Privacy: in Chrome, recognition audio is processed by Google's speech service. Listening only
 * starts after the presenter's microphone consent (F15 purpose `mic_capture`), and a visible
 * indicator is shown while it runs.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechEvent {
  text: string;
  final: boolean;
  at: number;
}

type Listener = (e: SpeechEvent) => void;

export function speechSupported(): boolean {
  const w = window as any;
  return typeof window !== "undefined" && !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Asks the presenter to agree to microphone use. Present mode passes an in-page dialog. */
export type ConsentAsker = () => Promise<boolean>;

const confirmAsker: ConsentAsker = async () =>
  window.confirm(
    "Turn on the microphone for voice features?\n\n" +
      "While it is on, your speech is turned into text to follow your talk (and for captions if you share them). " +
      "In Chrome, the audio is processed by Google's speech service. Nothing is recorded or kept unless you choose to store transcripts. " +
      "You can turn it off at any time."
  );

/** Ask the server whether the presenter has an active microphone consent; record one if they agree. */
export async function ensureMicConsent(ask: ConsentAsker = confirmAsker): Promise<boolean> {
  try {
    const res = await fetch("/api/privacy/consents");
    if (res.ok) {
      const data = await res.json();
      if ((data.consents || []).some((c: any) => c.purpose === "mic_capture" && c.active)) return true;
    }
  } catch {
    /* fall through to asking */
  }
  if (!(await ask())) return false;
  await fetch("/api/privacy/consents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "mic_capture", confirm: true }),
  }).catch(() => {});
  return true;
}

/** Spoken languages offered in present mode. Voice commands are English; Autopilot and captions work in any. */
export const SPEECH_LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-PK", label: "English (Pakistan)" },
  { code: "ur-PK", label: "Urdu" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ar-SA", label: "Arabic" },
];

const LANG_KEY = "fluxa.voiceLang";

/** Plain-language message for a getUserMedia failure, or "" when it shouldn't block. */
export function micErrorMessage(err: any): string {
  const name = err?.name || "";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError")
    return "No microphone found. Plug one in (or check Windows sound settings) and try again.";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return "Microphone access is blocked. Click the icon at the left of the address bar, allow the microphone, then try again.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "Another app (Zoom, Teams, …) is using the microphone. Close it and try again.";
  return "";
}

/** Plain-language message for a SpeechRecognition error, and whether listening must stop. */
export function recognitionErrorMessage(code: string): { message: string; fatal: boolean } | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return { message: "Microphone access was blocked. Allow it in the browser to use voice features.", fatal: true };
    case "audio-capture":
      return { message: "No microphone found. Plug one in and try again.", fatal: true };
    case "network":
      return { message: "Speech recognition needs the internet (the browser's speech service). Retrying…", fatal: false };
    case "language-not-supported":
      return { message: "This browser can't recognise that language. Pick another one.", fatal: true };
    default:
      return null; // "no-speech", "aborted": normal pauses, keep going
  }
}

/**
 * Continuous recognition that restarts itself (browsers stop after silence), with any number
 * of subscribers, a microphone level meter, and clear error messages.
 */
export function useSpeechEngine(initialLang = "en-US") {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [lastHeard, setLastHeard] = useState("");
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) || initialLang;
    } catch {
      return initialLang;
    }
  });
  const recRef = useRef<any>(null);
  const wantRef = useRef(false);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const levelListenersRef = useRef<Set<(level: number) => void>>(new Set());
  const meterRef = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const failuresRef = useRef(0);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  /** Microphone input level, 0 to 1, about 15 times a second while listening. */
  const subscribeLevel = useCallback((fn: (level: number) => void) => {
    levelListenersRef.current.add(fn);
    return () => {
      levelListenersRef.current.delete(fn);
    };
  }, []);

  const stopMeter = useCallback(() => {
    const m = meterRef.current;
    meterRef.current = null;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close().catch(() => {});
    levelListenersRef.current.forEach((fn) => fn(0));
  }, []);

  /** Opens the microphone for the level meter. Returns an error message, or "" if usable. */
  const startMeter = useCallback(async (): Promise<string> => {
    if (meterRef.current || !navigator.mediaDevices?.getUserMedia) return "";
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      return micErrorMessage(err);
    }
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (now: number) => {
        const m = meterRef.current;
        if (!m) return;
        if (now - last > 66) {
          last = now;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
          levelListenersRef.current.forEach((fn) => fn(level));
        }
        m.raf = requestAnimationFrame(tick);
      };
      meterRef.current = { stream, ctx, raf: 0 };
      meterRef.current.raf = requestAnimationFrame(tick);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
    }
    return "";
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    stopMeter();
    setListening(false);
  }, [stopMeter]);

  const start = useCallback(
    async (ask?: ConsentAsker, langOverride?: string) => {
      setError("");
      if (!speechSupported()) {
        setError("Voice features need Chrome or Edge.");
        return false;
      }
      if (!(await ensureMicConsent(ask))) return false;
      const micProblem = await startMeter();
      if (micProblem) {
        setError(micProblem);
        return false;
      }
      const w = window as any;
      const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
      const rec = new Rec();
      rec.lang = langOverride || lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (ev: any) => {
        if (recRef.current !== rec) return;
        failuresRef.current = 0;
        setError((e) => (e.startsWith("Speech recognition needs") ? "" : e));
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const text = String(r[0]?.transcript || "").trim();
          if (!text) continue;
          const e = { text, final: !!r.isFinal, at: Date.now() };
          if (e.final) setLastHeard(text);
          listenersRef.current.forEach((fn) => fn(e));
        }
      };
      rec.onerror = (ev: any) => {
        if (recRef.current !== rec) return;
        const info = recognitionErrorMessage(ev.error);
        if (!info) return;
        setError(info.message);
        if (info.fatal) {
          wantRef.current = false;
          stopMeter();
        } else failuresRef.current += 1;
      };
      const restart = () => {
        // Browsers end recognition after a pause; keep listening while the presenter wants it,
        // backing off when it keeps failing (e.g. no internet) instead of restarting in a loop.
        if (recRef.current !== rec) return;
        if (!wantRef.current) {
          setListening(false);
          return;
        }
        const n = failuresRef.current;
        const delay = n ? Math.min(8000, 1000 * 2 ** Math.min(3, n - 1)) : 120;
        restartTimerRef.current = window.setTimeout(() => {
          if (!wantRef.current || recRef.current !== rec) return;
          try {
            rec.start();
          } catch {
            failuresRef.current += 1;
            restart();
          }
        }, delay);
      };
      rec.onend = restart;
      const old = recRef.current;
      recRef.current = rec;
      try {
        old?.abort?.();
      } catch {
        /* none running */
      }
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      wantRef.current = true;
      failuresRef.current = 0;
      try {
        rec.start();
        setListening(true);
        return true;
      } catch {
        setError("Couldn't start the microphone.");
        wantRef.current = false;
        stopMeter();
        return false;
      }
    },
    [lang, startMeter, stopMeter]
  );

  /** Changes the spoken language (remembered); restarts recognition if it is running. */
  const setLang = useCallback(
    (code: string) => {
      setLangState(code);
      try {
        localStorage.setItem(LANG_KEY, code);
      } catch {
        /* private mode */
      }
      // Consent is already on record, so restarting doesn't ask again.
      if (wantRef.current && recRef.current) start(undefined, code);
    },
    [start]
  );

  useEffect(() => () => stop(), [stop]);

  return { listening, error, lastHeard, lang, setLang, start, stop, subscribe, subscribeLevel };
}

/** Plain text a slide shows (title, body, bullets, notes) for matching speech to slides. */
export function slideText(slide: any): { title: string; text: string } {
  const parts: string[] = [];
  let title = "";
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text" && typeof node.text === "string") parts.push(node.text);
    (node.content || []).forEach(walk);
  };
  for (const b of slide?.blocks || []) {
    const before = parts.length;
    if (b.doc) walk(b.doc);
    else if (Array.isArray(b.bullets)) parts.push(...b.bullets.map(String));
    else if (b.content || b.text || b.props?.text) parts.push(String(b.content || b.text || b.props?.text));
    if (b.type === "kpi") parts.push(`${b.value ?? b.props?.value ?? ""} ${b.label ?? b.props?.label ?? ""}`);
    if (b.role === "title" && !title) title = parts.slice(before).join(" ");
  }
  if (slide?.notes) parts.push(String(slide.notes));
  return { title, text: parts.join(" ") };
}

const STOP = new Set(
  "the a an and or of to in on for with is are was were be this that these those it its our we you they i at by from as so if then than but not no yes can will just also very more most about into over how what why when which who have has had do does did".split(" ")
);

export function keywords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9؀-ۿ]{3,}/g) || []).filter((w) => !STOP.has(w));
}
