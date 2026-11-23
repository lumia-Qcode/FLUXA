import { applyPatches, enablePatches, Patch, produceWithPatches } from "immer";
import { Block, Dataset, LayoutId, Slide, Variable } from "../../../../shared/spec";
import { applyLayoutToBlocks } from "../../rendering/layouts";
import { applyAIOps } from "./opsEngine";
import { DeckDocument } from "./types";

// Enable Immer patch recording
enablePatches();

export interface HistoryEntry {
  description: string;
  patches: Patch[];
  inversePatches: Patch[];
  timestamp: number;
}

export interface StoreState {
  doc: DeckDocument;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  activeGesture: {
    description: string;
    patches: Patch[];
    inversePatches: Patch[];
  } | null;
}

const MAX_HISTORY = 100;

export function createStore(initialDoc: DeckDocument): StoreState {
  return {
    doc: initialDoc,
    undoStack: [],
    redoStack: [],
    activeGesture: null,
  };
}

export function executeRecipe(
  state: StoreState,
  description: string,
  recipe: (draft: DeckDocument) => void
): StoreState {
  const [nextDoc, patches, inversePatches] = produceWithPatches(state.doc, recipe);

  // If no change occurred, return current state
  if (patches.length === 0) return state;

  if (state.activeGesture) {
    // Accumulate inside the active gesture
    return {
      ...state,
      doc: nextDoc,
      activeGesture: {
        ...state.activeGesture,
        patches: [...state.activeGesture.patches, ...patches],
        inversePatches: [...inversePatches, ...state.activeGesture.inversePatches],
      },
    };
  }

  // Standalone command: record history entry
  const entry: HistoryEntry = {
    description,
    patches,
    inversePatches,
    timestamp: Date.now(),
  };

  const nextUndo = [...state.undoStack, entry].slice(-MAX_HISTORY);

  return {
    ...state,
    doc: nextDoc,
    undoStack: nextUndo,
    redoStack: [], // clearing redo on new command
  };
}

export function beginGesture(state: StoreState, description: string): StoreState {
  if (state.activeGesture) return state;
  return {
    ...state,
    activeGesture: {
      description,
      patches: [],
      inversePatches: [],
    },
  };
}

export function commitGesture(state: StoreState): StoreState {
  if (!state.activeGesture) return state;

  const { description, patches, inversePatches } = state.activeGesture;
  if (patches.length === 0) {
    return { ...state, activeGesture: null };
  }

  const entry: HistoryEntry = {
    description,
    patches,
    inversePatches,
    timestamp: Date.now(),
  };

  return {
    ...state,
    activeGesture: null,
    undoStack: [...state.undoStack, entry].slice(-MAX_HISTORY),
    redoStack: [],
  };
}

export function cancelGesture(state: StoreState): StoreState {
  if (!state.activeGesture) return state;
  const revertedDoc = applyPatches(state.doc, state.activeGesture.inversePatches);
  return {
    ...state,
    doc: revertedDoc,
    activeGesture: null,
  };
}

export function undo(state: StoreState): StoreState {
  if (state.undoStack.length === 0) return state;

  const lastEntry = state.undoStack[state.undoStack.length - 1];
  const newUndoStack = state.undoStack.slice(0, -1);
  const revertedDoc = applyPatches(state.doc, lastEntry.inversePatches);

  return {
    ...state,
    doc: revertedDoc,
    undoStack: newUndoStack,
    redoStack: [...state.redoStack, lastEntry],
  };
}

export function redo(state: StoreState): StoreState {
  if (state.redoStack.length === 0) return state;

  const entryToRedo = state.redoStack[state.redoStack.length - 1];
  const newRedoStack = state.redoStack.slice(0, -1);
  const appliedDoc = applyPatches(state.doc, entryToRedo.patches);

  return {
    ...state,
    doc: appliedDoc,
    undoStack: [...state.undoStack, entryToRedo],
    redoStack: newRedoStack,
  };
}

// --- Pure Command Recipes ---

export const commands = {
  setDeckTitle: (title: string) => (draft: DeckDocument) => {
    draft.title = title;
  },

  setDeckTheme: (themeId: string, overrides?: Record<string, any>) => (draft: DeckDocument) => {
    draft.theme = {
      ...draft.theme, // keeps the typography pairing
      themeId,
      themeOverrides: overrides || draft.theme.themeOverrides,
    };
  },

  setSlideLayout: (slideId: string, layoutId: LayoutId) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    slide.layout = layoutId;
    slide.blocks = applyLayoutToBlocks(layoutId, slide.blocks);
  },

  setSlideBackground: (slideId: string, color: string) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    slide.background = { color };
  },

  setSlideNotes: (slideId: string, notes: string) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    slide.notes = notes;
  },

  addSlide: (slideOrIndex: Slide | number, maybeSlide?: Slide) => (draft: DeckDocument) => {
    let newSlide: Slide;
    let index: number;

    if (typeof slideOrIndex === "number") {
      index = slideOrIndex;
      newSlide = maybeSlide!;
    } else {
      newSlide = slideOrIndex;
      index = typeof maybeSlide === "number" ? maybeSlide : draft.slides.length;
    }

    if (!newSlide) return;
    draft.slides.splice(index, 0, newSlide);
    // Renumber orders
    draft.slides.forEach((s, idx) => {
      if (s) s.order = idx;
    });
  },

  removeSlide: (slideId: string) => (draft: DeckDocument) => {
    const idx = draft.slides.findIndex((s) => s.id === slideId);
    if (idx !== -1) {
      draft.slides.splice(idx, 1);
      draft.slides.forEach((s, i) => {
        if (s) s.order = i;
      });
    }
  },

  duplicateSlide: (slideId: string, customId?: string) => (draft: DeckDocument) => {
    const idx = draft.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return;
    const source = draft.slides[idx];
    const newSlide: Slide = {
      ...source,
      id: customId || `slide-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      order: idx + 1,
      blocks: source.blocks.map((b) => ({
        ...b,
        id: `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      })),
    };
    draft.slides.splice(idx + 1, 0, newSlide);
    draft.slides.forEach((s, i) => {
      if (s) s.order = i;
    });
  },

  reorderSlides: (newSlideIds: string[]) => (draft: DeckDocument) => {
    const slideMap = new Map(draft.slides.map((s) => [s.id, s]));
    const reordered: Slide[] = [];
    newSlideIds.forEach((id, idx) => {
      const s = slideMap.get(id);
      if (s) {
        s.order = idx;
        reordered.push(s);
      }
    });
    draft.slides = reordered;
  },

  addBlock: (slideId: string, block: Block) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    slide.blocks.push(block);
  },

  updateBlockProps: (
    slideId: string,
    blockId: string,
    patch: Partial<Block>
  ) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    const block = slide.blocks.find((b) => b.id === blockId);
    if (!block) return;
    Object.assign(block, patch);
  },

  updateBlock: (
    slideId: string,
    blockId: string,
    patch: Partial<Block>
  ) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    const block = slide.blocks.find((b) => b.id === blockId);
    if (!block) return;
    Object.assign(block, patch);
  },

  removeBlock: (slideId: string, blockId: string) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    slide.blocks = slide.blocks.filter((b) => b.id !== blockId);
  },

  reorderBlocks: (slideId: string, blockIds: string[]) => (draft: DeckDocument) => {
    const slide = draft.slides.find((s) => s.id === slideId);
    if (!slide) return;
    const map = new Map(slide.blocks.map((b) => [b.id, b]));
    const ordered: Block[] = [];
    blockIds.forEach((id) => {
      const b = map.get(id);
      if (b) ordered.push(b);
    });
    slide.blocks = ordered;
  },

  setDataset: (datasetId: string, dataset: Dataset) => (draft: DeckDocument) => {
    draft.datasets[datasetId] = dataset;
  },

  setVariable: (variableId: string, variable: Variable) => (draft: DeckDocument) => {
    draft.variables[variableId] = variable;
  },

  applyAIOps: (ops: any[], activeSlideIndex: number = 0) => (draft: DeckDocument) => {
    applyAIOps(draft, ops, activeSlideIndex);
  },
};
