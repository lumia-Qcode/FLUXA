import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { usePresentations } from "../PresentationsContext.jsx";
import PromptInput from "../components/PromptInput.jsx";

const SLIDE_COUNT_OPTIONS = [3, 5, 8, 10, 12, 15];
const AUDIENCES = ["General audience", "Executive / Leadership", "Investors & Pitch", "Engineers & Tech", "Students & Academic"];
const TONES = ["Professional & Strategic", "Data-Driven & Analytical", "Bold & Persuasive", "Inspirational & Creative"];

export default function CreatePresentation() {
  const navigate = useNavigate();
  const { refresh } = usePresentations();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [audience, setAudience] = useState("General audience");
  const [tone, setTone] = useState("Professional & Strategic");
  const [includeCharts, setIncludeCharts] = useState(true);
  const [language, setLanguage] = useState("English");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [genStep, setGenStep] = useState("");

  async function handleAiGenerate() {
    const cleanPrompt = prompt.trim();
    const cleanTitle = title.trim() || cleanPrompt.slice(0, 60);

    if (!cleanTitle) {
      setError("Enter a title or describe your topic to continue.");
      return;
    }

    setBusy(true);
    setError("");
    setGenStep("Connecting to OpenRouter AI models…");

    try {
      const topicWithContext = includeCharts
        ? `${cleanPrompt} (Tone: ${tone}. Include analytical charts, metrics, and data insights where appropriate.)`
        : `${cleanPrompt} (Tone: ${tone}.)`;

      setTimeout(() => setGenStep("Generating structural outline and pages…"), 1200);
      setTimeout(() => setGenStep("Filling slides with rich points and visual components…"), 3500);

      const res = await api.generatePresentation({
        topic: topicWithContext,
        slide_count: Number(slideCount),
        audience,
        language,
        title: cleanTitle,
      });

      const presId = res.presentation?.id;
      await refresh();
      if (presId) {
        navigate(`/presentations/${presId}`);
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(`AI Generation note: ${err.message}. You can still create a presentation manually below.`);
      setBusy(false);
      setGenStep("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanPrompt = prompt.trim();
    const cleanTitle = title.trim() || cleanPrompt.slice(0, 60);

    if (!cleanTitle) {
      setError("Enter a title or describe your topic to continue.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const { presentation } = await api.createPresentation({
        title: cleanTitle,
        description: cleanPrompt,
      });
      // Start presentation with a title slide
      await api.addSlide(presentation.id, { title: cleanTitle, content: cleanPrompt });
      await refresh();
      navigate(`/presentations/${presentation.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="narrow create-container">
      <div className="create-badge">
        <span className="pulse-dot" /> Next-Gen AI Deck Generator
      </div>
      <h1 className="hero-heading">Create a presentation</h1>
      <p className="muted hero-sub">
        Enter your topic, set your slide count and preferences, and let OpenRouter AI engineer a complete multi-slide deck with charts and insights.
      </p>

      {busy && genStep && (
        <div className="ai-loading-card" role="status" aria-live="polite">
          <div className="spinner-orbital" />
          <div className="loading-content">
            <h3>Generating Deck with OpenRouter AI</h3>
            <p className="loading-step-text">{genStep}</p>
            <div className="progress-bar-wrap">
              <div className="progress-bar-indeterminate" />
            </div>
          </div>
        </div>
      )}

      <form className="card form luxury-card" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="title">Presentation Title (optional)</label>
          <input
            id="title"
            type="text"
            value={title}
            disabled={busy}
            maxLength={120}
            placeholder="e.g. AI Transformation in Healthcare 2026"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <PromptInput value={prompt} onChange={setPrompt} disabled={busy} />

        {/* AI Presentation Customizer Controls */}
        <div className="ai-controls-grid">
          <div className="field">
            <label htmlFor="slide-count">Number of Slides ({slideCount})</label>
            <div className="slide-count-chips">
              {SLIDE_COUNT_OPTIONS.map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={busy}
                  className={`chip ${slideCount === num ? "active-chip" : ""}`}
                  onClick={() => setSlideCount(num)}
                >
                  {num} slides
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="audience-select">Target Audience</label>
            <select
              id="audience-select"
              value={audience}
              disabled={busy}
              onChange={(e) => setAudience(e.target.value)}
            >
              {AUDIENCES.map((aud) => (
                <option key={aud} value={aud}>
                  {aud}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tone-select">Tone & Style</label>
            <select
              id="tone-select"
              value={tone}
              disabled={busy}
              onChange={(e) => setTone(e.target.value)}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="lang-select">Language</label>
            <select
              id="lang-select"
              value={language}
              disabled={busy}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="English">English</option>
              <option value="Urdu">Urdu (Roman Urdu / English Mix)</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="German">German</option>
            </select>
          </div>
        </div>

        <div className="options-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeCharts}
              disabled={busy}
              onChange={(e) => setIncludeCharts(e.target.checked)}
            />
            <span>Include Data Charts, Metrics & Analytical Visuals</span>
          </label>
        </div>

        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}

        <div className="creation-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate("/")}
            disabled={busy}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn btn-ai-sparkle"
            onClick={handleAiGenerate}
            disabled={busy}
          >
            ✨ Generate with AI ({slideCount} slides)
          </button>

          <button type="submit" className="btn btn-secondary-create" disabled={busy}>
            {busy ? "Creating…" : "Create presentation"}
          </button>
        </div>
      </form>
    </div>
  );
}
