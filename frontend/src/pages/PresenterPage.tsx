import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { SlideStage } from "../rendering/SlideStage";
import { getTheme, Theme } from "../rendering/themes";
import { Dataset, Slide, Variable } from "../../../shared/spec";

export const PresenterPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [slides, setSlides] = useState<Slide[]>([]);
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [datasets, setDatasets] = useState<Record<string, Dataset>>({});
  const [variables, setVariables] = useState<Record<string, Variable>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [buildStep, setBuildStep] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);

  const channelRef = useRef<BroadcastChannel | null>(null);

  // Initialize presentation data
  useEffect(() => {
    async function fetchDeck() {
      try {
        const res = await fetch(`/api/presentations/${id}`);
        if (res.ok) {
          const data = await res.json();
          const p = data.presentation;
          if (p) {
            setSlides(p.slides || []);
            setDatasets(p.datasets || {});
            setVariables(p.variables || {});
            if (p.theme?.themeId) {
              setTheme(getTheme(p.theme.themeId));
            }
          }
        }
      } catch (err) {
        console.error("Failed to load presentation in presenter view", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDeck();
  }, [id]);

  // BroadcastChannel sync
  useEffect(() => {
    if (!id || typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(`fluxa_presentation_${id}`);
    channelRef.current = channel;

    channel.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === "sync") {
        if (typeof msg.slideIndex === "number") setCurrentIndex(msg.slideIndex);
        if (typeof msg.buildStep === "number") setBuildStep(msg.buildStep);
        if (msg.variables) setVariables(msg.variables);
        if (msg.datasets) setDatasets(msg.datasets);
        if (msg.slides) setSlides(msg.slides);
      }
    };

    // Request initial sync from active presenter
    channel.postMessage({ type: "request_sync" });

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [id]);

  // Timer effect
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const currentSlide = slides[currentIndex];
  const nextSlide = slides[currentIndex + 1];
  const currentSlideSpec = (currentSlide as any)?.spec?.blocks ? (currentSlide as any).spec : currentSlide;
  const currentNotes = (currentSlide as any)?.spec?.notes || currentSlide?.notes || "";

  // Send navigation event to main window
  const broadcastNav = (newIndex: number, newBuild: number) => {
    setCurrentIndex(newIndex);
    setBuildStep(newBuild);
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: "navigate",
        slideIndex: newIndex,
        buildStep: newBuild,
      });
    }
  };

  const handleNext = () => {
    if (!currentSlideSpec) return;
    const animatedBlocks = (currentSlideSpec.blocks || []).filter(
      (b: any) => b.animation && b.animation.length > 0
    );

    if (buildStep < animatedBlocks.length) {
      broadcastNav(currentIndex, buildStep + 1);
    } else if (currentIndex < slides.length - 1) {
      broadcastNav(currentIndex + 1, 0);
    }
  };

  const handlePrev = () => {
    if (buildStep > 0) {
      broadcastNav(currentIndex, buildStep - 1);
    } else if (currentIndex > 0) {
      const prevSlide = slides[currentIndex - 1];
      const prevSpec = (prevSlide as any)?.spec?.blocks ? (prevSlide as any).spec : prevSlide;
      const prevAnimated = (prevSpec?.blocks || []).filter(
        (b: any) => b.animation && b.animation.length > 0
      );
      broadcastNav(currentIndex - 1, prevAnimated.length);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${String(s).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-app, #101012)",
          color: "var(--ink, #EDEDEF)",
        }}
      >
        Loading presenter view…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#151517",
        color: "#EDEDEF",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Top Bar: Slide numbers, timer, controls */}
      <div
        style={{
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid #2C2C30",
          background: "#1C1C1F",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Presenter View</span>
          <span style={{ fontSize: "14px", color: "#A4A4AB" }}>
            Slide {currentIndex + 1} of {slides.length}
          </span>
          <span
            style={{
              fontSize: "12px",
              padding: "2px 8px",
              borderRadius: "4px",
              background: "#2C2C30",
              color: "#A4A4AB",
            }}
          >
            Build {buildStep}
          </span>
        </div>

        {/* Timer Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "20px", fontWeight: 700, fontFamily: "monospace" }}>
            {formatTimer(elapsedSeconds)}
          </span>
          <button
            type="button"
            onClick={() => setIsTimerRunning((r) => !r)}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #2C2C30",
              background: "#151517",
              color: "#EDEDEF",
              cursor: "pointer",
            }}
          >
            {isTimerRunning ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            onClick={() => setElapsedSeconds(0)}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #2C2C30",
              background: "#151517",
              color: "#EDEDEF",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>

        {/* Step Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0 && buildStep === 0}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              borderRadius: "4px",
              border: "1px solid #2C2C30",
              background: "#151517",
              color: "#EDEDEF",
              cursor: currentIndex === 0 && buildStep === 0 ? "default" : "pointer",
              opacity: currentIndex === 0 && buildStep === 0 ? 0.4 : 1,
            }}
          >
            ◀ Previous
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={currentIndex >= slides.length - 1}
            style={{
              padding: "6px 16px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "4px",
              border: "none",
              background: "var(--signal, #2352F5)",
              color: "#FFFFFF",
              cursor: currentIndex >= slides.length - 1 ? "default" : "pointer",
              opacity: currentIndex >= slides.length - 1 ? 0.4 : 1,
            }}
          >
            Next ▶
          </button>
        </div>
      </div>

      {/* Main 2-Panel Content Area */}
      <div style={{ flex: 1, display: "flex", padding: "16px", gap: "16px", overflow: "hidden" }}>
        {/* Left: Current Slide Live Preview */}
        <div
          style={{
            flex: 6,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            background: "#101012",
            border: "1px solid #2C2C30",
            borderRadius: "8px",
            padding: "12px",
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#A4A4AB" }}>CURRENT SLIDE</span>
          <div style={{ flex: 1, position: "relative" }}>
            {currentSlide && (
              <SlideStage
                slide={currentSlide}
                theme={theme}
                datasets={datasets}
                variables={variables}
                mode="present"
                buildStep={buildStep}
              />
            )}
          </div>
        </div>

        {/* Right: Next Slide Preview + Speaker Notes */}
        <div style={{ flex: 4, display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Next Slide Preview Box */}
          <div
            style={{
              flex: 4,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              background: "#101012",
              border: "1px solid #2C2C30",
              borderRadius: "8px",
              padding: "12px",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#A4A4AB" }}>NEXT SLIDE</span>
            <div style={{ flex: 1, position: "relative" }}>
              {nextSlide ? (
                <SlideStage
                  slide={nextSlide}
                  theme={theme}
                  datasets={datasets}
                  variables={variables}
                  mode="thumbnail"
                />
              ) : (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#75757B",
                    fontSize: "14px",
                  }}
                >
                  End of presentation
                </div>
              )}
            </div>
          </div>

          {/* Speaker Notes Area */}
          <div
            style={{
              flex: 6,
              background: "#1C1C1F",
              border: "1px solid #2C2C30",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              overflowY: "auto",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#A4A4AB" }}>SPEAKER NOTES</span>
            <div
              style={{
                fontSize: "18px",
                lineHeight: 1.6,
                color: "#EDEDEF",
                whiteSpace: "pre-wrap",
              }}
            >
              {currentNotes.trim() || "No speaker notes for this slide."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
