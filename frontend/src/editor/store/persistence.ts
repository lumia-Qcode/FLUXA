import { del, get, set } from "idb-keyval";
import { DeckDocument } from "./types";

const DRAFT_PREFIX = "fluxa-draft-";

export async function saveDraftToIndexedDB(doc: DeckDocument): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await set(`${DRAFT_PREFIX}${doc.id}`, {
      ...doc,
      savedAt: Date.now(),
    });
  } catch (err) {
    console.warn("Failed to write draft to IndexedDB:", err);
  }
}

export async function loadDraftFromIndexedDB(deckId: number): Promise<DeckDocument | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const draft = await get(`${DRAFT_PREFIX}${deckId}`);
    return draft || null;
  } catch (err) {
    console.warn("Failed to read draft from IndexedDB:", err);
    return null;
  }
}

export async function clearDraftFromIndexedDB(deckId: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await del(`${DRAFT_PREFIX}${deckId}`);
  } catch (err) {
    console.warn("Failed to clear draft from IndexedDB:", err);
  }
}
