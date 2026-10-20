import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { SlideStage } from "../../rendering/SlideStage";
import { Theme } from "../../rendering/themes";
import { IconButton } from "../../ui/IconButton";
import { useDocument } from "../store/DocumentContext";

interface SlideSorterModalProps {
  open: boolean;
  theme: Theme;
  onClose: () => void;
}

export const SlideSorterModal: React.FC<SlideSorterModalProps> = ({ open, theme, onClose }) => {
  const { doc, selectedSlideId, setSelectedSlideId } = useDocument();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key.toLowerCase() === "g") && open) {
        onClose();
      }
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999990,
        background: "rgba(16, 16, 18, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--line)",
          userSelect: "none",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--ink)" }}>
            Slide Sorter
          </h2>
          <span style={{ fontSize: "12px", color: "var(--ink-2)" }}>
            {doc.slides.length} slides • Press G or Esc to close
          </span>
        </div>
        <IconButton label="Close (Esc)" icon={<X size={16} />} onClick={onClose} />
      </div>

      {/* Grid Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "20px",
          alignContent: "start",
        }}
      >
        {doc.slides.map((slide, idx) => {
          const isActive = slide.id === selectedSlideId;
          return (
            <div
              key={slide.id}
              onClick={() => {
                setSelectedSlideId(slide.id);
                onClose();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                cursor: "pointer",
                padding: "8px",
                background: isActive ? "var(--signal-weak)" : "var(--bg-panel)",
                border: "1px solid",
                borderColor: isActive ? "var(--signal)" : "var(--line)",
                borderRadius: "var(--radius-sm, 4px)",
                transition: "border-color 100ms ease",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: "#FFFFFF",
                  border: "1px solid var(--line)",
                  borderRadius: "2px",
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <SlideStage slide={slide} theme={theme} mode="thumbnail" />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: isActive ? "var(--signal)" : "var(--ink-2)",
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span>Slide {idx + 1}</span>
                {slide.layout && <span style={{ textTransform: "capitalize" }}>{slide.layout}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
