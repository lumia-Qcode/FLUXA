import { Block, LayoutId } from "../../../shared/spec";
import { Margins } from "./themes";

export interface LayoutSlot {
  role: NonNullable<Block["role"]>;
  x: number;
  y: number;
  w: number;
  h: number;
  align?: "left" | "center" | "right";
}

export interface LayoutDefinition {
  id: LayoutId;
  name: string;
  description: string;
  slots: LayoutSlot[];
}

export const LAYOUTS: LayoutDefinition[] = [
  {
    id: "title",
    name: "Title Slide",
    description: "Centered large headline with subtitle and optional presenter tag",
    slots: [
      { role: "title", x: 160, y: 320, w: 1600, h: 220, align: "center" },
      { role: "subtitle", x: 260, y: 560, w: 1400, h: 140, align: "center" },
      { role: "footer", x: 400, y: 840, w: 1120, h: 80, align: "center" },
    ],
  },
  {
    id: "section",
    name: "Section Break",
    description: "Minimalist divider for major transitions and parts",
    slots: [
      { role: "subtitle", x: 200, y: 360, w: 1520, h: 60, align: "left" },
      { role: "title", x: 200, y: 440, w: 1520, h: 240, align: "left" },
    ],
  },
  {
    id: "bullets",
    name: "Title & Bullets",
    description: "Standard narrative slide with top title and bullet stack",
    slots: [
      { role: "title", x: 100, y: 80, w: 1720, h: 120, align: "left" },
      { role: "body", x: 100, y: 240, w: 1720, h: 720, align: "left" },
    ],
  },
  {
    id: "two-column",
    name: "Two Columns",
    description: "Balanced two-column split for parallel points or comparisons",
    slots: [
      { role: "title", x: 100, y: 80, w: 1720, h: 120, align: "left" },
      { role: "body", x: 100, y: 240, w: 820, h: 720, align: "left" },
      { role: "aside", x: 1000, y: 240, w: 820, h: 720, align: "left" },
    ],
  },
  {
    id: "big-number",
    name: "Big Metric (KPI)",
    description: "Large headline stat with contextual narrative and delta badge",
    slots: [
      { role: "title", x: 100, y: 80, w: 1720, h: 120, align: "left" },
      { role: "kpi", x: 100, y: 240, w: 900, h: 450, align: "left" },
      { role: "body", x: 1060, y: 260, w: 760, h: 680, align: "left" },
      { role: "footer", x: 100, y: 740, w: 900, h: 180, align: "left" },
    ],
  },
  {
    id: "chart-text",
    name: "Chart & Narrative",
    description: "Analytical layout pairing a data visualization with commentary",
    slots: [
      { role: "title", x: 100, y: 80, w: 1720, h: 120, align: "left" },
      { role: "body", x: 100, y: 240, w: 680, h: 720, align: "left" },
      { role: "chart", x: 840, y: 240, w: 980, h: 720, align: "left" },
    ],
  },
  {
    id: "image-text",
    name: "Media & Text",
    description: "Visual media frame paired with descriptive paragraphs",
    slots: [
      { role: "title", x: 100, y: 80, w: 1720, h: 120, align: "left" },
      { role: "media", x: 100, y: 240, w: 880, h: 720, align: "left" },
      { role: "body", x: 1040, y: 240, w: 780, h: 720, align: "left" },
    ],
  },
  {
    id: "quote",
    name: "Featured Quote",
    description: "Prominent statement with speaker attribution",
    slots: [
      { role: "body", x: 200, y: 280, w: 1520, h: 480, align: "center" },
      { role: "subtitle", x: 300, y: 780, w: 1320, h: 100, align: "center" },
    ],
  },
  {
    id: "timeline",
    name: "Process Timeline",
    description: "Horizontal milestone cards for roadmap or sequential steps",
    slots: [
      { role: "title", x: 100, y: 80, w: 1720, h: 120, align: "left" },
      { role: "body", x: 100, y: 240, w: 1720, h: 720, align: "left" },
    ],
  },
  {
    id: "comparison",
    name: "Comparison Matrix",
    description: "Side-by-side comparative columns for options or before/after",
    slots: [
      { role: "title", x: 100, y: 80, w: 1720, h: 120, align: "left" },
      { role: "body", x: 100, y: 240, w: 1720, h: 720, align: "left" },
    ],
  },
  {
    id: "full-bleed",
    name: "Full Bleed Media",
    description: "Full-canvas media with overlay title container",
    slots: [
      { role: "media", x: 0, y: 0, w: 1920, h: 1080, align: "center" },
      { role: "title", x: 120, y: 780, w: 1680, h: 180, align: "left" },
    ],
  },
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Completely open stage for free-form positioning",
    slots: [],
  },
];

export function getLayout(layoutId?: LayoutId | null): LayoutDefinition {
  if (!layoutId) return LAYOUTS[11]; // blank by default
  const found = LAYOUTS.find((l) => l.id === layoutId);
  return found || LAYOUTS[11];
}

/**
 * Heuristically assigns roles to blocks that lack an explicit role.
 */
function inferRole(block: Block): NonNullable<Block["role"]> {
  if (block.role) return block.role;
  if (block.type === "chart") return "chart";
  if (block.type === "kpi") return "kpi";
  if (block.type === "image") return "media";
  if (block.type === "comparison") return "aside";
  return "body";
}

/**
 * Re-flows blocks according to the target layout slots.
 * Any unslotted blocks are gracefully positioned below or retain position.
 */
export function applyLayoutToBlocks(
  layoutId: LayoutId,
  blocks: Block[],
  _margins?: Margins
): Block[] {
  if (layoutId === "blank" || blocks.length === 0) {
    return blocks;
  }

  const layout = getLayout(layoutId);
  if (layout.slots.length === 0) return blocks;

  const slottedRoles = new Set(layout.slots.map((s) => s.role));
  const assignedSlotIndices = new Set<number>();

  return blocks.map((block) => {
    const role = inferRole(block);

    // Find the first matching available slot for this role
    let targetSlotIndex = layout.slots.findIndex(
      (slot, idx) => slot.role === role && !assignedSlotIndices.has(idx)
    );

    // If no exact role match, find any unassigned slot that accepts generic body/aside
    if (targetSlotIndex === -1 && !slottedRoles.has(role)) {
      targetSlotIndex = layout.slots.findIndex(
        (slot, idx) =>
          (slot.role === "body" || slot.role === "aside") &&
          !assignedSlotIndices.has(idx)
      );
    }

    if (targetSlotIndex !== -1) {
      assignedSlotIndices.add(targetSlotIndex);
      const slot = layout.slots[targetSlotIndex];
      return {
        ...block,
        role: slot.role,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
      };
    }

    return block;
  });
}
