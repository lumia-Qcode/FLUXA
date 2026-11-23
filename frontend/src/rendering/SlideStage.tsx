import React, { useEffect, useRef, useState } from "react";
import { Block, Dataset, Slide, Variable } from "../../../shared/spec";
import { BlockRenderer } from "./blocks/BlockRenderer";
import { getTheme, getThemeCssVariables, isDarkColor, Theme, ThemeOverrides } from "./themes";

export type StageMode = "edit" | "present" | "thumbnail" | "print" | "export";

export interface SlideStageProps {
  slide: Slide | any;
  theme?: Theme;
  themeOverrides?: ThemeOverrides | Partial<Theme>;
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
  const bgVal =
    targetSlide.background?.value ||
    targetSlide.background?.color ||
    slide?.background?.value ||
    slide?.background?.color;

  // A branded deck (F6) uses its brand background; unbranded decks keep the built-in canvas.
  const brandBg = activeTheme.brandId ? activeTheme.colors.bg : undefined;

  const isDarkTheme = brandBg
    ? isDarkColor(bgVal && bgVal !== "transparent" ? bgVal : brandBg)
    : activeTheme.colors.bg === "#0B1120" ||
    activeTheme.colors.bg === "#0F172A" ||
    activeTheme.colors.bg?.startsWith("#0") ||
    activeTheme.colors.bg?.startsWith("#1") ||
    activeTheme.id === "midnight" ||
    activeTheme.id === "bold-poster" ||
    bgVal === "#0B1120" ||
    bgVal === "#0F172A";

  const canvasBackground =
    bgVal && bgVal !== "transparent" && bgVal !== "#FFFFFF"
      ? bgVal
      : brandBg
      ? brandBg
      : isDarkTheme
      ? "radial-gradient(circle at 12% 18%, rgba(56, 189, 248, 0.18) 0%, transparent 45%), radial-gradient(circle at 88% 82%, rgba(99, 102, 241, 0.16) 0%, transparent 45%), radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.85) 0%, transparent 100%), #0B1120"
      : // Light themes paint their own background: the old dark navy here sat under dark theme
        // text, which made titles on light-theme decks unreadable.
        `radial-gradient(ellipse at 88% 12%, rgba(56, 189, 248, 0.06) 0%, transparent 50%), ${activeTheme.colors.bg || "#FFFFFF"}`;

  const backgroundColor = canvasBackground;
  const backgroundOpacity = targetSlide.background?.opacity ?? slide?.background?.opacity ?? 1;

  let blocks: Block[] = targetSlide.blocks || slide?.blocks || [];

  if (blocks.length === 0 && (slide?.title || slide?.content)) {
    const isFirst = slide?.slide_order === 1 || slide?.id === 1 || slide?.order === 0;
    const fallbackBlocks: any[] = [];
    if (slide.title) {
      fallbackBlocks.push({
        id: `fallback-title-${slide.id || 0}`,
        type: "text",
        x: isFirst ? 160 : 100,
        y: isFirst ? 320 : 80,
        w: isFirst ? 1600 : 1720,
        h: isFirst ? 220 : 120,
        role: "title",
        content: String(slide.title),
        doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: String(slide.title) }] }] },
        style: { fontSize: isFirst ? 64 : 52, fontWeight: 700, align: isFirst ? "center" : "left" },
      });
    }
    if (slide.content) {
      const bulletLines = String(slide.content)
        .split("\n")
        .map((l: string) => l.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean);

      fallbackBlocks.push({
        id: `fallback-body-${slide.id || 0}`,
        type: "text",
        x: isFirst ? 240 : 100,
        y: isFirst ? 560 : 240,
        w: isFirst ? 1440 : 1720,
        h: isFirst ? 160 : 720,
        role: isFirst ? "subtitle" : "body",
        content: String(slide.content),
        bullets: isFirst ? undefined : bulletLines,
        doc: {
          type: "doc",
          content: bulletLines.map((line: string) => ({
            type: "paragraph",
            content: [{ type: "text", text: line }],
          })),
        },
        style: {
          fontSize: isFirst ? 32 : 28,
          lineHeight: 1.6,
          align: isFirst ? "center" : "left",
          color: isFirst ? "var(--ink-2, #64748B)" : "inherit",
        },
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
          // `background`, not `backgroundColor`: the canvas value is often a gradient, which
          // background-color rejects, leaving the slide transparent (white titles on the light editor).
          background: backgroundColor,
          opacity: backgroundOpacity,
          color: activeTheme.colors.text,
          overflow: "hidden",
          boxShadow:
            mode === "edit" || mode === "thumbnail"
              ? "0 8px 30px rgba(0, 0, 0, 0.12)"
              : "none",
          ...cssVariables,
          // Generated slides colour subtitles/footers with the app's text tokens (--ink-2/--ink-3),
          // which are dark greys meant for light panels. Inside the slide they follow the slide.
          ...(isDarkTheme
            ? { "--ink": "#F1F5F9", "--ink-2": "#CBD5E1", "--ink-3": "#94A3B8" }
            : { "--ink": "#1D1D1F", "--ink-2": "#4B5563", "--ink-3": "#6B7280" }),
        } as React.CSSProperties}
      >
        {/* Top Accent Gradient Bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "7px",
            background: "linear-gradient(90deg, var(--theme-primary, #2563EB) 0%, #38BDF8 60%, var(--theme-accent, #6366F1) 100%)",
            zIndex: 10,
          }}
        />

        {/* Top Right Slide Numbering */}
        <div
          style={{
            position: "absolute",
            top: "24px",
            right: "100px",
            fontSize: "14px",
            fontWeight: 700,
            color: isDarkTheme ? "#94A3B8" : "#64748B",
            letterSpacing: "0.05em",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          SLIDE {slide?.order !== undefined ? String(slide.order + 1).padStart(2, "0") : (slide?.slide_order ? String(slide.slide_order).padStart(2, "0") : "01")}
        </div>

        {/* Render blocks in array order (z-order) */}
        {blocks.map((rawBlock: any, bIdx: number) => {
          // Normalize block coordinates and properties (supports flat x,y,w,h or box: {x,y,w,h})
          let rawX = rawBlock.x ?? rawBlock.box?.x ?? 100;
          let rawY = rawBlock.y ?? rawBlock.box?.y ?? 100;
          let rawW = rawBlock.w ?? rawBlock.box?.w ?? 800;
          let rawH = rawBlock.h ?? rawBlock.box?.h ?? 400;

          // Some older AI output used percentages (x: 10, w: 80). Only treat a box as percentages when
          // the whole box fits in 0-100 on both axes; a real 80x80 px icon at x: 1500 is left alone.
          const isPercentage =
            rawBlock.unit === "%" ||
            (rawW <= 100 && rawH <= 100 && rawX + rawW <= 100 && rawY + rawH <= 100 && rawW >= 5 && rawH >= 5 && !rawBlock.box);
          const x = isPercentage ? Math.round((rawX / 100) * LOGICAL_WIDTH) : rawX;
          const y = isPercentage ? Math.round((rawY / 100) * LOGICAL_HEIGHT) : rawY;
          const w = isPercentage ? Math.round((rawW / 100) * LOGICAL_WIDTH) : rawW;
          const h = isPercentage ? Math.round((rawH / 100) * LOGICAL_HEIGHT) : rawH;

          // Normalize text/content and bullets
          let doc = rawBlock.doc;
          const bullets = rawBlock.bullets ?? rawBlock.props?.bullets;
          const content = rawBlock.content ?? rawBlock.props?.text ?? rawBlock.text ?? "";

          if (!doc) {
            if (Array.isArray(bullets) && bullets.length > 0) {
              doc = {
                type: "doc",
                content: [
                  {
                    type: "bulletList",
                    content: bullets.map((item: any) => ({
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: String(item) }],
                        },
                      ],
                    })),
                  },
                ],
              };
            } else if (content) {
              doc = {
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: String(content) }] }],
              };
            }
          }

          // Normalize comparison columns
          const columns =
            rawBlock.columns ??
            rawBlock.props?.columns ??
            (rawBlock.props?.leftTitle
              ? [
                  { title: rawBlock.props.leftTitle, items: rawBlock.props.leftItems || [] },
                  {
                    title: rawBlock.props.rightTitle || "Alternative",
                    items: rawBlock.props.rightItems || [],
                  },
                ]
              : undefined);

          // Normalize steps/timeline items
          const items =
            rawBlock.items ??
            rawBlock.props?.items ??
            (rawBlock.props?.steps
              ? rawBlock.props.steps.map((st: any, idx: number) => ({
                  title: st.title || st.step || `Phase ${idx + 1}`,
                  body: st.body || st.desc || "",
                  date: st.date || `0${idx + 1}`,
                }))
              : undefined);

          // Normalize quote text and attribution
          const text = rawBlock.text ?? rawBlock.props?.text ?? content;
          const attribution =
            rawBlock.attribution ??
            rawBlock.props?.attribution ??
            rawBlock.props?.author ??
            rawBlock.author;

          const block: any = {
            ...rawBlock,
            x,
            y,
            w,
            h,
            doc,
            content,
            bullets,
            columns,
            items,
            text,
            attribution,
            style: {
              ...(rawBlock.style || {}),
              ...(rawBlock.props || {}),
            },
            assetId:
              rawBlock.assetId ??
              rawBlock.props?.assetId ??
              rawBlock.props?.url ??
              rawBlock.url,
            value: rawBlock.value ?? rawBlock.props?.value,
            label: rawBlock.label ?? rawBlock.props?.label,
            delta: rawBlock.delta ?? rawBlock.props?.delta,
            control: rawBlock.control ?? rawBlock.props?.control ?? "slider",
            variable: rawBlock.variable ?? rawBlock.props?.variable,
            min: rawBlock.min ?? rawBlock.props?.min ?? 0,
            max: rawBlock.max ?? rawBlock.props?.max ?? 100,
            step: rawBlock.step ?? rawBlock.props?.step ?? 1,
            kind: rawBlock.kind ?? rawBlock.props?.kind ?? "bar",
            dataset: rawBlock.dataset ?? rawBlock.props?.dataset,
            xField: rawBlock.xField ?? rawBlock.props?.xField ?? "category",
            citations: rawBlock.citations ?? rawBlock.props?.citations,
            swot: rawBlock.swot ?? rawBlock.props?.swot,
            marketSize: rawBlock.marketSize ?? rawBlock.props?.marketSize,
            funnel: rawBlock.funnel ?? rawBlock.props?.funnel,
            series:
              rawBlock.series ??
              rawBlock.props?.series ??
              (rawBlock.props?.yField
                ? [{ field: rawBlock.props.yField, label: rawBlock.props?.title || "Value" }]
                : [{ field: "value", label: "Value" }]),
          };

          const isSelected = mode === "edit" && selectedBlockId === block.id;

          const isHiddenByBuild =
            buildStep !== undefined &&
            block.animation &&
            block.animation.length > 0 &&
            bIdx > buildStep;

          return (
            <div
              key={block.id || `blk-${bIdx}`}
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
