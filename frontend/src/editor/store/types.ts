import { Dataset, DeckSettings, Slide, Variable } from "../../../../shared/spec";
import type { DeckBrand } from "../../rendering/themes";

export type SaveStatus = "saved" | "saving" | "offline" | "error" | "conflict";

export interface DeckDocument {
  id: number;
  title: string;
  description?: string;
  theme: {
    themeId: string;
    themeOverrides?: Record<string, any>;
    /** Typography pairing id (rendering/typography.ts); unset keeps the theme's own fonts. */
    fontPairing?: string;
  };
  datasets: Record<string, Dataset>;
  variables: Record<string, Variable>;
  settings: DeckSettings;
  slides: Slide[];
  revision: number;
  schemaVersion: number;
  shareToken?: string | null;
  isShared?: boolean;
  /** The deck's pinned brand version (F6); null or missing means no brand. Read-only here. */
  brand?: DeckBrand | null;
}

export type CommandType =
  | "SET_DECK_TITLE"
  | "SET_DECK_THEME"
  | "ADD_SLIDE"
  | "REMOVE_SLIDE"
  | "DUPLICATE_SLIDE"
  | "REORDER_SLIDES"
  | "SET_SLIDE_LAYOUT"
  | "SET_SLIDE_BACKGROUND"
  | "SET_SLIDE_NOTES"
  | "ADD_BLOCK"
  | "UPDATE_BLOCK"
  | "REMOVE_BLOCK"
  | "REORDER_BLOCKS"
  | "ALIGN_BLOCKS"
  | "DISTRIBUTE_BLOCKS"
  | "SET_DATASET"
  | "SET_VARIABLE";

export interface SelectionState {
  slideId: string;
  blockIds: string[];
}
