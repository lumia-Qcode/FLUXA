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
    | "set_notes";
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
        if (!opItem.block_id || !opItem.props) break;
        affectedBlockIds.push(opItem.block_id);

        for (const slide of draft.slides) {
          const blk = slide.blocks.find((b: any) => b.id === opItem.block_id) as any;
          if (blk) {
            if (blk.props) {
              blk.props = { ...blk.props, ...opItem.props };
            }
            if (blk.style && opItem.props.style) {
              blk.style = { ...blk.style, ...opItem.props.style };
            }
            Object.assign(blk, opItem.props);
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
          targetSlide.blocks.push(opItem.block);
          affectedBlockIds.push(opItem.block.id);
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
        if (currentSlide && typeof opItem.notes === "string") {
          currentSlide.notes = opItem.notes;
        }
        break;
      }

      default:
        break;
    }
  }

  return affectedBlockIds;
}
