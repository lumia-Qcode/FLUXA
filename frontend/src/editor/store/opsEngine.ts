/**
 * Ops Execution Engine for applying AI operations atomically to the presentation document store.
 * Section 4.5 & 5.8: All AI modifications flow through typed operations that participate
 * in linear undo/redo history.
 */

import { Slide, Block, Variable, Dataset } from "../../../../shared/spec";
import { DeckDocument } from "./types";
import { LAYOUTS } from "../../rendering/layouts";

export interface AIOperation {
  op:
    | "set_block_props"
    | "add_block"
    | "remove_block"
    | "set_dataset"
    | "set_dataset_cell"
    | "add_variable"
    | "add_slide"
    | "remove_slide"
    | "reorder_slides"
    | "apply_layout"
    | "apply_theme"
    | "set_animation"
    | "set_notes"
    | "update_chart"   // alias: set_block_props with chart-specific props
    | "restyle";       // alias: set_block_props with style/theme props
  block_id?: string;
  props?: Record<string, any>;
  block?: Block;
  name?: string;
  dataset?: string | Dataset;
  row?: number;
  col?: string;
  value?: any;
  variable?: Variable;
  slide_id?: string;
  index?: number;
  slide?: Slide;
  order?: string[];
  layout?: string;
  theme_id?: string;
  animation?: any;
  notes?: string;
}

/**
 * Text blocks display, in order: bullets, rich text (doc), content, props.text. An AI edit that
 * only set `text` was therefore invisible on most generated slides. Write the new text into the
 * field that is displayed and drop the stale ones.
 */
const paragraphDoc = (text: string) => ({
  type: "doc",
  content: text.split("\n").map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })),
});
const bulletDoc = (items: string[]) => ({
  type: "doc",
  content: [
    {
      type: "bulletList",
      content: items.map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
      })),
    },
  ],
});

function applyTextChange(blk: any, props: Record<string, any>) {
  // The rich-text doc is rebuilt (not deleted): the server requires `doc` on text blocks,
  // and the editor's own text tool edits it.
  const text = props.text ?? props.content;
  if (typeof text === "string") {
    blk.content = text;
    blk.text = text;
    blk.props = { ...(blk.props || {}), text };
    blk.doc = paragraphDoc(text);
    if (!Array.isArray(props.bullets)) {
      delete blk.bullets;
      if (blk.props) delete blk.props.bullets;
    }
  }
  if (Array.isArray(props.bullets)) {
    const bullets = props.bullets.map((b: any) => (typeof b === "string" ? b : String(b?.text ?? b)));
    blk.bullets = bullets;
    blk.props = { ...(blk.props || {}), bullets };
    blk.doc = bulletDoc(bullets);
  }
  // Size/position changes ("make the chart bigger") live on the block box, not in props.
  for (const k of ["x", "y", "w", "h"]) {
    if (typeof props[k] === "number") {
      blk[k] = props[k];
      blk.box = { ...(blk.box || {}), [k]: props[k] };
    }
  }
  const styleKeys = ["fontSize", "fontWeight", "color", "align", "italic", "underline"];
  const style: Record<string, any> = {};
  for (const k of styleKeys) if (props[k] !== undefined) style[k] = props[k];
  if (props.style && typeof props.style === "object") Object.assign(style, props.style);
  if (Object.keys(style).length) blk.style = { ...(blk.style || {}), ...style };
}

/**
 * Chart data edits. Generated charts read their rows from a dataset (block.dataset), so labels and
 * values written onto the block were either ignored or plotted against the wrong series field.
 * Write them into the dataset the chart and the Data tab both use; charts without a dataset keep
 * labels/values on the block.
 */
function applyChartData(draft: DeckDocument, blk: any, props: Record<string, any>) {
  let labels: any[] | undefined = props.labels;
  let values: any[] | undefined = props.values;
  if (Array.isArray(props.data)) {
    labels = props.data.map((d: any) => d?.label ?? d?.category ?? d?.x);
    values = props.data.map((d: any) => d?.value ?? d?.y);
  }
  for (const k of ["kind", "is3D", "title"]) {
    if (props[k] !== undefined) {
      blk[k] = props[k];
      blk.props = { ...(blk.props || {}), [k]: props[k] };
    }
  }
  if (!Array.isArray(labels) || !Array.isArray(values)) return;
  const nums = values.map((v) => (typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""))));
  const dsName = blk.dataset || blk.props?.dataset;
  const ds = dsName ? (draft.datasets as any)[dsName] : undefined;
  if (ds) {
    const xKey = blk.xField || blk.props?.xField || ds.columns?.find((c: any) => c.type !== "number")?.key || "category";
    const yKey =
      blk.series?.[0]?.field || blk.props?.series?.[0]?.field || blk.yField || blk.props?.yField ||
      ds.columns?.find((c: any) => c.type === "number")?.key || "value";
    ds.rows = labels.map((l, i) => ({ [xKey]: String(l), [yKey]: Number.isFinite(nums[i]) ? nums[i] : 0 }));
    if (ds.source === "research") ds.source = "user"; // edited values are no longer the cited source's
    delete blk.labels;
    delete blk.values;
    if (blk.props) {
      delete blk.props.labels;
      delete blk.props.values;
    }
  } else {
    blk.labels = labels.map(String);
    blk.values = nums;
    blk.props = { ...(blk.props || {}), labels: blk.labels, values: blk.values };
  }
}

export function applyAIOps(
  draft: DeckDocument,
  ops: AIOperation[],
  activeSlideIndex: number = 0
): string[] {
  const affectedBlockIds: string[] = [];
  const currentSlide = draft.slides[activeSlideIndex] || draft.slides[0];

  for (const opItem of ops) {
    switch (opItem.op) {
      case "set_block_props": {
        const targetId = opItem.block_id || (opItem as any).id || (opItem as any).blockId;
        const targetProps = opItem.props ? { ...opItem.props } : { ...opItem };
        delete (targetProps as any).op;
        delete (targetProps as any).block_id;
        delete (targetProps as any).id;
        delete (targetProps as any).blockId;

        if (!targetId) break;
        affectedBlockIds.push(targetId);

        for (const slide of draft.slides) {
          const blk = slide.blocks.find((b: any) => b.id === targetId) as any;
          if (blk) {
            const tp = targetProps as Record<string, any>;
            if (blk.type === "chart" && (tp.labels || tp.values || tp.data)) {
              applyChartData(draft, blk, tp);
            }
            if (blk.props) {
              blk.props = { ...blk.props, ...targetProps };
            }
            if (blk.style && (targetProps as any).style) {
              blk.style = { ...blk.style, ...(targetProps as any).style };
            }
            Object.assign(blk, targetProps);
            applyTextChange(blk, targetProps);
            break;
          }
        }
        break;
      }

      case "add_block": {
        if (!opItem.block) break;
        const targetSlide = opItem.slide_id
          ? draft.slides.find((s) => s.id === opItem.slide_id) || currentSlide
          : currentSlide;
        if (targetSlide) {
          const rawBlk = { ...opItem.block } as any;
          const blkId = rawBlk.id || `blk-${rawBlk.type || "block"}-${Math.random().toString(36).substring(2, 8)}`;

          // Find optimal coordinates on 1920x1080 canvas if missing
          const hasLeftContent = targetSlide.blocks.some((b: any) => (b.x ?? 0) < 900 && (b.w ?? 0) >= 500);
          const defaultX = hasLeftContent ? 1000 : 100;
          const defaultY = 220;
          const defaultW = defaultX === 1000 ? 820 : 1720;
          const defaultH = 680;

          const blockToAdd: any = {
            id: blkId,
            type: rawBlk.type || "chart",
            role: rawBlk.role || rawBlk.type || "media",
            x: rawBlk.x ?? rawBlk.box?.x ?? defaultX,
            y: rawBlk.y ?? rawBlk.box?.y ?? defaultY,
            w: rawBlk.w ?? rawBlk.box?.w ?? defaultW,
            h: rawBlk.h ?? rawBlk.box?.h ?? defaultH,
            props: { ...(rawBlk.props || {}) },
          };

          blockToAdd.box = {
            x: blockToAdd.x,
            y: blockToAdd.y,
            w: blockToAdd.w,
            h: blockToAdd.h,
          };

          if (blockToAdd.type === "chart") {
            const chartKind = rawBlk.kind || rawBlk.props?.kind || rawBlk.props?.chartType || "donut";
            blockToAdd.kind = chartKind;
            blockToAdd.props.kind = chartKind;
            blockToAdd.is3D = rawBlk.is3D ?? rawBlk.props?.is3D ?? true;
            blockToAdd.props.is3D = blockToAdd.is3D;
            if (rawBlk.props?.labels) blockToAdd.labels = rawBlk.props.labels;
            if (rawBlk.props?.values) blockToAdd.values = rawBlk.props.values;
          }

          targetSlide.blocks.push(blockToAdd);
          affectedBlockIds.push(blockToAdd.id);
        }
        break;
      }

      case "remove_block": {
        if (!opItem.block_id) break;
        for (const slide of draft.slides) {
          const idx = slide.blocks.findIndex((b) => b.id === opItem.block_id);
          if (idx !== -1) {
            slide.blocks.splice(idx, 1);
            break;
          }
        }
        break;
      }

      case "set_dataset": {
        const dsName = opItem.name || (typeof opItem.dataset === "object" ? (opItem.dataset as Dataset).name : "dataset");
        if (dsName && opItem.dataset && typeof opItem.dataset === "object") {
          draft.datasets[dsName] = opItem.dataset as Dataset;
        }
        break;
      }

      case "set_dataset_cell": {
        const dsName = typeof opItem.dataset === "string" ? opItem.dataset : opItem.name;
        if (dsName && draft.datasets[dsName]) {
          const ds = draft.datasets[dsName];
          const rowIdx = opItem.row ?? 0;
          const colName = opItem.col;
          if (colName && ds.rows[rowIdx]) {
            ds.rows[rowIdx][colName] = opItem.value;
          }
        }
        break;
      }

      case "add_variable": {
        if (opItem.variable && opItem.variable.id) {
          draft.variables[opItem.variable.id] = opItem.variable;
        }
        break;
      }

      case "add_slide": {
        if (opItem.slide) {
          const insertIdx = opItem.index ?? draft.slides.length;
          draft.slides.splice(insertIdx, 0, opItem.slide);
          draft.slides.forEach((s, i) => {
            s.order = i;
          });
        }
        break;
      }

      case "remove_slide": {
        const targetIdx = opItem.index ?? (opItem.slide_id ? draft.slides.findIndex((s) => s.id === opItem.slide_id) : activeSlideIndex);
        if (targetIdx >= 0 && targetIdx < draft.slides.length) {
          draft.slides.splice(targetIdx, 1);
          draft.slides.forEach((s, i) => {
            s.order = i;
          });
        }
        break;
      }

      case "reorder_slides": {
        if (Array.isArray(opItem.order)) {
          const slideMap = new Map(draft.slides.map((s) => [s.id, s]));
          const reordered: Slide[] = [];
          opItem.order.forEach((id, idx) => {
            const s = slideMap.get(id);
            if (s) {
              s.order = idx;
              reordered.push(s);
            }
          });
          if (reordered.length > 0) {
            draft.slides = reordered;
          }
        }
        break;
      }

      case "apply_layout": {
        if (currentSlide && opItem.layout) {
          currentSlide.layout = opItem.layout as any;
          // Apply geometry slots from layouts
          const layoutDef = LAYOUTS.find((l) => l.id === opItem.layout);
          if (layoutDef) {
            const slotMap = new Map(layoutDef.slots.map((s) => [s.role, s]));
            for (const b of currentSlide.blocks) {
              if (b.role && slotMap.has(b.role)) {
                const slot = slotMap.get(b.role)!;
                b.x = slot.x;
                b.y = slot.y;
                b.w = slot.w;
                b.h = slot.h;
                if ((b as any).box) {
                  (b as any).box = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
                }
                affectedBlockIds.push(b.id);
              }
            }
          }
        }
        break;
      }

      case "apply_theme": {
        if (opItem.theme_id) {
          draft.theme = { themeId: opItem.theme_id as any };
        }
        break;
      }

      case "set_animation": {
        if (opItem.block_id) {
          for (const slide of draft.slides) {
            const blk = slide.blocks.find((b) => b.id === opItem.block_id);
            if (blk && opItem.animation) {
              blk.animation = opItem.animation;
              affectedBlockIds.push(blk.id);
              break;
            }
          }
        }
        break;
      }

      case "set_notes": {
        const notesSlide = opItem.slide_id ? draft.slides.find((s) => s.id === opItem.slide_id) || currentSlide : currentSlide;
        if (notesSlide && typeof opItem.notes === "string") {
          notesSlide.notes = opItem.notes;
        }
        break;
      }

      case "update_chart": {
        // Merge chart-specific props (labels, values, kind, is3D) into the block
        const targetId = opItem.block_id || (opItem as any).id || (opItem as any).blockId;
        if (!targetId) break;
        for (const slide of draft.slides) {
          const blk = slide.blocks.find((b: any) => b.id === targetId) as any;
          if (blk) {
            const chartProps: Record<string, any> = {};
            if (opItem.props?.labels !== undefined) chartProps.labels = opItem.props.labels;
            if (opItem.props?.values !== undefined) chartProps.values = opItem.props.values;
            if (opItem.props?.kind !== undefined) chartProps.kind = opItem.props.kind;
            if (opItem.props?.is3D !== undefined) chartProps.is3D = opItem.props.is3D;
            // Also pick top-level fields from the op itself
            if ((opItem as any).labels !== undefined) chartProps.labels = (opItem as any).labels;
            if ((opItem as any).values !== undefined) chartProps.values = (opItem as any).values;
            if ((opItem as any).kind !== undefined) chartProps.kind = (opItem as any).kind;
            if ((opItem as any).is3D !== undefined) chartProps.is3D = (opItem as any).is3D;
            if (opItem.props?.data !== undefined) chartProps.data = opItem.props.data;
            if (opItem.props?.title !== undefined) chartProps.title = opItem.props.title;

            applyChartData(draft, blk, chartProps);
            affectedBlockIds.push(blk.id);
            break;
          }
        }
        break;
      }

      case "restyle": {
        // Merge style/theme props into a block OR apply slide-level style
        const targetId = opItem.block_id || (opItem as any).id || (opItem as any).blockId;
        const styleProps = opItem.props || {};
        if (targetId) {
          for (const slide of draft.slides) {
            const blk = slide.blocks.find((b: any) => b.id === targetId) as any;
            if (blk) {
              blk.style = { ...(blk.style || {}), ...styleProps };
              blk.props = { ...(blk.props || {}), ...styleProps };
              applyTextChange(blk, styleProps);
              affectedBlockIds.push(blk.id);
              break;
            }
          }
        } else {
          // Slide-level style: apply to current slide
          const targetSlide = opItem.slide_id
            ? draft.slides.find((s) => s.id === opItem.slide_id) || currentSlide
            : currentSlide;
          if (targetSlide) {
            (targetSlide as any).style = { ...((targetSlide as any).style || {}), ...styleProps };
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return affectedBlockIds;
}
