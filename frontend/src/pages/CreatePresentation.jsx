import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { usePresentations } from "../PresentationsContext.jsx";
import PromptInput from "../components/PromptInput.jsx";
import { THEMES, getTheme } from "../rendering/themes";
import { LAYOUTS } from "../rendering/layouts";
import { SlideStage } from "../rendering/SlideStage";
import { postStream } from "../runtime/streamClient";
import { TopBar } from "../components/outline/TopBar";
import { OutlineDoc } from "../components/outline/OutlineDoc";
import { PreviewPane } from "../components/outline/PreviewPane";
import { BrandPanel } from "../components/outline/BrandPanel";
import { PipelineTimeline } from "../components/outline/PipelineTimeline";
import { buildPreviewSlide } from "../components/outline/previewSpec";
import "../components/outline/outline.css";
import { Button } from "../ui";
import { ArrowRight } from "lucide-react";

const AUDIENCES = [
  "General audience",
  "Executive / Leadership",
  "Investors & Pitch",
  "Engineers & Tech",
  "Students & Academic",
];

const TONES = [
  "Professional & Strategic",
  "Data-Driven & Analytical",
  "Bold & Persuasive",
  "Inspirational & Creative",
];

const LANGUAGES = ["English", "Urdu", "Spanish", "French", "German"];

const MAX_SLIDES = 15;
const MIN_SLIDES = 3;

let keySeq = 0;
const withKeys = (slides) => slides.map((s) => ({ ...s, _key: s._key || `o${++keySeq}` }));
// UI-only fields never go to the API.
const forApi = (outline) => ({
  ...outline,
  slides: outline.slides.map(({ _key, _feedback, ...rest }) => rest),
});

function outlineAsText(outline) {
  return outline.slides
    .map((s, i) => `${i + 1}. ${s.title}${s.purpose ? ` (${s.purpose})` : ""}`)
    .join("\n");
}

function slideCountFor(instruction, current) {
  const lower = instruction.toLowerCase();
  if (/shorter|fewer|condense|trim/.test(lower)) return Math.max(MIN_SLIDES, current - 2);
  if (/conclusion|add (a|one) slide|longer|expand/.test(lower)) return Math.min(MAX_SLIDES, current + 1);
  return current;
}

const layoutName = (id) => (LAYOUTS.find((l) => l.id === id) || LAYOUTS[2]).name;
const layoutDef = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[2];
const toneOptions = TONES.map((t) => ({ value: t, label: t }));
const themeOptions = THEMES.map((t) => ({ value: t.id, label: t.name }));

function useElapsed(running, startedAt) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    setElapsed(Math.round((Date.now() - startedAt) / 1000));
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [running, startedAt]);
  return elapsed;
}

export default function CreatePresentation() {
  const navigate = useNavigate();
  const { refresh } = usePresentations();

  // Step 1: Describe state
  const [step, setStep] = useState(1); // 1: Describe, 2: Review outline, 3: Generating
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [audience, setAudience] = useState("General audience");
  const [tone, setTone] = useState("Professional & Strategic");
  const [language, setLanguage] = useState("English");
  const [selectedThemeId, setSelectedThemeId] = useState("clean-light");
  const [attachedDocName, setAttachedDocName] = useState("");
  const [error, setError] = useState("");
  const [aiNotice, setAiNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Outline drafting (timeline while the outline request runs)
  const [drafting, setDrafting] = useState(false);
  const [draftPaused, setDraftPaused] = useState(false);
  const [draftStartedAt, setDraftStartedAt] = useState(0);
  const [heldReady, setHeldReady] = useState(false);
  const [draftLog, setDraftLog] = useState([]);
  const heldOutlineRef = useRef(null);
  const draftPausedRef = useRef(false);
  const draftAbortRef = useRef(null);
  const draftElapsed = useElapsed(drafting && !heldReady, draftStartedAt);

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedDocName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") {
        setPrompt((prev) =>
          prev
            ? `${prev}\n\n[Attached Reference: ${file.name}]\n${text.slice(0, 4000)}`
            : `[Attached Reference: ${file.name}]\n${text.slice(0, 4000)}`
        );
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, ""));
        }
      }
    };
    reader.readAsText(file);
  }

  // Step 2: Outline state
  const [outline, setOutline] = useState(null);
  const [selectedOutlineIdx, setSelectedOutlineIdx] = useState(0);
  const [refining, setRefining] = useState(false);
  const [refineStatus, setRefineStatus] = useState("");
  const [regeneratingIdx, setRegeneratingIdx] = useState(null);
  const refineAbortRef = useRef(null);

  // Step 3: Generating state
  const [generatedSlides, setGeneratedSlides] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 6 });
  const [genPaused, setGenPaused] = useState(false);
  const [readyPresId, setReadyPresId] = useState(null);
  const [genLog, setGenLog] = useState([]);
  const [brandId, setBrandId] = useState(null);
  const [genStartedAt, setGenStartedAt] = useState(0);
  const genPausedRef = useRef(false);
  const abortControllerRef = useRef(null);
  const genElapsed = useElapsed(step === 3 && !readyPresId, genStartedAt);

  // Fallback / manual submission (per existing test compatibility)
  async function handleSubmit(event) {
    if (event) event.preventDefault();
    const cleanPrompt = prompt.trim();
    const cleanTitle = title.trim() || cleanPrompt.slice(0, 60);

    if (!cleanTitle && !cleanPrompt) {
      setError("Enter a title or describe your topic to continue.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const { presentation } = await api.createPresentation({
        title: cleanTitle || "Untitled Presentation",
        description: cleanPrompt,
      });
      await api.addSlide(presentation.id, {
        title: cleanTitle || "Title Slide",
        content: cleanPrompt,
      });
      await refresh();
      navigate(`/presentations/${presentation.id}`);
    } catch (err) {
      setError(err.message || "Failed to create presentation.");
      setBusy(false);
    }
  }

  // Calls the existing outline endpoint. Returns the outline object.
  async function requestOutline({ topic, title: t, count, signal }) {
    const res = await fetch("/api/presentations/generate/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, title: t, slide_count: Number(count), audience, language }),
      signal,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to generate outline.");
    }
    const data = await res.json();
    // The server says when a template stood in for the AI (e.g. free daily limit used up).
    setAiNotice(data.ai?.mode === "fallback" ? data.ai.reasons?.[0] || "The AI was unavailable." : "");
    return data.outline;
  }

  function showOutline(generatedOutline) {
    setOutline({ ...generatedOutline, slides: withKeys(generatedOutline.slides || []) });
    setSelectedOutlineIdx(0);
    setDrafting(false);
    setStep(2);
  }

  // Step 1 -> Step 2: Generate Outline
  async function handleReviewOutline() {
    const cleanPrompt = prompt.trim();
    const cleanTitle = title.trim() || cleanPrompt.slice(0, 60);

    if (!cleanTitle && !cleanPrompt) {
      setError("Enter a title or describe your topic to continue.");
      return;
    }

    const controller = new AbortController();
    draftAbortRef.current = controller;
    heldOutlineRef.current = null;
    draftPausedRef.current = false;
    setHeldReady(false);
    setBusy(true);
    setError("");
    setDraftPaused(false);
    setDraftStartedAt(Date.now());
    setDraftLog([`Brief sent: ${slideCount} slides for ${audience.toLowerCase()}, in ${language}`, "Waiting for the AI model"]);
    setDrafting(true);

    try {
      const out = await requestOutline({
        topic: cleanPrompt || cleanTitle,
        title: cleanTitle,
        count: slideCount,
        signal: controller.signal,
      });
      // No stand-in outline: a canned "Key Highlights / Market Growth" deck is never about the topic.
      if (!out || !Array.isArray(out.slides) || out.slides.length === 0) {
        throw new Error("The outline could not be generated. Try again in a moment.");
      }
      const generatedOutline = out;
      setDraftLog((l) => [...l, `Outline received: ${generatedOutline.slides?.length || 0} slides`]);
      // Pause holds the arrived outline until the user resumes.
      if (draftPausedRef.current) {
        heldOutlineRef.current = generatedOutline;
        setHeldReady(true);
      } else {
        showOutline(generatedOutline);
      }
    } catch (err) {
      setDrafting(false);
      if (!controller.signal.aborted) setError(err.message || "Could not generate outline.");
    } finally {
      setBusy(false);
    }
  }

  function handleToggleDraftPause() {
    const next = !draftPaused;
    draftPausedRef.current = next;
    setDraftPaused(next);
    if (!next && heldOutlineRef.current) {
      const held = heldOutlineRef.current;
      heldOutlineRef.current = null;
      setHeldReady(false);
      showOutline(held);
    }
  }

  function handleCancelDraft() {
    draftAbortRef.current?.abort();
    heldOutlineRef.current = null;
    draftPausedRef.current = false;
    setHeldReady(false);
    setDrafting(false);
    setDraftPaused(false);
    setBusy(false);
  }

  // Outline Editing Handlers (Step 2)
  function handleUpdateOutlineItem(idx, patch) {
    setOutline((cur) => {
      if (!cur) return cur;
      const nextSlides = [...cur.slides];
      nextSlides[idx] = { ...nextSlides[idx], ...patch };
      return { ...cur, slides: nextSlides };
    });
  }

  function handleInsertAfter(idx) {
    if (!outline || outline.slides.length >= MAX_SLIDES) return;
    const newSlide = withKeys([{ title: "New slide", layout: "bullets", purpose: "", visual: "none" }])[0];
    const nextSlides = [...outline.slides];
    nextSlides.splice(idx + 1, 0, newSlide);
    setOutline({ ...outline, slides: nextSlides });
    setSelectedOutlineIdx(idx + 1);
  }

  function handleDeleteOutlineSlide(idx) {
    if (!outline || outline.slides.length <= 1) return;
    const nextSlides = outline.slides.filter((_, i) => i !== idx);
    setOutline({ ...outline, slides: nextSlides });
    if (selectedOutlineIdx >= nextSlides.length) {
      setSelectedOutlineIdx(nextSlides.length - 1);
    }
  }

  function handleMoveOutlineSlide(from, to) {
    if (!outline || to < 0 || to >= outline.slides.length || from === to) return;
    const nextSlides = [...outline.slides];
    const [moved] = nextSlides.splice(from, 1);
    nextSlides.splice(to, 0, moved);
    setOutline({ ...outline, slides: nextSlides });
    setSelectedOutlineIdx(to);
  }

  const baseTopic = () => prompt.trim() || title.trim() || outline?.title || "";

  // Quick chips and the refine input reuse the existing outline endpoint.
  async function handleRefine(instruction) {
    if (!outline || refining) return;
    const count = slideCountFor(instruction, outline.slides.length);
    const controller = new AbortController();
    refineAbortRef.current = controller;
    setRefining(true);
    setError("");
    setRefineStatus(`Refining: “${instruction}”…`);
    try {
      const topic = `${baseTopic()}\n\nRevise this presentation outline. Instruction: ${instruction}.\nCurrent outline:\n${outlineAsText(outline)}`;
      const out = await requestOutline({ topic, title: outline.title, count, signal: controller.signal });
      if (!out?.slides?.length) throw new Error("The refined outline came back empty.");
      setOutline({ ...outline, ...out, title: outline.title, slides: withKeys(out.slides) });
      setSelectedOutlineIdx(0);
      setRefineStatus(`Applied: “${instruction}”.`);
    } catch (err) {
      setRefineStatus("");
      if (!controller.signal.aborted) setError(err.message || "Could not refine the outline.");
      else setRefineStatus("Refinement stopped.");
    } finally {
      setRefining(false);
    }
  }

  function handleStopRefine() {
    refineAbortRef.current?.abort();
  }

  async function handleRegenerateItem(idx) {
    if (!outline || regeneratingIdx !== null) return;
    const item = outline.slides[idx];
    setRegeneratingIdx(idx);
    setError("");
    try {
      const topic = `${baseTopic()}\n\nWrite one alternative slide to replace slide ${idx + 1}: “${item.title}”${
        item.purpose ? ` (${item.purpose})` : ""
      }. Keep it consistent with the rest of the outline:\n${outlineAsText(outline)}`;
      const out = await requestOutline({ topic, title: outline.title, count: 1 });
      const alt = out?.slides?.[0];
      if (!alt) throw new Error("No alternative slide came back.");
      setOutline((cur) => {
        if (!cur) return cur;
        const next = [...cur.slides];
        next[idx] = { ...next[idx], ...alt, _key: next[idx]._key, _feedback: null };
        return { ...cur, slides: next };
      });
    } catch (err) {
      setError(err.message || "Could not regenerate that slide.");
    } finally {
      setRegeneratingIdx(null);
    }
  }

  // Step 2 -> Step 3: Stream Slide Generation
  async function handleStartGeneration() {
    if (!outline) return;
    setStep(3);
    setGeneratedSlides([]);
    setProgress({ current: 0, total: outline.slides.length });
    setError("");
    setGenPaused(false);
    genPausedRef.current = false;
    setReadyPresId(null);
    setGenStartedAt(Date.now());
    setGenLog([`Generating ${outline.slides.length} slides in ${getTheme(selectedThemeId).name}`]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await postStream(
        "/api/presentations/generate",
        {
          topic: prompt.trim() || outline.title,
          title: outline.title,
          slide_count: outline.slides.length,
          audience,
          language,
          theme: selectedThemeId,
          outline: forApi(outline),
          brand_id: brandId || undefined,
          stream: true,
        },
        {
          // Live progress from the research and writing stages ("Searching sources", "Writing slides 1-4").
          onText: (data) => {
            const m = /\[PROGRESS: (.*)\]/.exec(data?.delta || "");
            if (m) setGenLog((l) => (l[l.length - 1] === m[1] ? l : [...l, m[1]]));
          },
          onResearchComplete: (data) => {
            setGenLog((l) => [...l, data?.status || "Research complete", ...((data?.limitations || []).map((x) => `Note: ${x}`))]);
          },
          onSlide: (slideData) => {
            setGeneratedSlides((prev) => [...prev, slideData.slide]);
            setGenLog((l) => [...l, `Slide ${slideData.index + 1} ready: ${slideData.slide?.title || ""}`]);
          },
          onProgress: (prog) => {
            setProgress(prog);
          },
          onDone: async (doneData) => {
            const presId = doneData.presentation?.id;
            setGenLog((l) => [...l, "Deck saved"]);
            await refresh();
            if (genPausedRef.current && presId) {
              setReadyPresId(presId);
              return;
            }
            if (presId) {
              navigate(`/presentations/${presId}`);
            } else {
              navigate("/");
            }
          },
          onError: (err) => {
            setError(typeof err === "string" ? err : err.message);
          },
        },
        controller.signal
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message || "Generation error.");
      }
    }
  }

  function handleToggleGenPause() {
    const next = !genPaused;
    setGenPaused(next);
    genPausedRef.current = next;
    if (!next && readyPresId) navigate(`/presentations/${readyPresId}`);
  }

  function handleCancelGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStep(2);
  }

  // Keyboard: Ctrl/Cmd+Enter generates slides, "/" focuses the refine input (step 2).
  useEffect(() => {
    if (step !== 2) return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleStartGeneration();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        document.querySelector(".fx-ask input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const theme = getTheme(selectedThemeId);
  const toneChip = { label: "Tone", value: tone, options: toneOptions, onChange: setTone, disabled: busy || step === 3, hideOnSmall: true };

  const errorBanner = error ? (
    <div role="alert" className="fx-error">
      {error}
    </div>
  ) : null;

  const aiNoticeBanner = aiNotice ? (
    <div role="status" className="fx-notice">
      <strong>The AI wasn't available, so this is a template.</strong> {aiNotice} Edit it, or try again later.
    </div>
  ) : null;

  const briefCard = (
    <aside className="fx-paper fx-brief-card" aria-label="Your brief">
      <h2>Your brief</h2>
      <blockquote>{(title.trim() || prompt.trim() || outline?.title || "").slice(0, 220)}</blockquote>
      <dl>
        <dt>Slides</dt>
        <dd>{step === 3 ? outline?.slides.length : slideCount}</dd>
        <dt>Audience</dt>
        <dd>{audience}</dd>
        <dt>Tone</dt>
        <dd>{tone}</dd>
        <dt>Language</dt>
        <dd>{language}</dd>
        <dt>Theme</dt>
        <dd>{theme.name}</dd>
      </dl>
    </aside>
  );

  // ================= STEP 1: DESCRIBE (original layout, kept as it was) =================
  if (step === 1 && !drafting) {
    return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-app)",
        color: "var(--ink)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px 80px",
        fontFamily: "var(--font-sans, sans-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "960px" }}>
        {/* Step Progress Tracker */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "32px",
            borderBottom: "1px solid var(--line)",
            paddingBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: step === 1 ? 600 : 400,
                color: step === 1 ? "var(--signal)" : "var(--ink-2)",
              }}
            >
              1. Describe
            </span>
            <span style={{ color: "var(--line)" }}>/</span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: step === 2 ? 600 : 400,
                color: step === 2 ? "var(--signal)" : "var(--ink-2)",
              }}
            >
              2. Review outline
            </span>
            <span style={{ color: "var(--line)" }}>/</span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: step === 3 ? 600 : 400,
                color: step === 3 ? "var(--signal)" : "var(--ink-2)",
              }}
            >
              3. Generating
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div
            role="alert"
            style={{
              padding: "12px 16px",
              background: "var(--bg-panel)",
              border: "1px solid var(--danger)",
              borderRadius: "4px",
              color: "var(--danger)",
              fontSize: "13px",
              marginBottom: "24px",
            }}
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ marginBottom: "24px" }}>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  margin: "0 0 8px",
                  color: "var(--ink)",
                }}
              >
                Create a presentation
              </h1>
              <p style={{ margin: 0, fontSize: "14px", color: "var(--ink-2)" }}>
                Describe your topic and define preferences to draft a multi-slide outline.
              </p>
            </div>

            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--line)",
                borderRadius: "6px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              <div className="field">
                <label
                  htmlFor="title"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--ink)",
                  }}
                >
                  Presentation title (optional)
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  disabled={busy}
                  maxLength={120}
                  placeholder="e.g. Q4 Strategy and Growth Objectives"
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid var(--line)",
                    borderRadius: "4px",
                    background: "var(--bg-app)",
                    color: "var(--ink)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <PromptInput value={prompt} onChange={setPrompt} disabled={busy} />

              {/* Kimi Slides: Document & Notes to Slides Attachment Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--bg-app, #F9FAFB)",
                  border: "1px dashed var(--line, #E5E7EB)",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-secondary, #64748B)" }}>
                  <span>📎 Documents to Slides:</span>
                  {attachedDocName ? (
                    <span style={{ fontWeight: 600, color: "var(--theme-primary, #2563EB)" }}>
                      ✓ {attachedDocName}
                    </span>
                  ) : (
                    <span>Attach .txt, .md, .csv, notes, or paper</span>
                  )}
                </div>
                <label
                  style={{
                    padding: "4px 12px",
                    background: "var(--bg-card, #FFFFFF)",
                    border: "1px solid var(--line, #E5E7EB)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--ink, #111827)",
                  }}
                >
                  Upload Document
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.csv,.json"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              {/* Compact preferences row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      marginBottom: "6px",
                      color: "var(--ink)",
                    }}
                  >
                    Slides ({slideCount})
                  </label>
                  <select
                    value={slideCount}
                    disabled={busy}
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "13px",
                      border: "1px solid var(--line)",
                      borderRadius: "4px",
                      background: "var(--bg-app)",
                      color: "var(--ink)",
                    }}
                  >
                    {[3, 4, 5, 6, 8, 10, 12, 15].map((cnt) => (
                      <option key={cnt} value={cnt}>
                        {cnt} slides
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      marginBottom: "6px",
                      color: "var(--ink)",
                    }}
                  >
                    Audience
                  </label>
                  <select
                    value={audience}
                    disabled={busy}
                    onChange={(e) => setAudience(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "13px",
                      border: "1px solid var(--line)",
                      borderRadius: "4px",
                      background: "var(--bg-app)",
                      color: "var(--ink)",
                    }}
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      marginBottom: "6px",
                      color: "var(--ink)",
                    }}
                  >
                    Tone
                  </label>
                  <select
                    value={tone}
                    disabled={busy}
                    onChange={(e) => setTone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "13px",
                      border: "1px solid var(--line)",
                      borderRadius: "4px",
                      background: "var(--bg-app)",
                      color: "var(--ink)",
                    }}
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      marginBottom: "6px",
                      color: "var(--ink)",
                    }}
                  >
                    Language
                  </label>
                  <select
                    value={language}
                    disabled={busy}
                    onChange={(e) => setLanguage(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "13px",
                      border: "1px solid var(--line)",
                      borderRadius: "4px",
                      background: "var(--bg-app)",
                      color: "var(--ink)",
                    }}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      marginBottom: "6px",
                      color: "var(--ink)",
                    }}
                  >
                    Theme
                  </label>
                  <select
                    value={selectedThemeId}
                    disabled={busy}
                    onChange={(e) => setSelectedThemeId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "13px",
                      border: "1px solid var(--line)",
                      borderRadius: "4px",
                      background: "var(--bg-app)",
                      color: "var(--ink)",
                    }}
                  >
                    {THEMES.map((th) => (
                      <option key={th.id} value={th.id}>
                        {th.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "8px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <Button
                  variant="outline"
                  onClick={handleSubmit}
                  disabled={busy}
                  style={{ fontSize: "13px" }}
                >
                  Create presentation
                </Button>

                <Button
                  variant="primary"
                  onClick={handleReviewOutline}
                  disabled={busy}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span>Review outline</span>
                  <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    );
  }

  // ================= DRAFTING THE OUTLINE (timeline) =================
  if (step === 1 && drafting) {
    return (
      <div className="fx-outline">
        <TopBar
          title={title.trim() || prompt.trim().slice(0, 60) || "New presentation"}
          subtitle="Drafting your outline"
          step={2}
          onBack={handleCancelDraft}
          backLabel="Cancel and return to describe"
          chips={[toneChip]}
        />
        <main className="fx-pipe">
          <div>
            {errorBanner}
            <PipelineTimeline
              heading={heldReady ? "Your outline is ready" : "Drafting your outline"}
              subheading={heldReady ? "Paused. Resume to open it in the editor." : "This usually takes under a minute."}
              elapsedSeconds={draftElapsed}
              paused={draftPaused}
              onTogglePause={handleToggleDraftPause}
              onCancel={handleCancelDraft}
              log={draftLog}
              steps={[
                { id: "brief", title: "Brief received", status: "done", note: `${slideCount} slides, ${audience.toLowerCase()}, ${language}` },
                {
                  id: "draft",
                  title: "Drafting outline",
                  status: heldReady ? "done" : "active",
                  note: heldReady ? "Outline received" : draftPaused ? "Paused: the outline will wait for you" : "The AI is structuring your story",
                },
                { id: "review", title: "Review and refine", status: heldReady ? "active" : "pending", note: "Edit titles, reorder, pick layouts" },
              ]}
            />
          </div>
          {briefCard}
        </main>
      </div>
    );
  }

  // ================= STEP 3: GENERATING SLIDES (timeline) =================
  if (step === 3) {
    const total = outline?.slides.length || progress.total;
    return (
      <div className="fx-outline">
        <TopBar
          title={outline?.title || "Generating slides"}
          subtitle="Generating slides"
          step={3}
          onBack={handleCancelGeneration}
          backLabel="Cancel generation and return to the outline"
        />
        <main className="fx-pipe">
          <div>
            {errorBanner}
            <PipelineTimeline
              heading={readyPresId ? "Your slides are ready" : "Generating slides"}
              subheading={readyPresId ? "Paused. Resume to open the editor." : `${generatedSlides.length} of ${total} ready`}
              elapsedSeconds={genElapsed}
              paused={genPaused}
              onTogglePause={handleToggleGenPause}
              onCancel={handleCancelGeneration}
              log={genLog}
              steps={[
                { id: "outline", title: "Outline approved", status: "done", note: `${total} slides` },
                {
                  id: "slides",
                  title: "Writing and designing slides",
                  status: generatedSlides.length >= total && total > 0 ? "done" : "active",
                  note: genPaused ? "Paused: the editor opens when you resume" : `${generatedSlides.length} of ${total} ready`,
                  detail: (
                    <div className="fx-thumbs">
                      {outline?.slides.map((item, idx) => {
                        const arrived = generatedSlides[idx];
                        return (
                          <div key={item._key ?? idx} className={`fx-thumb ${arrived ? "is-ready" : ""}`}>
                            <div className="fx-thumb-img">
                              {arrived?.spec ? <SlideStage slide={arrived.spec} theme={theme} mode="thumbnail" /> : <span>{layoutName(item.layout)}</span>}
                            </div>
                            <p>
                              {idx + 1}. {item.title}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ),
                },
                { id: "open", title: "Open in the editor", status: readyPresId ? "active" : "pending" },
              ]}
            />
          </div>
          {briefCard}
        </main>
      </div>
    );
  }

  // ================= STEP 2: OUTLINE DOCUMENT + LIVE PREVIEW =================
  if (!outline) return null;
  const current = outline.slides[selectedOutlineIdx] || outline.slides[0];
  const previewSlide = buildPreviewSlide(current, layoutDef(current.layout), outline.title);
  const sources = outline.research_dossier?.citations || [];

  return (
    <div className="fx-outline">
      <TopBar
        title={outline.title || "Review outline"}
        subtitle="Edit the outline, then generate slides"
        step={2}
        onBack={() => setStep(1)}
        backLabel="Back to describe"
        chips={[
          toneChip,
          { label: "Theme", value: selectedThemeId, options: themeOptions, onChange: setSelectedThemeId, hideOnSmall: true },
        ]}
        action={
          <button
            type="button"
            className="fx-btn is-primary"
            onClick={handleStartGeneration}
            disabled={refining || regeneratingIdx !== null}
            title="Generate slides (Ctrl + Enter)"
          >
            Generate slides
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        }
      />
      <main className="fx-work">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {errorBanner}
          {aiNoticeBanner}
          <OutlineDoc
            deckTitle={outline.title}
            onDeckTitleChange={(t) => setOutline({ ...outline, title: t })}
            meta={[`${outline.slides.length} slides`, audience, language, theme.name]}
            items={outline.slides}
            layoutName={layoutName}
            selectedIdx={selectedOutlineIdx}
            onSelect={setSelectedOutlineIdx}
            onUpdate={handleUpdateOutlineItem}
            onMove={handleMoveOutlineSlide}
            onDelete={handleDeleteOutlineSlide}
            onInsertAfter={handleInsertAfter}
            onRegenerate={handleRegenerateItem}
            regeneratingIdx={regeneratingIdx}
            maxItems={MAX_SLIDES}
            sources={sources}
            disabled={refining}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <PreviewPane
          slide={previewSlide}
          theme={theme}
          themeName={theme.name}
          index={selectedOutlineIdx}
          total={outline.slides.length}
          onPrev={() => setSelectedOutlineIdx((i) => Math.max(0, i - 1))}
          onNext={() => setSelectedOutlineIdx((i) => Math.min(outline.slides.length - 1, i + 1))}
          layouts={LAYOUTS}
          layoutId={current.layout}
          onLayout={(id) => handleUpdateOutlineItem(selectedOutlineIdx, { layout: id })}
          onRefine={handleRefine}
          onStopRefine={handleStopRefine}
          refining={refining}
          status={refineStatus}
          disabled={refining}
        />
        <BrandPanel value={brandId} onChange={setBrandId} disabled={refining} />
        </div>
      </main>
    </div>
  );
}
