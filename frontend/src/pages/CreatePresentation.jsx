import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { usePresentations } from "../PresentationsContext.jsx";
import PromptInput from "../components/PromptInput.jsx";
import { THEMES, getTheme } from "../rendering/themes";
import { LAYOUTS } from "../rendering/layouts";
import { SlideStage } from "../rendering/SlideStage";
import { postStream } from "../runtime/streamClient";
import { Button, Select, NumberField } from "../ui";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  XCircle,
  CheckCircle2,
  Sliders,
  Layers,
  Sparkles,
  MoveUp,
  MoveDown,
} from "lucide-react";

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Step 2: Outline state
  const [outline, setOutline] = useState(null);
  const [selectedOutlineIdx, setSelectedOutlineIdx] = useState(0);

  // Step 3: Generating state
  const [generatedSlides, setGeneratedSlides] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 6 });
  const abortControllerRef = useRef(null);

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

  // Step 1 -> Step 2: Generate Outline
  async function handleReviewOutline() {
    const cleanPrompt = prompt.trim();
    const cleanTitle = title.trim() || cleanPrompt.slice(0, 60);

    if (!cleanTitle && !cleanPrompt) {
      setError("Enter a title or describe your topic to continue.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/presentations/generate/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: cleanPrompt || cleanTitle,
          title: cleanTitle,
          slide_count: Number(slideCount),
          audience,
          language,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate outline.");
      }

      const data = await res.json();
      const generatedOutline = data.outline || {
        title: cleanTitle,
        slides: [
          { title: cleanTitle, layout: "title", purpose: "Introduction", visual: "none" },
          { title: "Key Highlights", layout: "bullets", purpose: "Core narrative", visual: "none" },
          { title: "Market Growth", layout: "chart-text", purpose: "Data metrics", visual: "chart" },
        ],
      };

      setOutline(generatedOutline);
      setSelectedOutlineIdx(0);
      setStep(2);
    } catch (err) {
      setError(err.message || "Could not generate outline.");
    } finally {
      setBusy(false);
    }
  }

  // Outline Editing Handlers (Step 2)
  function handleUpdateOutlineItem(idx, field, value) {
    if (!outline) return;
    const nextSlides = [...outline.slides];
    nextSlides[idx] = { ...nextSlides[idx], [field]: value };
    setOutline({ ...outline, slides: nextSlides });
  }

  function handleAddOutlineSlide() {
    if (!outline) return;
    const newSlide = {
      title: "New Slide",
      layout: "bullets",
      purpose: "Supporting narrative",
      visual: "none",
    };
    setOutline({ ...outline, slides: [...outline.slides, newSlide] });
    setSelectedOutlineIdx(outline.slides.length);
  }

  function handleDeleteOutlineSlide(idx) {
    if (!outline || outline.slides.length <= 1) return;
    const nextSlides = outline.slides.filter((_, i) => i !== idx);
    setOutline({ ...outline, slides: nextSlides });
    if (selectedOutlineIdx >= nextSlides.length) {
      setSelectedOutlineIdx(nextSlides.length - 1);
    }
  }

  function handleMoveOutlineSlide(idx, direction) {
    if (!outline) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= outline.slides.length) return;
    const nextSlides = [...outline.slides];
    const temp = nextSlides[idx];
    nextSlides[idx] = nextSlides[targetIdx];
    nextSlides[targetIdx] = temp;
    setOutline({ ...outline, slides: nextSlides });
    setSelectedOutlineIdx(targetIdx);
  }

  // Step 2 -> Step 3: Stream Slide Generation
  async function handleStartGeneration() {
    if (!outline) return;
    setStep(3);
    setGeneratedSlides([]);
    setProgress({ current: 0, total: outline.slides.length });
    setError("");

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
          outline: outline,
          stream: true,
        },
        {
          onSlide: (slideData) => {
            setGeneratedSlides((prev) => [...prev, slideData.slide]);
          },
          onProgress: (prog) => {
            setProgress(prog);
          },
          onDone: async (doneData) => {
            const presId = doneData.presentation?.id;
            await refresh();
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

  function handleCancelGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStep(2);
  }

  // Construct a live dummy slide for previewing layout in chosen theme (Step 2)
  const currentOutlineItem = outline?.slides[selectedOutlineIdx] || {
    title: "Slide Title",
    layout: "bullets",
  };
  const activeLayoutDef =
    LAYOUTS.find((l) => l.id === currentOutlineItem.layout) || LAYOUTS[2];

  const previewSlideSpec = {
    id: "preview-spec",
    layout: currentOutlineItem.layout || "bullets",
    background: { type: "color", value: "transparent" },
    transition: { effect: "none", duration: 300 },
    blocks: activeLayoutDef.slots.map((slot, sIdx) => {
      if (slot.role === "title") {
        return {
          id: `preview-b-${sIdx}`,
          type: "text",
          role: "title",
          box: { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
          props: { text: currentOutlineItem.title || "Slide Title", bold: true, fontSize: 44 },
        };
      }
      if (slot.role === "chart") {
        return {
          id: `preview-b-${sIdx}`,
          type: "chart",
          role: "chart",
          box: { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
          props: { kind: "bar", title: "Metrics Overview" },
        };
      }
      if (slot.role === "kpi") {
        return {
          id: `preview-b-${sIdx}`,
          type: "kpi",
          role: "kpi",
          box: { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
          props: { value: 85, label: "Efficiency", delta: "+12%" },
        };
      }
      return {
        id: `preview-b-${sIdx}`,
        type: "text",
        role: slot.role,
        box: { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
        props: {
          bullets: ["Primary insight and direction", "Supporting analysis and baseline"],
          fontSize: 22,
        },
      };
    }),
  };

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

        {/* ================= STEP 1: DESCRIBE ================= */}
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

        {/* ================= STEP 2: REVIEW OUTLINE ================= */}
        {step === 2 && outline && (
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
                Review outline
              </h1>
              <p style={{ margin: 0, fontSize: "14px", color: "var(--ink-2)" }}>
                Refine slide titles, choose layout structures, or reorder before generation.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 420px",
                gap: "24px",
                alignItems: "start",
              }}
            >
              {/* Left Column: Editable List */}
              <div
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ marginBottom: "8px" }}>
                  <label
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--ink-2)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Deck Title
                  </label>
                  <input
                    type="text"
                    value={outline.title}
                    onChange={(e) => setOutline({ ...outline, title: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "14px",
                      fontWeight: 600,
                      border: "1px solid var(--line)",
                      borderRadius: "4px",
                      background: "var(--bg-app)",
                      color: "var(--ink)",
                      boxSizing: "border-box",
                      marginTop: "4px",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    maxHeight: "500px",
                    overflowY: "auto",
                  }}
                >
                  {outline.slides.map((item, idx) => {
                    const isSelected = selectedOutlineIdx === idx;
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedOutlineIdx(idx)}
                        style={{
                          padding: "12px",
                          borderRadius: "4px",
                          border: isSelected
                            ? "1px solid var(--signal)"
                            : "1px solid var(--line)",
                          background: isSelected ? "var(--signal-weak)" : "var(--bg-app)",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: isSelected ? "var(--signal)" : "var(--ink-2)",
                            }}
                          >
                            Slide {idx + 1}
                          </span>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveOutlineSlide(idx, -1);
                              }}
                              disabled={idx === 0}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: idx === 0 ? "default" : "pointer",
                                opacity: idx === 0 ? 0.3 : 1,
                                color: "var(--ink-2)",
                                padding: "2px",
                              }}
                            >
                              <MoveUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveOutlineSlide(idx, 1);
                              }}
                              disabled={idx === outline.slides.length - 1}
                              style={{
                                background: "none",
                                border: "none",
                                cursor:
                                  idx === outline.slides.length - 1
                                    ? "default"
                                    : "pointer",
                                opacity: idx === outline.slides.length - 1 ? 0.3 : 1,
                                color: "var(--ink-2)",
                                padding: "2px",
                              }}
                            >
                              <MoveDown size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOutlineSlide(idx);
                              }}
                              disabled={outline.slides.length <= 1}
                              style={{
                                background: "none",
                                border: "none",
                                cursor:
                                  outline.slides.length <= 1 ? "default" : "pointer",
                                opacity: outline.slides.length <= 1 ? 0.3 : 1,
                                color: "var(--danger)",
                                padding: "2px 4px",
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) =>
                            handleUpdateOutlineItem(idx, "title", e.target.value)
                          }
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            fontSize: "13px",
                            fontWeight: 500,
                            border: "1px solid var(--line)",
                            borderRadius: "4px",
                            background: "var(--bg-panel)",
                            color: "var(--ink)",
                            boxSizing: "border-box",
                          }}
                        />

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <select
                            value={item.layout}
                            onChange={(e) =>
                              handleUpdateOutlineItem(idx, "layout", e.target.value)
                            }
                            style={{
                              flex: 1,
                              padding: "4px 8px",
                              fontSize: "12px",
                              border: "1px solid var(--line)",
                              borderRadius: "4px",
                              background: "var(--bg-panel)",
                              color: "var(--ink)",
                            }}
                          >
                            {LAYOUTS.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>

                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "var(--line)",
                              color: "var(--ink-2)",
                            }}
                          >
                            {item.visual || "none"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddOutlineSlide}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    marginTop: "8px",
                  }}
                >
                  <Plus size={14} />
                  <span>Add slide</span>
                </Button>
              </div>

              {/* Right Column: Live Layout Preview in Theme */}
              <div
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>
                    Slide {selectedOutlineIdx + 1} Preview
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--ink-2)" }}>
                    Theme: {getTheme(selectedThemeId).name}
                  </span>
                </div>

                {/* 16:9 Thumbnail container */}
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 9",
                    borderRadius: "4px",
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                    background: "var(--bg-well)",
                  }}
                >
                  <SlideStage
                    slide={previewSlideSpec}
                    theme={getTheme(selectedThemeId)}
                    mode="thumbnail"
                  />
                </div>

                <div>
                  <h4 style={{ margin: "0 0 4px", fontSize: "13px", color: "var(--ink)" }}>
                    {activeLayoutDef.name}
                  </h4>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-2)", lineHeight: 1.4 }}>
                    {activeLayoutDef.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "24px",
                paddingTop: "16px",
                borderTop: "1px solid var(--line)",
              }}
            >
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <ArrowLeft size={14} />
                <span>Back to describe</span>
              </Button>

              <Button
                variant="primary"
                onClick={handleStartGeneration}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span>Generate slides</span>
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: GENERATING ================= */}
        {step === 3 && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "24px",
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: "24px",
                    fontWeight: 600,
                    margin: "0 0 8px",
                    color: "var(--ink)",
                  }}
                >
                  Generating slides
                </h1>
                <p style={{ margin: 0, fontSize: "14px", color: "var(--ink-2)" }}>
                  Slide {progress.current} of {progress.total}
                </p>
              </div>

              <Button variant="outline" onClick={handleCancelGeneration}>
                Cancel
              </Button>
            </div>

            {/* Real Progress Bar */}
            <div
              style={{
                width: "100%",
                height: "6px",
                background: "var(--line)",
                borderRadius: "3px",
                overflow: "hidden",
                marginBottom: "32px",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${
                    progress.total > 0
                      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
                      : 0
                  }%`,
                  background: "var(--signal)",
                  transition: "width 300ms ease",
                }}
              />
            </div>

            {/* Generated Slides Arrival Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "20px",
              }}
            >
              {outline?.slides.map((item, idx) => {
                const arrivedSlide = generatedSlides[idx];
                const isArrived = Boolean(arrivedSlide);

                return (
                  <div
                    key={idx}
                    style={{
                      background: "var(--bg-panel)",
                      border: isArrived
                        ? "1px solid var(--signal)"
                        : "1px dashed var(--line)",
                      borderRadius: "6px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: isArrived ? "var(--signal)" : "var(--ink-3)",
                        }}
                      >
                        Slide {idx + 1}
                      </span>
                      {isArrived ? (
                        <CheckCircle2 size={15} color="var(--ok, #1B7F4B)" />
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>
                          Waiting...
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "16 / 9",
                        borderRadius: "4px",
                        overflow: "hidden",
                        background: "var(--bg-well)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isArrived && arrivedSlide.spec ? (
                        <SlideStage
                          slide={arrivedSlide.spec}
                          theme={getTheme(selectedThemeId)}
                          mode="thumbnail"
                        />
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>
                          {item.layout}
                        </span>
                      )}
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: "13px",
                        fontWeight: 500,
                        color: isArrived ? "var(--ink)" : "var(--ink-2)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.title}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
