import React, { useState } from "react";
import { Play, Plus } from "lucide-react";
import { AnimationStep, Transition } from "../../../../shared/spec";
import { Button } from "../../ui/Button";
import { NumberField } from "../../ui/NumberField";
import { Select } from "../../ui/Select";
import { useDocument } from "../store/DocumentContext";

export const AnimateInspector: React.FC = () => {
  const { doc, selectedSlide, selectedBlockIds, setSelectedBlockIds, execute } = useDocument();

  const [previewing, setPreviewing] = useState<boolean>(false);

  if (!selectedSlide) {
    return (
      <div style={{ padding: "16px", color: "var(--ink-2)", fontSize: "13px" }}>
        No slide selected.
      </div>
    );
  }

  const activeBlock = selectedSlide.blocks.find((b) => selectedBlockIds.includes(b.id)) || null;

  // Slide transition settings
  const currentTransition: Transition = selectedSlide.transition || {
    effect: doc.settings?.transition?.effect || "fade",
    duration: doc.settings?.transition?.duration || 300,
  };

  const handleSetSlideTransition = (effect: any) => {
    execute("Set Slide Transition", (draft) => {
      const s = draft.slides.find((sl) => sl.id === selectedSlide.id);
      if (s) {
        s.transition = { ...currentTransition, effect };
      }
    });
  };

  const handleSetTransitionDuration = (duration: number) => {
    execute("Set Transition Duration", (draft) => {
      const s = draft.slides.find((sl) => sl.id === selectedSlide.id);
      if (s) {
        s.transition = { ...currentTransition, duration };
      }
    });
  };

  // Block Animation Step Settings
  const blockAnimation: AnimationStep[] = activeBlock?.animation || [];
  const currentStep: AnimationStep = blockAnimation[0] || {
    effect: "fade",
    trigger: "onClick",
    duration: 300,
    delay: 0,
  };

  const handleAddBlockAnimation = () => {
    if (!activeBlock) return;
    execute("Add Block Animation", (draft) => {
      const s = draft.slides.find((sl) => sl.id === selectedSlide.id);
      if (!s) return;
      const b = s.blocks.find((bl) => bl.id === activeBlock.id);
      if (b) {
        b.animation = [
          {
            effect: "fade",
            trigger: "onClick",
            duration: 300,
            delay: 0,
          },
        ];
      }
    });
  };

  const handleUpdateBlockAnimation = (patch: Partial<AnimationStep>) => {
    if (!activeBlock) return;
    execute("Update Block Animation", (draft) => {
      const s = draft.slides.find((sl) => sl.id === selectedSlide.id);
      if (!s) return;
      const b = s.blocks.find((bl) => bl.id === activeBlock.id);
      if (b && b.animation && b.animation.length > 0) {
        b.animation[0] = { ...b.animation[0], ...patch };
      }
    });
  };

  const handleRemoveBlockAnimation = () => {
    if (!activeBlock) return;
    execute("Remove Block Animation", (draft) => {
      const s = draft.slides.find((sl) => sl.id === selectedSlide.id);
      if (!s) return;
      const b = s.blocks.find((bl) => bl.id === activeBlock.id);
      if (b) {
        delete b.animation;
      }
    });
  };

  // Build Sequence Preview
  const handlePreviewBuilds = () => {
    setPreviewing(true);
    setTimeout(() => {
      setPreviewing(false);
    }, 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px", userSelect: "none" }}>
      {/* Slide Transition Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          SLIDE TRANSITION
        </span>
        <Select
          label="Transition"
          value={currentTransition.effect}
          options={[
            { value: "none", label: "None" },
            { value: "fade", label: "Fade" },
            { value: "push", label: "Push" },
            { value: "zoom", label: "Zoom" },
          ]}
          onChange={handleSetSlideTransition}
        />
        {currentTransition.effect !== "none" && (
          <NumberField
            label="Duration (ms)"
            value={currentTransition.duration}
            min={100}
            max={1500}
            step={50}
            onChange={handleSetTransitionDuration}
          />
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line)" }} />

      {/* Selected Block Animation Step */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
            BLOCK ENTRANCE
          </span>
          {activeBlock && blockAnimation.length > 0 && (
            <button
              type="button"
              onClick={handleRemoveBlockAnimation}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--danger, #C4262E)",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          )}
        </div>

        {activeBlock ? (
          blockAnimation.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Select
                label="Effect"
                value={currentStep.effect}
                options={[
                  { value: "fade", label: "Fade" },
                  { value: "rise", label: "Rise" },
                  { value: "slide", label: "Slide" },
                  { value: "zoom", label: "Zoom" },
                  { value: "wipe", label: "Wipe" },
                  { value: "draw", label: "Draw" },
                  { value: "countUp", label: "Count Up (KPI)" },
                ]}
                onChange={(effect: any) => handleUpdateBlockAnimation({ effect })}
              />
              <Select
                label="Trigger"
                value={currentStep.trigger}
                options={[
                  { value: "onClick", label: "On Click (Build Step)" },
                  { value: "onEnter", label: "With Slide Enter" },
                  { value: "afterPrev", label: "After Previous" },
                  { value: "withPrev", label: "With Previous" },
                ]}
                onChange={(trigger: any) => handleUpdateBlockAnimation({ trigger })}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <NumberField
                  label="Duration (ms)"
                  value={currentStep.duration || 300}
                  min={100}
                  max={1000}
                  step={50}
                  onChange={(duration) => handleUpdateBlockAnimation({ duration })}
                />
                <NumberField
                  label="Delay (ms)"
                  value={currentStep.delay || 0}
                  min={0}
                  max={2000}
                  step={50}
                  onChange={(delay) => handleUpdateBlockAnimation({ delay })}
                />
              </div>
            </div>
          ) : (
            <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={handleAddBlockAnimation}>
              Add Animation
            </Button>
          )
        ) : (
          <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>
            Select a block on canvas to configure its animation.
          </span>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line)" }} />

      {/* Slide Build Sequence Order */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
            BUILD ORDER ({selectedSlide.blocks.filter((b) => b.animation?.length).length} animated)
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={<Play size={12} />}
            onClick={handlePreviewBuilds}
            title="Preview builds"
          >
            {previewing ? "Playing…" : "Preview"}
          </Button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {selectedSlide.blocks.map((b, idx) => {
            const isAnimated = Boolean(b.animation && b.animation.length > 0);
            const isSelected = selectedBlockIds.includes(b.id);

            return (
              <div
                key={b.id}
                onClick={() => setSelectedBlockIds([b.id])}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  background: isSelected ? "var(--signal-weak)" : "var(--bg-app)",
                  border: isSelected ? "1px solid var(--signal)" : "1px solid var(--line)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "var(--ink-3)", fontFamily: "monospace", width: "16px" }}>
                    {idx + 1}
                  </span>
                  <span style={{ color: "var(--ink)", fontWeight: isSelected ? 600 : 400, textTransform: "capitalize" }}>
                    {b.name || `${b.type} block`}
                  </span>
                </div>
                {isAnimated ? (
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "1px 6px",
                      borderRadius: "3px",
                      background: "rgba(35, 82, 245, 0.12)",
                      color: "var(--signal)",
                      fontWeight: 600,
                    }}
                  >
                    {b.animation![0].effect}
                  </span>
                ) : (
                  <span style={{ fontSize: "10px", color: "var(--ink-3)" }}>Instant</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
