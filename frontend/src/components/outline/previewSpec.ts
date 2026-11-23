import type { LayoutDefinition } from "../../rendering/layouts";

export interface OutlineItem {
  title: string;
  layout?: string;
  purpose?: string;
  visual?: string;
  chartKind?: string;
  /** UI-only fields, stripped before the outline is sent to the API. */
  _key?: string;
  _feedback?: "up" | "down" | null;
  [extra: string]: unknown;
}

const PLACEHOLDER: Record<string, string> = {
  media: "Image",
  chart: "Chart",
  kpi: "Key number",
};

/**
 * Builds a renderable slide spec for the live preview from one outline item and its layout.
 * Text goes into real text blocks; media/chart/KPI slots become labelled placeholder frames,
 * because no data or images exist yet at the outline stage.
 */
export function buildPreviewSlide(item: OutlineItem, layout: LayoutDefinition, deckTitle: string) {
  const blocks: Record<string, unknown>[] = [];
  layout.slots.forEach((slot, i) => {
    const base = { id: `pv-${i}`, role: slot.role, x: slot.x, y: slot.y, w: slot.w, h: slot.h };
    const align = slot.align || "left";
    if (slot.role === "title") {
      const hero = layout.id === "title" || layout.id === "section";
      blocks.push({
        ...base,
        type: "text",
        doc: { type: "doc", content: [] },
        text: item.title || "Untitled slide",
        style: { align, fontSize: hero ? 104 : 68 },
      });
    } else if (slot.role === "subtitle" || slot.role === "body") {
      blocks.push({
        ...base,
        type: "text",
        doc: { type: "doc", content: [] },
        bullets: item.purpose ? [item.purpose] : ["Key point for this slide"],
        style: { align, fontSize: slot.role === "subtitle" ? 44 : 42 },
      });
    } else if (slot.role === "aside") {
      blocks.push({
        ...base,
        type: "text",
        doc: { type: "doc", content: [] },
        bullets: ["Supporting point", "Evidence or example"],
        style: { align, fontSize: 38 },
      });
    } else if (slot.role === "footer") {
      blocks.push({ ...base, type: "text", doc: { type: "doc", content: [] }, text: deckTitle, style: { align, fontSize: 18 } });
    } else {
      const label = PLACEHOLDER[slot.role] || "Visual";
      blocks.push({
        ...base,
        id: `pv-${i}-frame`,
        type: "shape",
        shape: "rect",
        radius: 24,
        fill: { color: "var(--theme-primary)", opacity: 0.1 },
        stroke: { color: "var(--theme-primary)", width: 3, dash: "dashed" },
      });
      blocks.push({
        ...base,
        id: `pv-${i}-label`,
        role: "aside",
        type: "text",
        doc: { type: "doc", content: [] },
        y: slot.y + slot.h / 2 - 30,
        h: 60,
        text:
          item.visual && item.visual !== "none" && item.visual.toLowerCase() !== label.toLowerCase() && item.visual !== slot.role
            ? `${label}: ${item.visual}`
            : label,
        style: { align: "center", fontSize: 40 },
      });
    }
  });
  return {
    id: "outline-preview",
    order: 0,
    layout: layout.id,
    notes: "",
    transition: { effect: "none", duration: 0 },
    blocks,
  };
}

/** Mini wireframe rects for a layout, scaled from the 1920×1080 stage. */
export function layoutRects(layout: LayoutDefinition, w = 80, h = 45) {
  return layout.slots.map((s) => ({
    role: s.role,
    x: (s.x / 1920) * w,
    y: (s.y / 1080) * h,
    w: (s.w / 1920) * w,
    h: (s.h / 1080) * h,
  }));
}
