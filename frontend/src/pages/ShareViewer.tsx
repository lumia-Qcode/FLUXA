import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Slide } from "../../../shared/spec";
import { SlideStage } from "../rendering/SlideStage";
import { getTheme, Theme } from "../rendering/themes";

export const ShareViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [presentation, setPresentation] = useState<any>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDeck() {
      try {
        setLoading(true);
        const res = await fetch(`/api/presentations/${id}`);
        if (!res.ok) {
          throw new Error("Presentation not found or no longer shared.");
        }
        const data = await res.json();
        setPresentation(data.presentation);
        setSlides(data.presentation.slides || []);
      } catch (err: any) {
        setError(err.message || "Failed to load presentation.");
      } finally {
        setLoading(false);
      }
    }
    fetchDeck();
  }, [id]);

  const slidesCount = slides.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (slidesCount === 0) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(slidesCount - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slidesCount]);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#111", color: "#FFF" }}>
        Loading presentation…
      </div>
    );
  }

  if (error || !presentation || slides.length === 0) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#111", color: "#FFF", flexDirection: "column", gap: "1rem" }}>
        <h2>Presentation Unavailable</h2>
        <p style={{ color: "#9CA3AF" }}>{error || "No slides found in this presentation."}</p>
      </div>
    );
  }

  const themeId = typeof presentation.theme === "string" ? presentation.theme : presentation.theme?.themeId;
  const theme: Theme = getTheme(themeId);
  const currentSlide = slides[currentIndex];

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ flex: 1, width: "100%", height: "100%" }}>
        {currentSlide && (
          <SlideStage
            slide={currentSlide}
            theme={theme}
            datasets={presentation.datasets}
            mode="present"
          />
        )}
      </div>

      {/* Floating HUD navigation */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "rgba(20, 20, 24, 0.85)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "20px",
          padding: "6px 16px",
          color: "#FFFFFF",
          fontSize: "13px",
        }}
      >
        <button
          type="button"
          data-testid="viewer-prev"
          aria-label="Previous slide"
          disabled={currentIndex <= 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          style={{ background: "none", border: "none", color: currentIndex <= 0 ? "#555" : "#FFF", cursor: "pointer" }}
        >
          ◀
        </button>
        <span style={{ fontWeight: 600 }} data-testid="viewer-counter">
          {currentIndex + 1} / {slides.length}
        </span>
        <button
          type="button"
          data-testid="viewer-next"
          aria-label="Next slide"
          disabled={currentIndex >= slides.length - 1}
          onClick={() => setCurrentIndex((i) => Math.min(slides.length - 1, i + 1))}
          style={{ background: "none", border: "none", color: currentIndex >= slides.length - 1 ? "#555" : "#FFF", cursor: "pointer" }}
        >
          ▶
        </button>
      </div>
    </div>
  );
};
