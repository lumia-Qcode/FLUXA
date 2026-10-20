import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { usePresentations } from "../PresentationsContext.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";
import SlidePreview from "../components/SlidePreview.jsx";

const THEMES = [
  ["midnight", "Midnight Cyber"],
  ["ocean", "Ocean Glow"],
  ["sunset", "Sunset Prism"],
  ["light", "Luxe Light"],
  ["aurora", "Aurora Neon"],
  ["crimson", "Crimson Velvet"],
];

const LAYOUTS = [
  ["standard", "Standard"],
  ["centered", "Centered"],
  ["two-column", "Two columns"],
];

function loadDesign(id) {
  try {
    const raw = localStorage.getItem(`fluxa-design-${id}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return { theme: parsed.theme || "midnight", layouts: parsed.layouts || {} };
  } catch {
    return { theme: "midnight", layouts: {} };
  }
}

function saveDesign(id, design) {
  try {
    localStorage.setItem(`fluxa-design-${id}`, JSON.stringify(design));
  } catch {
    // storage unavailable
  }
}

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = usePresentations();

  const [presentation, setPresentation] = useState(null);
  const [slides, setSlides] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [design, setDesign] = useState(() => loadDesign(id));

  // Fullscreen slideshow presentation mode
  const [presenting, setPresenting] = useState(false);

  // Copilot panel
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState([
    {
      role: "assistant",
      content:
        "👋 Welcome! Your deck is active. Would you like to adjust any slides, add new content, include charts/metrics, or refine tone? Just tell me what changes you'd like to make!",
    },
  ]);

  useEffect(() => {
    setDesign(loadDesign(id));
  }, [id]);

  const load = useCallback(
    async (preferId) => {
      try {
        const { presentation: p } = await api.getPresentation(id);
        setPresentation(p);
        setSlides(p.slides);
        const next = p.slides.find((s) => s.id === preferId) || p.slides[0] || null;
        setSelectedId(next ? next.id : null);
        setError("");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    setLoading(true);
    setDrafts({});
    load();
  }, [load]);

  const selected = slides.find((s) => s.id === selectedId) || null;
  const current = selected
    ? drafts[selected.id] || { title: selected.title || "", content: selected.content || "" }
    : null;
  const dirty =
    selected &&
    (current.title !== (selected.title || "") || current.content !== (selected.content || ""));

  const anyUnsaved = slides.some((s) => {
    const d = drafts[s.id];
    return d && (d.title !== (s.title || "") || d.content !== (s.content || ""));
  });

  const layout = selected ? design.layouts[selected.id] || "standard" : "standard";

  function changeTheme(theme) {
    const next = { ...design, theme };
    setDesign(next);
    saveDesign(id, next);
  }

  function changeLayout(value) {
    const next = { ...design, layouts: { ...design.layouts, [selected.id]: value } };
    setDesign(next);
    saveDesign(id, next);
  }

  const index = selected ? slides.findIndex((s) => s.id === selected.id) : -1;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < slides.length - 1;
  const goPrev = () => hasPrev && setSelectedId(slides[index - 1].id);
  const goNext = () => hasNext && setSelectedId(slides[index + 1].id);

  // Keyboard navigation for editor and slideshow
  useEffect(() => {
    function onKey(e) {
      if (presenting) {
        if (e.key === "ArrowLeft" && index > 0) setSelectedId(slides[index - 1].id);
        if (e.key === "ArrowRight" && index >= 0 && index < slides.length - 1) {
          setSelectedId(slides[index + 1].id);
        }
        if (e.key === "Escape") setPresenting(false);
        return;
      }

      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && index > 0) setSelectedId(slides[index - 1].id);
      if (e.key === "ArrowRight" && index >= 0 && index < slides.length - 1) {
        setSelectedId(slides[index + 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides, index, presenting]);

  function edit(field, value) {
    setStatus("");
    setDrafts((d) => ({ ...d, [selected.id]: { ...current, [field]: value } }));
  }

  function insertComponentSnippet(snippet) {
    if (!current) return;
    const existing = current.content || "";
    const updated = existing ? `${existing}\n${snippet}` : snippet;
    edit("content", updated);
  }

  function discard() {
    setStatus("");
    setDrafts(({ [selected.id]: _removed, ...rest }) => rest);
  }

  async function run(action) {
    try {
      setError("");
      await action();
    } catch (err) {
      setError(err.message);
    }
  }

  const save = () =>
    run(async () => {
      const { slide } = await api.updateSlide(id, selected.id, current);
      setSlides((list) => list.map((s) => (s.id === slide.id ? slide : s)));
      setDrafts(({ [slide.id]: _removed, ...rest }) => rest);
      setStatus("Saved");
    });

  // Ctrl+S
  useEffect(() => {
    function onSaveKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) save();
      }
    }
    window.addEventListener("keydown", onSaveKey);
    return () => window.removeEventListener("keydown", onSaveKey);
  });

  // Warn before unload
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!anyUnsaved) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyUnsaved]);

  const addSlide = () =>
    run(async () => {
      const { slide } = await api.addSlide(id, { title: "Untitled slide", content: "" });
      await load(slide.id);
      await refresh();
    });

  const duplicateCurrentSlide = () =>
    run(async () => {
      if (!selected) return;
      const res = await api.duplicateSlide(id, selected.id);
      await load(res.slide.id);
      await refresh();
    });

  const removeSlide = () =>
    run(async () => {
      const i = slides.findIndex((s) => s.id === selected.id);
      const neighbour = slides[i + 1] || slides[i - 1];
      await api.deleteSlide(id, selected.id);
      await load(neighbour ? neighbour.id : undefined);
      await refresh();
    });

  const removePresentation = () =>
    run(async () => {
      await api.deletePresentation(id);
      await refresh();
      navigate("/");
    });

  // AI Slide Enhancement
  async function handleAiEnhance() {
    if (!selected) return;
    setStatus("AI Enhancing slide…");
    try {
      const res = await api.aiEnhanceSlide(id, selected.id, {
        instruction: "Expand bullet points with clear, impactful insights and add a relevant metric or chart.",
      });
      if (res.slide) {
        setSlides((list) => list.map((s) => (s.id === res.slide.id ? res.slide : s)));
        setDrafts(({ [res.slide.id]: _removed, ...rest }) => rest);
        setStatus("Enhanced by AI");
      }
    } catch (err) {
      setError(`AI Enhance error: ${err.message}`);
    }
  }

  // Copilot Chat Handler
  async function handleSendCopilot(customMsg) {
    const text = (customMsg || copilotInput).trim();
    if (!text || copilotBusy) return;

    setCopilotBusy(true);
    setCopilotInput("");
    setCopilotMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await api.copilot(id, {
        message: text,
        current_slide_id: selected?.id,
      });

      if (res.presentation) {
        setPresentation(res.presentation);
        setSlides(res.presentation.slides);
        if (!selected || !res.presentation.slides.some((s) => s.id === selected.id)) {
          setSelectedId(res.presentation.slides[0]?.id || null);
        }
      }

      setCopilotMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply || "Done! Any further changes or additions you would like to make?",
        },
      ]);
      await refresh();
    } catch (err) {
      setCopilotMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Could not complete request: ${err.message}. Would you like to try again or specify another change?`,
        },
      ]);
    } finally {
      setCopilotBusy(false);
    }
  }

  // Export presentation as markdown or print
  function handlePrint() {
    window.print();
  }

  function handleCopyMarkdown() {
    if (!presentation) return;
    const md = `# ${presentation.title}\n\n${slides
      .map((s, i) => `## Slide ${i + 1}: ${s.title}\n\n${s.content}\n`)
      .join("\n---\n\n")}`;
    navigator.clipboard.writeText(md);
    setStatus("Markdown copied to clipboard!");
  }

  if (loading) return <p className="muted loading-indicator">Loading presentation…</p>;
  if (!presentation) return <p role="alert" className="error-text">{error}</p>;

  return (
    <div className="editor-container">
      {/* Top Header Bar */}
      <div className="page-head luxury-header">
        <div className="title-block">
          <div className="deck-tag">
            <span>FLUXA Presentation Studio</span>
            <span className="slide-count-badge">
              {slides.length} {slides.length === 1 ? "Slide" : "Slides"}
            </span>
          </div>
          <h1 className="deck-title">{presentation.title}</h1>
          {presentation.description && <p className="muted clamp">{presentation.description}</p>}
        </div>

        <div className="deck-top-actions">
          <button
            type="button"
            className="btn btn-present"
            onClick={() => setPresenting(true)}
            title="Present Fullscreen"
          >
            ▶ Present Deck
          </button>
          <button
            type="button"
            className={`btn btn-copilot-toggle ${copilotOpen ? "active" : ""}`}
            onClick={() => setCopilotOpen((o) => !o)}
          >
            🤖 AI Copilot
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleCopyMarkdown}
            title="Copy as Markdown"
          >
            📋 Markdown
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handlePrint}
            title="Print or Save as PDF"
          >
            🖨️ PDF/Print
          </button>
          <ConfirmButton
            label="Delete presentation"
            onConfirm={removePresentation}
            className="btn btn-danger-outline"
          />
        </div>
      </div>

      {error && <p role="alert" className="error-text">{error}</p>}

      {/* Main Workspace Layout */}
      <div className={`editor-main-layout ${copilotOpen ? "has-copilot" : ""}`}>
        {/* Left Thumbnails Rail */}
        <nav className="slide-rail glass-rail" aria-label="Slides">
          <div className="rail-header">
            <span>Slides ({slides.length})</span>
            <button
              type="button"
              className="btn btn-sm btn-accent"
              onClick={addSlide}
              title="Add slide"
            >
              +
            </button>
          </div>
          <ol>
            {slides.map((s, i) => {
              const label = (drafts[s.id]?.title ?? s.title) || "Untitled slide";
              const isActive = s.id === selectedId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`thumb luxury-thumb ${isActive ? "active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="thumb-num">{i + 1}</span>
                    <span className="thumb-title">{label}</span>
                    {drafts[s.id] && <span className="dirty-dot" title="Unsaved edits" />}
                  </button>
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn btn-outline full add-slide-btn" onClick={addSlide}>
            + Add slide
          </button>
        </nav>

        {/* Center Editor + Preview Panes */}
        {selected ? (
          <div className="editor-center-workspace">
            {/* Slide Editor Pane */}
            <section className="editor-pane">
              <form
                className="card form luxury-card editor-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <div className="pane-title-row">
                  <h3>Slide {index + 1} Content Editor</h3>
                  <button
                    type="button"
                    className="btn btn-ai-sparkle btn-sm"
                    onClick={handleAiEnhance}
                    title="Enrich points with OpenRouter AI"
                  >
                    ✨ AI Polish Slide
                  </button>
                </div>

                <div className="field">
                  <label htmlFor="slide-title">Slide title</label>
                  <input
                    id="slide-title"
                    type="text"
                    value={current.title}
                    onChange={(e) => edit("title", e.target.value)}
                  />
                </div>

                {/* Rich Component Quick Insertion Toolbar */}
                <div className="component-toolbar">
                  <span className="toolbar-label">Insert Visuals:</span>
                  <button
                    type="button"
                    className="chip chip-tool"
                    onClick={() =>
                      insertComponentSnippet(
                        '[chart:bar:{"labels":["2023","2024","2025","2026"],"values":[35,55,75,95],"unit":"%"}]'
                      )
                    }
                  >
                    📊 Bar Chart
                  </button>
                  <button
                    type="button"
                    className="chip chip-tool"
                    onClick={() =>
                      insertComponentSnippet(
                        '[chart:donut:{"labels":["Cloud","Edge","On-Prem"],"values":[55,30,15]}]'
                      )
                    }
                  >
                    🍩 Donut Chart
                  </button>
                  <button
                    type="button"
                    className="chip chip-tool"
                    onClick={() =>
                      insertComponentSnippet(
                        "[metric:99.4%:Reliability SLA:Enterprise mission critical performance]"
                      )
                    }
                  >
                    📈 Metric KPI
                  </button>
                  <button
                    type="button"
                    className="chip chip-tool"
                    onClick={() =>
                      insertComponentSnippet(
                        '[compare:Strategic Comparison:{"Before AI":["Manual processing","Slow turnaround"],"With FLUXA":["Instant generation","Continuous live syncing"]}]'
                      )
                    }
                  >
                    ⚖️ Comparison
                  </button>
                  <button
                    type="button"
                    className="chip chip-tool"
                    onClick={() =>
                      insertComponentSnippet(
                        '[steps:Workflow:{"1":"Data Synthesis","2":"Smart Structuring","3":"Live Deployment"}]'
                      )
                    }
                  >
                    🔄 Steps Flow
                  </button>
                  <button
                    type="button"
                    className="chip chip-tool"
                    onClick={() =>
                      insertComponentSnippet(
                        "[quote:Artificial Intelligence is the new electricity.:Andrew Ng]"
                      )
                    }
                  >
                    💬 Quote
                  </button>
                </div>

                <div className="field">
                  <label htmlFor="slide-content">Slide content</label>
                  <textarea
                    id="slide-content"
                    rows={9}
                    value={current.content}
                    placeholder={"Write text, start lines with “- ” for bullets, or insert charts above"}
                    onChange={(e) => edit("content", e.target.value)}
                  />
                  <small className="muted field-hint" data-testid="content-count">
                    {current.content.length} characters
                  </small>
                </div>

                <div className="actions">
                  <span className="muted status" aria-live="polite">
                    {dirty ? "Unsaved changes" : status}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={duplicateCurrentSlide}
                    title="Duplicate slide"
                  >
                    📑 Duplicate
                  </button>
                  <ConfirmButton
                    label="Delete slide"
                    onConfirm={removeSlide}
                    className="btn btn-danger-outline"
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={discard}
                    disabled={!dirty}
                  >
                    Discard changes
                  </button>
                  <button type="submit" className="btn btn-save" disabled={!dirty}>
                    Save changes
                  </button>
                </div>
              </form>

              {/* Live Preview Card */}
              <div className="card luxury-card preview-card-wrapper">
                <div className="preview-top-bar">
                  <h3>Live preview</h3>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => setPresenting(true)}
                  >
                    ⛶ Fullscreen
                  </button>
                </div>

                <div className="design-row">
                  <div className="field">
                    <label htmlFor="theme-select">Theme</label>
                    <select
                      id="theme-select"
                      value={design.theme}
                      onChange={(e) => changeTheme(e.target.value)}
                    >
                      {THEMES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="layout-select">Layout</label>
                    <select
                      id="layout-select"
                      value={layout}
                      onChange={(e) => changeLayout(e.target.value)}
                    >
                      {LAYOUTS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <SlidePreview
                  title={current.title}
                  content={current.content}
                  slideNumber={index + 1}
                  totalSlides={slides.length}
                  theme={design.theme}
                  layout={layout}
                />

                <div className="slide-nav">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={goPrev}
                    disabled={!hasPrev}
                  >
                    ← Previous
                  </button>
                  <span className="muted" data-testid="slide-position">
                    Slide {index + 1} of {slides.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={goNext}
                    disabled={!hasNext}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="empty">
            <h2>No slides yet</h2>
            <p className="muted">Add your first slide to get started.</p>
            <button type="button" className="btn btn-accent" onClick={addSlide}>
              + Add slide
            </button>
          </div>
        )}

        {/* AI Copilot Drawer */}
        {copilotOpen && (
          <aside className="copilot-drawer glass-copilot" aria-label="AI Copilot">
            <div className="copilot-head">
              <div className="copilot-title">
                <span className="copilot-bot-icon">🤖</span>
                <div>
                  <strong>FLUXA Copilot</strong>
                  <span className="copilot-online-dot">Active (OpenRouter)</span>
                </div>
              </div>
              <button
                type="button"
                className="close-copilot-btn"
                onClick={() => setCopilotOpen(false)}
                aria-label="Close Copilot"
              >
                ✕
              </button>
            </div>

            <div className="copilot-messages-box">
              {copilotMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`copilot-bubble ${
                    msg.role === "user" ? "user-bubble" : "assistant-bubble"
                  }`}
                >
                  <div className="bubble-sender">{msg.role === "user" ? "You" : "FLUXA AI"}</div>
                  <div className="bubble-text">{msg.content}</div>
                </div>
              ))}
              {copilotBusy && (
                <div className="copilot-bubble assistant-bubble copilot-typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              )}
            </div>

            {/* Quick action chips */}
            <div className="copilot-quick-chips">
              <button
                type="button"
                className="chip chip-suggestion"
                disabled={copilotBusy}
                onClick={() => handleSendCopilot("Add a relevant data chart and metrics to this slide")}
              >
                📊 Add Chart & Metrics
              </button>
              <button
                type="button"
                className="chip chip-suggestion"
                disabled={copilotBusy}
                onClick={() => handleSendCopilot("Add a new conclusion slide with key takeaways")}
              >
                ➕ Add Conclusion Slide
              </button>
              <button
                type="button"
                className="chip chip-suggestion"
                disabled={copilotBusy}
                onClick={() => handleSendCopilot("Make the points more concise, punchy, and executive")}
              >
                ⚡ Make Executive & Concise
              </button>
              <button
                type="button"
                className="chip chip-suggestion"
                disabled={copilotBusy}
                onClick={() => handleSendCopilot("Delete current slide")}
              >
                🗑️ Delete Current Slide
              </button>
            </div>

            <form
              className="copilot-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCopilot();
              }}
            >
              <input
                type="text"
                placeholder="Ask AI: e.g. Add chart, edit slide 2, or add new slide…"
                value={copilotInput}
                disabled={copilotBusy}
                onChange={(e) => setCopilotInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-copilot-send"
                disabled={copilotBusy || !copilotInput.trim()}
              >
                Send
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Fullscreen Slideshow Presenter Modal */}
      {presenting && selected && (
        <div className="slideshow-overlay" role="dialog" aria-modal="true" aria-label="Presentation Slideshow">
          <div className="slideshow-header">
            <span className="slideshow-title">{presentation.title}</span>
            <div className="slideshow-controls">
              <span className="slideshow-counter">
                {index + 1} / {slides.length}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline close-present-btn"
                onClick={() => setPresenting(false)}
              >
                ✕ Exit (Esc)
              </button>
            </div>
          </div>

          <div className="slideshow-stage">
            <SlidePreview
              title={current.title}
              content={current.content}
              slideNumber={index + 1}
              totalSlides={slides.length}
              theme={design.theme}
              layout={layout}
            />
          </div>

          <div className="slideshow-footer">
            <button
              type="button"
              className="btn btn-slideshow-nav"
              onClick={goPrev}
              disabled={!hasPrev}
            >
              ◀ Prev
            </button>
            <div className="slideshow-progress">
              <div
                className="slideshow-progress-bar"
                style={{ width: `${((index + 1) / slides.length) * 100}%` }}
              />
            </div>
            <button
              type="button"
              className="btn btn-slideshow-nav"
              onClick={goNext}
              disabled={!hasNext}
            >
              Next ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}