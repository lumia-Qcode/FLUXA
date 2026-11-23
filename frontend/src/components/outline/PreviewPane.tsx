import React from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { SlideStage } from "../../rendering/SlideStage";
import { ChatInput } from "../../editor/copilot/ChatInput";
import type { LayoutDefinition } from "../../rendering/layouts";
import { layoutRects } from "./previewSpec";

export const QUICK_ACTIONS = ["Make it shorter", "Add a conclusion", "More technical", "Add examples"];

export interface PreviewPaneProps {
  slide: unknown;
  theme: unknown;
  themeName: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  layouts: LayoutDefinition[];
  layoutId?: string;
  onLayout: (id: string) => void;
  onRefine: (instruction: string) => void;
  onStopRefine: () => void;
  refining: boolean;
  status?: string;
  disabled?: boolean;
}

const ROLE_FILL: Record<string, string> = {
  title: "#0f1b3d",
  subtitle: "#7c87a6",
  body: "#b8c2d9",
  aside: "#b8c2d9",
  media: "#93c5fd",
  chart: "#5eead4",
  kpi: "#fcd34d",
  footer: "#dfe4ee",
};

const LayoutMini: React.FC<{ layout: LayoutDefinition }> = ({ layout }) => (
  <svg viewBox="0 0 80 45" aria-hidden="true">
    <rect width="80" height="45" fill="#ffffff" />
    {layoutRects(layout).map((r, i) => (
      <rect key={i} x={r.x} y={r.y} width={Math.max(1, r.w)} height={Math.max(1, r.h)} rx="1.5" fill={ROLE_FILL[r.role] || "#cbd5e1"} />
    ))}
  </svg>
);

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  slide,
  theme,
  themeName,
  index,
  total,
  onPrev,
  onNext,
  layouts,
  layoutId,
  onLayout,
  onRefine,
  onStopRefine,
  refining,
  status,
  disabled,
}) => (
  <aside className="fx-pane-preview" aria-label="Live slide preview">
    <section className="fx-stage">
      <div className="fx-stage-head">
        <div>
          <strong>
            Slide {index + 1} of {total}
          </strong>{" "}
          <span>in {themeName}</span>
        </div>
        <div className="fx-stage-nav">
          <button type="button" onClick={onPrev} disabled={index <= 0} aria-label="Previous slide">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={onNext} disabled={index >= total - 1} aria-label="Next slide">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="fx-slide">
        {/* @ts-expect-error preview spec is built at runtime from the outline item */}
        <SlideStage slide={slide} theme={theme} mode="thumbnail" />
      </div>
      <div className="fx-layouts" role="group" aria-label={`Layout for slide ${index + 1}`}>
        {layouts.map((l) => (
          <button
            key={l.id}
            type="button"
            className="fx-layout"
            aria-pressed={l.id === layoutId}
            onClick={() => onLayout(l.id)}
            disabled={disabled}
            title={l.description}
          >
            <LayoutMini layout={l} />
            <span>{l.name}</span>
          </button>
        ))}
      </div>
    </section>

    <section className="fx-paper fx-ask" aria-labelledby="fx-ask-title">
      <div className="fx-ask-head">
        <span className="fx-spark" aria-hidden="true">
          <Sparkles size={16} />
        </span>
        <div>
          <h2 id="fx-ask-title">Refine with AI</h2>
          <p>Changes apply to the whole outline</p>
        </div>
      </div>
      <div className="fx-quick" role="group" aria-label="Quick refinements">
        {QUICK_ACTIONS.map((a) => (
          <button key={a} type="button" onClick={() => onRefine(a)} disabled={refining || disabled}>
            {a}
          </button>
        ))}
      </div>
      {status && (
        <p className="fx-status" role="status">
          {status}
        </p>
      )}
      <ChatInput
        onSend={onRefine}
        onStop={onStopRefine}
        isStreaming={refining}
        placeholder="Refine your outline..."
        ariaLabel="Refine your outline"
      />
    </section>
  </aside>
);
