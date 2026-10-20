import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dataset, Slide } from "../../../shared/spec";
import { SlideStage } from "./SlideStage";
import { getTheme, Theme } from "./themes";

interface PresentModeProps {
  slides: Slide[] | any[];
  initialSlideIndex?: number;
  theme?: Theme;
  datasets?: Record<string, Dataset>;
  onClose: () => void;
  onControlChange?: (variable: string, value: any) => void;
}

export const PresentMode: React.FC<PresentModeProps> = ({
  slides,
  initialSlideIndex = 0,
  theme,
  datasets,
  onClose,
  onControlChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialSlideIndex);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isBlanked, setIsBlanked] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const totalSlides = slides.length;
  const currentSlide = slides[currentIndex] || slides[0];
  const activeTheme = theme || getTheme();

  // Request Fullscreen on mount
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {
        // Fullscreen API may require direct user gesture in some browsers
      });
    }

    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(totalSlides - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "b" || e.key === "B") {
        setIsBlanked((b) => !b);
      } else if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalSlides, onClose]);

  // Mouse activity auto-hiding HUD after 2 seconds
  useEffect(() => {
    const handleMouseMove = () => {
      setControlsVisible(true);
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const progressPercent = totalSlides > 0 ? ((currentIndex + 1) / totalSlides) * 100 : 0;

  return createPortal(
    <div
      className="fluxa-present-portal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "#000000",
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        cursor: controlsVisible ? "default" : "none",
        overflow: "hidden",
      }}
      onClick={() => {
        // Advance on slide background click
        if (currentIndex < totalSlides - 1) {
          setCurrentIndex((i) => i + 1);
        }
      }}
    >
      {/* Blackout Blank Overlay (B hotkey) */}
      {isBlanked ? (
        <div style={{ flex: 1, background: "#000000" }} />
      ) : (
        <div style={{ flex: 1, width: "100%", height: "100%", position: "relative" }}>
          {currentSlide && (
            <SlideStage
              slide={currentSlide}
              theme={activeTheme}
              datasets={datasets}
              mode="present"
              onControlChange={onControlChange}
            />
          )}
        </div>
      )}

      {/* Auto-Hiding Controls HUD */}
      <div
        className="present-controls-hud"
        style={{
          position: "absolute",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "rgba(18, 18, 20, 0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "24px",
          padding: "6px 16px",
          color: "#FFFFFF",
          fontSize: "13px",
          fontFamily: "system-ui, sans-serif",
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? "auto" : "none",
          transition: "opacity 0.25s ease-out",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={currentIndex <= 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          style={{
            background: "transparent",
            border: "none",
            color: currentIndex <= 0 ? "#666" : "#FFF",
            cursor: currentIndex <= 0 ? "default" : "pointer",
            fontSize: "15px",
            padding: "4px 8px",
          }}
          aria-label="Previous slide"
        >
          ◀
        </button>

        <span style={{ fontWeight: 600, minWidth: "55px", textAlign: "center" }}>
          {currentIndex + 1} / {totalSlides}
        </span>

        <button
          type="button"
          disabled={currentIndex >= totalSlides - 1}
          onClick={() => setCurrentIndex((i) => Math.min(totalSlides - 1, i + 1))}
          style={{
            background: "transparent",
            border: "none",
            color: currentIndex >= totalSlides - 1 ? "#666" : "#FFF",
            cursor: currentIndex >= totalSlides - 1 ? "default" : "pointer",
            fontSize: "15px",
            padding: "4px 8px",
          }}
          aria-label="Next slide"
        >
          ▶
        </button>

        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)", margin: "0 4px" }} />

        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#FFF",
            cursor: "pointer",
            fontSize: "12px",
            padding: "4px 8px",
            opacity: 0.8,
          }}
        >
          Exit (Esc)
        </button>
      </div>

      {/* Hairline Progress Indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "rgba(255, 255, 255, 0.12)",
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: "100%",
            background: "var(--signal, #2352F5)",
            transition: "width 0.2s ease-out",
          }}
        />
      </div>
    </div>,
    document.body
  );
};
