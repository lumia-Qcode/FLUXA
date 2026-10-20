import React from "react";
import { LayoutId } from "../../../../shared/spec";
import { LAYOUTS } from "../../rendering/layouts";
import { THEMES } from "../../rendering/themes";
import { Field } from "../../ui/Field";
import { commands } from "../store/documentStore";
import { useDocument } from "../store/DocumentContext";

export const SlideInspector: React.FC = () => {
  const { doc, selectedSlide, execute } = useDocument();

  if (!selectedSlide) return null;

  const currentLayoutId = selectedSlide.layout || "title";
  const currentThemeId = doc.theme.themeId || "clean-light";

  const handleApplyLayout = (layoutId: LayoutId) => {
    execute("Apply Layout", commands.setSlideLayout(selectedSlide.id, layoutId));
  };

  const handleApplyTheme = (themeId: string) => {
    execute("Apply Theme", commands.setDeckTheme(themeId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "12px" }}>
      {/* 1. Layout Gallery */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          SLIDE LAYOUT
        </span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
          }}
        >
          {LAYOUTS.map((layout) => {
            const isSelected = layout.id === currentLayoutId;
            return (
              <button
                key={layout.id}
                type="button"
                onClick={() => handleApplyLayout(layout.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "4px",
                  padding: "6px 8px",
                  background: isSelected ? "var(--signal-weak)" : "var(--bg-app)",
                  border: "1px solid",
                  borderColor: isSelected ? "var(--signal)" : "var(--line)",
                  borderRadius: "var(--radius-sm, 4px)",
                  cursor: "pointer",
                  textAlign: "left",
                  userSelect: "none",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? "var(--signal-weak-text)" : "var(--ink)",
                  }}
                >
                  {layout.name}
                </span>
                <span style={{ fontSize: "10px", color: "var(--ink-3)", lineHeight: 1.2 }}>
                  {layout.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Theme Gallery */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          DECK THEME
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {THEMES.map((theme) => {
            const isSelected = theme.id === currentThemeId;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleApplyTheme(theme.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  background: isSelected ? "var(--signal-weak)" : "var(--bg-panel)",
                  border: "1px solid",
                  borderColor: isSelected ? "var(--signal)" : "var(--line)",
                  borderRadius: "var(--radius-sm, 4px)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: theme.colors.bg,
                      border: "1px solid var(--line)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "var(--signal-weak-text)" : "var(--ink)",
                    }}
                  >
                    {theme.name}
                  </span>
                </div>
                {/* Palette dots */}
                <div style={{ display: "flex", gap: "3px" }}>
                  {theme.colors.chart.slice(0, 4).map((c, i) => (
                    <div
                      key={i}
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: c,
                      }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Slide Background */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          SLIDE BACKGROUND
        </span>
        <Field
          label="Custom Background Color"
          type="color"
          value={selectedSlide.background?.color || "#FFFFFF"}
          onChange={(e) => execute("Set Background", commands.setSlideBackground(selectedSlide.id, e.target.value))}
        />
      </div>

      {/* 4. Speaker Notes */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          SPEAKER NOTES
        </span>
        <textarea
          rows={4}
          value={selectedSlide.notes || ""}
          placeholder="Add presenter notes for this slide…"
          onChange={(e) => execute("Set Notes", commands.setSlideNotes(selectedSlide.id, e.target.value))}
          style={{
            width: "100%",
            fontSize: "12px",
            fontFamily: "var(--font-sans)",
            padding: "8px",
            background: "var(--bg-app)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm, 4px)",
            color: "var(--ink)",
            outline: "none",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
};
