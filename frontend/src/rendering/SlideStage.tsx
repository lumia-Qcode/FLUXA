import React, { useEffect, useRef, useState } from "react";
import { Block, Dataset, Slide, Variable } from "../../../shared/spec";
import { BlockRenderer } from "./blocks/BlockRenderer";
import { getTheme, getThemeCssVariables, Theme } from "./themes";

export type StageMode = "edit" | "present" | "thumbnail" | "print" | "export";

export interface SlideStageProps {
  slide: Slide | any;
  theme?: Theme;
  themeOverrides?: Partial<Theme>;
  datasets?: Record<string, Dataset>;
  variables?: Record<string, Variable>;
  mode?: StageMode;
  buildStep?: number;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
  onControlChange?: (variable: string, value: any) => void;
  onNavigateSlide?: (slideId: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const LOGICAL_WIDTH = 1920;
const LOGICAL_HEIGHT = 1080;

export const SlideStage: React.FC<SlideStageProps> = ({
  slide,
  theme,
  themeOverrides,
  datasets,
  variables,
  mode = "edit",
  buildStep,
  selectedBlockId,
  onSelectBlock,
  onControlChange,
  onNavigateSlide,
  className = "",
  style = {},
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(1);

  const activeTheme = theme || getTheme();
  const cssVariables = getThemeCssVariables(activeTheme, themeOverrides);

  // ResizeObserver to calculate uniform scale factor
  useEffect(() => {
    if (mode === "print") {
      setScale(1);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;

      const scaleX = clientWidth / LOGICAL_WIDTH;
      const scaleY = clientHeight / LOGICAL_HEIGHT;
      // Letterbox uniformly
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);
    };

    updateScale();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateScale);
      ro.observe(container);
      return () => ro.disconnect();
    }
    return undefined;
  }, [mode]);

  // Normalize slide: could be pure Slide spec, DB slide with .spec, or legacy/draft slide
  const targetSlide = (slide?.spec?.blocks ? slide.spec : slide) || {};
  const backgroundColor =
    targetSlide.background?.color || slide?.background?.color || activeTheme.colors.bg || "#FFFFFF";
  const backgroundOpacity = targetSlide.background?.opacity ?? slide?.background?.opacity ?? 1;

  let blocks: Block[] = targetSlide.blocks || slide?.blocks || [];

  if (blocks.length === 0 && (slide?.title || slide?.content)) {
    const fallbackBlocks: Block[] = [];
    if (slide.title) {
      fallbackBlocks.push({
        id: `fallback-title-${slide.id || 0}`,
        type: "text",
        x: 100,
        y: 80,
        w: 1720,
        h: 120,
        role: "title",
        doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: String(slide.title) }] }] },
        style: { fontSize: 44, fontWeight: 700, align: "left" },
      });
    }
    if (slide.content) {
      fallbackBlocks.push({
        id: `fallback-body-${slide.id || 0}`,
        type: "text",
        x: 100,
        y: 220,
        w: 1720,
        h: 780,
        role: "body",
        doc: {
          type: "doc",
          content: String(slide.content)
            .split("\n")
            .filter(Boolean)
            .map((line: string) => ({
              type: "paragraph",
              content: [{ type: "text", text: line }],
            })),
        },
        style: { fontSize: 22, lineHeight: 1.6, align: "left" },
      });
    }
    blocks = fallbackBlocks;
  }

  const isInteractive = mode === "present" || mode === "edit";

  return (
    <div
      ref={containerRef}
      className={`slide-stage-viewport mode-${mode} ${className}`}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        background: mode === "present" ? "#000000" : "transparent",
        ...style,
      }}
    >
      {/* Fixed 1920x1080 logical canvas scaled via CSS transform */}
      <div
        className="slide-stage-canvas"
        style={{
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
          position: "relative",
          backgroundColor,
          opacity: backgroundOpacity,
          color: activeTheme.colors.text,
          overflow: "hidden",
          boxShadow:
            mode === "edit" || mode === "thumbnail"
              ? "0 8px 30px rgba(0, 0, 0, 0.12)"
              : "none",
          ...cssVariables,
        }}
      >
        {/* Render blocks in array order (z-order) */}
        {blocks.map((block: Block, bIdx: number) => {
          const isSelected = mode === "edit" && selectedBlockId === block.id;

          const isHiddenByBuild =
            buildStep !== undefined &&
            block.animation &&
            block.animation.length > 0 &&
            bIdx > buildStep;

          return (
            <div
              key={block.id}
              className={`stage-block ${isSelected ? "is-selected" : ""}`}
              style={{
                position: "absolute",
                left: `${block.x}px`,
                top: `${block.y}px`,
                width: `${block.w}px`,
                height: `${block.h}px`,
                transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
                transformOrigin: "center center",
                outline: isSelected ? "2px solid var(--signal, #2352F5)" : "none",
                outlineOffset: isSelected ? "2px" : "0",
                cursor: mode === "edit" ? "move" : "default",
                pointerEvents: mode === "thumbnail" ? "none" : isHiddenByBuild ? "none" : "auto",
                opacity: isHiddenByBuild ? 0 : 1,
                transition: "opacity 0.3s ease",
              }}
              onClick={(e) => {
                if (mode === "edit" && onSelectBlock) {
                  e.stopPropagation();
                  onSelectBlock(block.id);
                }
              }}
            >
              <BlockRenderer
                block={block}
                datasets={datasets}
                variables={variables}
                themeChartColors={activeTheme.colors.chart}
                interactive={isInteractive}
                onControlChange={onControlChange}
                onNavigateSlide={onNavigateSlide}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SlideStage;
