import React, { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { postStream } from "../runtime/streamClient";
import { PipelineTimeline } from "../components/outline/PipelineTimeline";
import "../components/outline/outline.css";
import {
  ArrowUp,
  Settings,
  ChevronDown,
  Loader2,
} from "lucide-react";

function sourceHost(c: { url?: string; title?: string; source?: string }): string {
  if (c.url) {
    try {
      return new URL(c.url).hostname.replace(/^www\./, "");
    } catch {
      /* not a URL */
    }
  }
  return c.title || c.source || "Source";
}

export const WorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { account, signOut } = useAuth();

  const [presentations, setPresentations] = useState<any[]>([]);
  const [_loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);

  // Hero prompt state
  const [promptText, setPromptText] = useState(
    "A board briefing on how hospitals are adopting AI. Seven slides, plain language, with one chart I can edit."
  );
  const [slideCount, setSlideCount] = useState(7);
  const [tone, setTone] = useState("Clinical");
  const [language, setLanguage] = useState("English");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAllDecks, setShowAllDecks] = useState(false);

  // Real-time Pipeline Feedback & Research Tracking
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<"research" | "outline" | "slides" | "completed" | "error">("research");
  const [researchStatusText, setResearchStatusText] = useState("Querying Google Scholar & empirical research databases...");
  const [pipelineCitations, setPipelineCitations] = useState<any[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<string>("");
  const [pipelineSlides, setPipelineSlides] = useState<any[]>([]);
  const [slideProgress, setSlideProgress] = useState<{ current: number; total: number; title?: string }>({
    current: 0,
    total: 7,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const [pipelineLog, setPipelineLog] = useState<string[]>([]);
  const [pipelineStartedAt, setPipelineStartedAt] = useState(0);
  const [pipelineElapsed, setPipelineElapsed] = useState(0);
  const addLog = (line: string) => setPipelineLog((l) => [...l, line]);

  useEffect(() => {
    if (!pipelineOpen || pipelinePhase === "completed" || pipelinePhase === "error") return undefined;
    const t = window.setInterval(() => setPipelineElapsed(Math.round((Date.now() - pipelineStartedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [pipelineOpen, pipelinePhase, pipelineStartedAt]);

  const loadPresentations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listPresentations();
      setPresentations(data.presentations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresentations();
  }, [loadPresentations]);

  const handleCreateFromPrompt = async () => {
    const topic = promptText.trim();
    if (!topic || isGenerating) return;

    setIsGenerating(true);
    setPipelineOpen(true);
    setPipelinePhase("research");
    setResearchStatusText(`Searching Google Scholar, PubMed & empirical databases for verified research on '${topic}'...`);
    setPipelineCitations([]);
    setPipelineSummary("");
    setPipelineSlides([]);
    setPipelineLog([`Brief sent: ${Number(slideCount) || 7} slides, ${tone}, ${language}`]);
    setPipelineStartedAt(Date.now());
    setPipelineElapsed(0);
    const requestedSlides = Number(slideCount) || 7;
    setSlideProgress({ current: 0, total: requestedSlides });

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      let isDone = false;
      await postStream(
        "/api/presentations/generate",
        {
          topic,
          title: topic.slice(0, 50),
          slide_count: requestedSlides,
          audience: tone || "General audience",
          language: language || "English",
          theme: "midnight",
          stream: true,
        },
        {
          onResearchStart: (data) => {
            setPipelinePhase("research");
            setResearchStatusText(data.status || "Querying Google Scholar & empirical sources...");
            addLog("Research started");
          },
          onResearchComplete: (data) => {
            setPipelinePhase("outline");
            addLog(`Research complete: ${Array.isArray(data.citations) ? data.citations.length : 0} sources`);
            if (Array.isArray(data.citations) && data.citations.length > 0) {
              setPipelineCitations(data.citations);
            }
            if (data.summary) {
              setPipelineSummary(data.summary);
            }
          },
          onText: (t) => {
            const m = /\[PROGRESS:\s*(.*?)\]/.exec(t?.delta || "");
            if (m) addLog(m[1]);
          },
          onOutline: (outline) => {
            setPipelinePhase("slides");
            addLog(`Outline ready: ${outline.slides?.length || 0} slides`);
            if (outline.slides) {
              setPipelineSlides(outline.slides);
              setSlideProgress((prev) => ({ ...prev, total: outline.slides.length }));
            }
            if (outline.research_dossier?.citations) {
              setPipelineCitations(outline.research_dossier.citations);
            }
          },
          onSlide: (slideData) => {
            setPipelinePhase("slides");
            addLog(`Slide ${slideData.index + 1} ready: ${slideData.slide?.title || ""}`);
            setSlideProgress((prev) => ({
              ...prev,
              current: slideData.index + 1,
              title: slideData.slide?.title,
            }));
          },
          onProgress: (prog) => {
            setSlideProgress((prev) => ({
              ...prev,
              current: prog.current,
              total: prog.total,
            }));
          },
          onDone: (doneData) => {
            isDone = true;
            addLog("Deck saved, opening it");
            setPipelinePhase("completed");
            const pid = doneData?.presentation?.id;
            setTimeout(() => {
              if (pid) {
                navigate(`/presentations/${pid}?view=overview`);
              } else {
                setPipelineOpen(false);
              }
            }, 700);
          },
          onError: (err) => {
            if (abortCtrl.signal.aborted || isDone) return;
            // No silent second generation: it doubled the wait and the AI cost.
            const msg = typeof err === "string" ? err : err?.message || "Generation stopped.";
            addLog(`Generation stopped: ${msg}`);
            setPipelinePhase("error");
          },
        },
        abortCtrl.signal
      );
      // The connection ended without "done" (server restarted, network dropped): say so instead
      // of leaving the modal open with the timer running forever.
      if (!isDone && !abortCtrl.signal.aborted) {
        addLog("The connection to the server closed before the deck was saved. Check your workspace, or try again.");
        setPipelinePhase("error");
      }
    } catch (err: any) {
      if (abortCtrl.signal.aborted) return;
      addLog(`Generation stopped: ${err?.message || "the connection was lost"}`);
      setPipelinePhase("error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancelPipeline = () => {
    abortControllerRef.current?.abort();
    setPipelineOpen(false);
    setIsGenerating(false);
  };

  const handleChipClick = (chipPrompt: string) => {
    setPromptText(chipPrompt);
  };

  // Find demo hospital deck if present
  const hospitalDeck = presentations.find((p) =>
    p.title.toLowerCase().includes("hospital")
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#09090B",
        color: "#F3F3F5",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          height: 60,
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #E5E7EB",
          backgroundColor: "#131316",
        }}
      >
        {/* Left: Brand Logo */}
        <div
          onClick={() => navigate("/")}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              backgroundColor: "#131316",
              color: "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            ≡
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
            FLUXA
          </span>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate("/brands")}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              backgroundColor: "#222226",
              color: "#D0D0D6",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Brands
          </button>
          <button
            type="button"
            onClick={() => setShowAllDecks((s) => !s)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              backgroundColor: showAllDecks ? "#2A2A2E" : "#222226",
              color: "#D0D0D6",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Library
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
            title={account ? `Signed in as ${account.user.email} (${account.org.name})` : undefined}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              backgroundColor: "#222226",
              color: "#D0D0D6",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            title="Settings"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #E5E7EB",
              backgroundColor: "#131316",
              color: "#B4B4BB",
              cursor: "pointer",
            }}
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main
        style={{
          flex: 1,
          maxWidth: 1040,
          width: "100%",
          margin: "0 auto",
          padding: "54px 24px 80px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Hero Headline */}
        <h1
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#F3F3F5",
            letterSpacing: "-0.03em",
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          What are you presenting?
        </h1>

        {/* Big Prompt Card (Matching Page 1 of PDF) */}
        <div
          style={{
            width: "100%",
            maxWidth: 820,
            backgroundColor: "#131316",
            border: "1px solid #E5E7EB",
            borderRadius: 24,
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0,0,0,0.02)",
            padding: "24px 28px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Textarea */}
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (promptText.trim() && !isGenerating) {
                  handleCreateFromPrompt();
                }
              }
            }}
            placeholder="A board briefing on how hospitals are adopting AI. Seven slides, plain language, with one chart I can edit."
            rows={3}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              fontSize: 17,
              lineHeight: 1.5,
              color: "#EDEDEF",
              fontFamily: "inherit",
              padding: 0,
            }}
          />

          {/* Bottom Bar inside Card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 8,
              borderTop: "1px solid #F3F4F6",
            }}
          >
            {/* Left Options Chips */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Slide Count Chip */}
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#1A1A1E",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#D0D0D6",
                  cursor: "pointer",
                }}
                onClick={() => setSlideCount((c) => (c >= 10 ? 5 : c + 1))}
              >
                <span>+</span>
                <span>{slideCount} slides</span>
                <ChevronDown size={13} color="#9A9AA3" />
              </button>

              {/* Tone/Clinical Chip */}
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#1A1A1E",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#D0D0D6",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setTone((t) => (t === "Clinical" ? "Executive" : t === "Executive" ? "Technical" : "Clinical"))
                }
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: "#111827",
                  }}
                />
                <span>{tone}</span>
                <ChevronDown size={13} color="#9A9AA3" />
              </button>

              {/* Language Chip */}
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#1A1A1E",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#D0D0D6",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setLanguage((l) => (l === "English" ? "Urdu" : l === "Urdu" ? "French" : "English"))
                }
              >
                <span>{language}</span>
                <ChevronDown size={13} color="#9A9AA3" />
              </button>
            </div>

            {/* Right: Round Blue Submit Button */}
            <button
              type="button"
              onClick={handleCreateFromPrompt}
              disabled={isGenerating || !promptText.trim()}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                backgroundColor: "#AFC0FF",
                color: "#09090B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: isGenerating ? "wait" : "pointer",
                opacity: isGenerating ? 0.7 : 1,
                boxShadow: "none",
                transition: "transform 100ms ease, background 150ms ease",
              }}
              title="Generate presentation"
            >
              {isGenerating ? (
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>

        {/* Suggestion Chips (Under Prompt Card) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 64,
          }}
        >
          {[
            "Pitch deck for a food delivery app",
            "Thesis defence on graph neural networks",
            "Quarterly marketing review",
          ].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChipClick(chip)}
              style={{
                padding: "7px 16px",
                borderRadius: 20,
                backgroundColor: "#131316",
                border: "1px solid #E5E7EB",
                color: "#9A9AA3",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#6A6A73";
                e.currentTarget.style.color = "#F3F3F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2A2A2E";
                e.currentTarget.style.color = "#9A9AA3";
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Recent Presentations Section */}
        <div style={{ width: "100%", maxWidth: 1000 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#F3F3F5", margin: 0 }}>
              Recent
            </h2>
            <button
              type="button"
              onClick={() => setShowAllDecks((s) => !s)}
              style={{
                background: "none",
                border: "none",
                color: "#AFC0FF",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {showAllDecks ? "Show less" : "Show all"}
            </button>
          </div>

          {/* 4 Cards Grid Matching Page 1 of PDF */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 20,
            }}
          >
            {/* Card 1: How hospitals are adopting AI */}
            <div
              onClick={() => {
                const targetId = hospitalDeck?.id || 29;
                navigate(`/presentations/${targetId}?view=overview`);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  height: 140,
                  backgroundColor: "#0F172A",
                  borderRadius: 16,
                  padding: "20px 18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  transition: "transform 150ms ease, box-shadow 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.25 }}>
                  How hospitals are<br />adopting AI
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                  A board briefing, October 2026
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F3F3F5" }}>
                  How hospitals are adopting AI
                </div>
                <div style={{ fontSize: 12, color: "#9A9AA3", marginTop: 2 }}>
                  Edited 2 hours ago · 7 slides
                </div>
              </div>
            </div>

            {/* Card 2: Thesis defence on graph neural networks */}
            <div
              onClick={() => {
                const gnn = presentations.find((p) => p.title.toLowerCase().includes("protein") || p.title.toLowerCase().includes("neural"));
                navigate(gnn ? `/presentations/${gnn.id}?view=overview` : `/presentations/14?view=overview`);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  height: 140,
                  backgroundColor: "#1B1B1F",
                  borderRadius: 16,
                  padding: "20px 18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  transition: "transform 150ms ease, box-shadow 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#EDEDEF", lineHeight: 1.25, fontFamily: "serif" }}>
                  Graph neural networks<br />for protein folding
                </div>
                <div style={{ fontSize: 11, color: "#9A9AA3" }}>
                  Thesis defence
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F3F3F5" }}>
                  Thesis defence
                </div>
                <div style={{ fontSize: 12, color: "#9A9AA3", marginTop: 2 }}>
                  Edited yesterday · 24 slides
                </div>
              </div>
            </div>

            {/* Card 3: Karahi Express pitch */}
            <div
              onClick={() => {
                const karahi = presentations.find((p) => p.title.toLowerCase().includes("karahi"));
                navigate(karahi ? `/presentations/${karahi.id}?view=overview` : `/presentations/14?view=overview`);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  height: 140,
                  backgroundColor: "#FBBF24",
                  borderRadius: 16,
                  padding: "20px 18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  transition: "transform 150ms ease, box-shadow 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: "#EDEDEF", lineHeight: 1.15 }}>
                  Karahi Express
                </div>
                <div style={{ fontSize: 11, color: "#78350F", fontWeight: 500 }}>
                  Seed round pitch
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F3F3F5" }}>
                  Karahi Express pitch
                </div>
                <div style={{ fontSize: 12, color: "#9A9AA3", marginTop: 2 }}>
                  Edited 3 days ago · 10 slides
                </div>
              </div>
            </div>

            {/* Card 4: Q3 marketing review */}
            <div
              onClick={() => {
                const q3 = presentations.find((p) => p.title.toLowerCase().includes("marketing") || p.title.toLowerCase().includes("q3"));
                navigate(q3 ? `/presentations/${q3.id}?view=overview` : `/presentations/14?view=overview`);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  height: 140,
                  backgroundColor: "#111827",
                  borderRadius: 16,
                  padding: "20px 18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  transition: "transform 150ms ease, box-shadow 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#FFFFFF" }}>
                  Q3 marketing review
                </div>
                {/* Green wavy line chart decoration */}
                <svg
                  style={{ width: "100%", height: 40 }}
                  viewBox="0 0 100 40"
                  fill="none"
                >
                  <path
                    d="M0 35 Q 25 30, 45 22 T 80 12 T 100 8"
                    stroke="#10B981"
                    strokeWidth="3"
                    fill="none"
                  />
                </svg>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F3F3F5" }}>
                  Q3 marketing review
                </div>
                <div style={{ fontSize: 12, color: "#9A9AA3", marginTop: 2 }}>
                  Edited last week · 12 slides
                </div>
              </div>
            </div>
          </div>

          {/* Show All Expanded Decks (if clicked) */}
          {showAllDecks && (
            <div style={{ marginTop: 40 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#D0D0D6" }}>
                All Presentations ({presentations.length})
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {presentations.map((deck) => (
                  <div
                    key={deck.id}
                    onClick={() => navigate(`/presentations/${deck.id}?view=overview`)}
                    style={{
                      padding: 14,
                      backgroundColor: "#131316",
                      border: "1px solid #E5E7EB",
                      borderRadius: 12,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#F3F3F5" }}>{deck.title}</div>
                    <div style={{ fontSize: 12, color: "#9A9AA3", marginTop: 4 }}>
                      {deck.slide_count || 1} slides
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* AI generation pipeline: vertical timeline with live log */}
      {pipelineOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Building your presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.72)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "6vh 16px 16px",
            overflowY: "auto",
          }}
        >
          <div
            className="fx-outline fx-embed"
            style={{
              width: "100%",
              maxWidth: 720,
              backgroundColor: "#131316",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 20,
              padding: "24px 24px 20px",
            }}
          >
            <PipelineTimeline
              heading={
                pipelinePhase === "completed"
                  ? "Your presentation is ready"
                  : pipelinePhase === "error"
                    ? "Generation stopped"
                    : "Building your presentation"
              }
              subheading={promptText.length > 140 ? `${promptText.slice(0, 140)}…` : promptText}
              elapsedSeconds={pipelineElapsed}
              log={pipelineLog}
              onCancel={
                pipelinePhase === "completed"
                  ? undefined
                  : pipelinePhase === "error"
                    ? () => setPipelineOpen(false)
                    : handleCancelPipeline
              }
              cancelLabel={pipelinePhase === "error" ? "Close" : "Cancel"}
              steps={[
                {
                  id: "research",
                  title: "Research",
                  status:
                    pipelinePhase === "research"
                      ? "active"
                      : pipelinePhase === "error" && pipelineCitations.length === 0
                        ? "error"
                        : "done",
                  note:
                    pipelinePhase === "research"
                      ? researchStatusText
                      : pipelineCitations.length > 0
                        ? `${pipelineCitations.length} sources found`
                        : "Done",
                  detail:
                    pipelineCitations.length > 0 ? (
                      <div className="fx-chips-row">
                        {pipelineCitations.slice(0, 8).map((c: any, i: number) => (
                          <a
                            key={i}
                            className="fx-ref"
                            href={c.url || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={c.title || c.url}
                          >
                            <span>{i + 1}</span>
                            <span>{sourceHost(c)}</span>
                          </a>
                        ))}
                      </div>
                    ) : undefined,
                },
                {
                  id: "outline",
                  title: "Outline",
                  status:
                    pipelinePhase === "research"
                      ? "pending"
                      : pipelinePhase === "outline"
                        ? "active"
                        : pipelinePhase === "error" && pipelineSlides.length === 0
                          ? "error"
                          : "done",
                  note:
                    pipelineSlides.length > 0
                      ? `${pipelineSlides.length} slides planned`
                      : pipelineSummary || "Structuring the story",
                  detail:
                    pipelineSlides.length > 0 ? (
                      <ol className="fx-titles">
                        {pipelineSlides.map((sl: any, i: number) => (
                          <li key={i}>{sl.title}</li>
                        ))}
                      </ol>
                    ) : undefined,
                },
                {
                  id: "slides",
                  title: "Slides",
                  status:
                    pipelinePhase === "slides"
                      ? "active"
                      : pipelinePhase === "completed"
                        ? "done"
                        : pipelinePhase === "error" && pipelineSlides.length > 0
                          ? "error"
                          : "pending",
                  note:
                    pipelinePhase === "slides" || pipelinePhase === "completed"
                      ? `${slideProgress.current} of ${slideProgress.total} ready${slideProgress.title ? `: ${slideProgress.title}` : ""}`
                      : undefined,
                  detail:
                    pipelinePhase === "slides" || pipelinePhase === "completed" ? (
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={slideProgress.total}
                        aria-valuenow={slideProgress.current}
                        style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}
                      >
                        <span
                          style={{
                            display: "block",
                            height: "100%",
                            width: `${slideProgress.total ? Math.min(100, Math.round((slideProgress.current / slideProgress.total) * 100)) : 0}%`,
                            background: "linear-gradient(90deg, #5eead4, #38bdf8, #3b82f6)",
                            transition: "width 300ms ease",
                          }}
                        />
                      </div>
                    ) : undefined,
                },
                { id: "open", title: "Open the deck", status: pipelinePhase === "completed" ? "active" : "pending" },
              ]}
            />
            {pipelinePhase === "error" && (
              <p role="alert" style={{ margin: "14px 0 0", color: "#fca5a5", fontSize: 13 }}>
                The AI service hit a problem. Try again, or change the prompt.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};