import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Slide } from "../../../../shared/spec";
import {
  beginGesture as storeBeginGesture,
  cancelGesture as storeCancelGesture,
  commitGesture as storeCommitGesture,
  createStore,
  executeRecipe,
  redo as storeRedo,
  StoreState,
  undo as storeUndo,
} from "./documentStore";
import { clearDraftFromIndexedDB, loadDraftFromIndexedDB, saveDraftToIndexedDB } from "./persistence";
import { DeckDocument, SaveStatus } from "./types";

interface DocumentContextValue {
  doc: DeckDocument;
  selectedSlideId: string | null;
  selectedSlide: Slide | null;
  selectedBlockIds: string[];
  setSelectedSlideId: (id: string | null) => void;
  setSelectedBlockIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  execute: (description: string, recipe: (draft: DeckDocument) => void) => void;
  beginGesture: (description: string) => void;
  commitGesture: () => void;
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  lastSavedTime: string | null;
  saveNow: () => Promise<void>;
  resolveConflict: (choice: "mine" | "server") => Promise<void>;
  conflictServerDoc: DeckDocument | null;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export const DocumentProvider: React.FC<{
  initialDoc: DeckDocument;
  children: React.ReactNode;
}> = ({ initialDoc, children }) => {
  const [storeState, setStoreState] = useState<StoreState>(() => createStore(initialDoc));
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(() => {
    return initialDoc.slides[0]?.id || null;
  });
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(() => {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [conflictServerDoc, setConflictServerDoc] = useState<DeckDocument | null>(null);

  const saveTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveDocRef = useRef<DeckDocument | null>(null);
  // Latest revision the server confirmed. A save queued while another was running holds the
  // old revision; sending that caused false "conflicting changes" prompts.
  const lastRevisionRef = useRef<number>(initialDoc.revision || 1);
  // Server ids of the slides this deck has on the server: loaded slides are "slide-<id>".
  // Used to create new slides, delete removed ones and keep the order in sync.
  const serverSlideIdsRef = useRef<Map<string, number>>(
    new Map(
      initialDoc.slides
        .map((s) => [s.id, (s as any).dbId ?? Number((/^slide-(\d{1,9})$/.exec(s.id) || [])[1])] as [string, number])
        .filter(([, n]) => Number.isFinite(n))
    )
  );

  const doc = storeState.doc;

  // Selected slide derived from selectedSlideId
  const selectedSlide = doc.slides.find((s) => s.id === selectedSlideId) || doc.slides[0] || null;

  // Ensure selectedSlideId is valid
  useEffect(() => {
    if (selectedSlideId && !doc.slides.some((s) => s.id === selectedSlideId)) {
      setSelectedSlideId(doc.slides[0]?.id || null);
      setSelectedBlockIds([]);
    }
  }, [doc.slides, selectedSlideId]);

  // Check for local IndexedDB draft on mount
  useEffect(() => {
    async function checkDraft() {
      const draft = await loadDraftFromIndexedDB(initialDoc.id);
      if (draft && draft.revision >= initialDoc.revision) {
        // Local draft is more recent or equal
        setStoreState(createStore(draft));
        setSaveStatus("saved");
      }
    }
    checkDraft();
  }, [initialDoc.id, initialDoc.revision]);

  // Perform backend network save
  const performSave = useCallback(
    async (targetDoc: DeckDocument, force = false) => {
      if (isSavingRef.current) {
        pendingSaveDocRef.current = targetDoc;
        return;
      }

      isSavingRef.current = true;
      setSaveStatus("saving");

      try {
        const payload: Record<string, any> = {
          title: targetDoc.title,
          description: targetDoc.description || "",
          theme: targetDoc.theme,
          datasets: targetDoc.datasets,
          variables: targetDoc.variables,
          settings: targetDoc.settings,
          revision: Math.max(targetDoc.revision || 0, lastRevisionRef.current),
        };
        if (force) {
          payload.force = true;
        }

        const res = await fetch(`/api/presentations/${targetDoc.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 409) {
          // The server has a newer revision (another tab, an AI job, or a stale revision here).
          // Keep what is on screen without interrupting: adopt the server's revision and save
          // again with force. No "Resolve conflicting changes" dialog.
          const conflictData = await res.json().catch(() => ({}));
          const serverRev = conflictData?.presentation?.revision;
          if (typeof serverRev === "number") lastRevisionRef.current = serverRev;
          if (!force) {
            isSavingRef.current = false;
            await performSave({ ...targetDoc, revision: (serverRev || targetDoc.revision) + 1 }, true);
            return;
          }
          throw new Error("The presentation could not be saved.");
        }

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const data = await res.json();
        const updatedRevision = data.presentation?.revision || Math.max(targetDoc.revision, lastRevisionRef.current) + 1;
        lastRevisionRef.current = updatedRevision;

        // Save every slide: update the ones the server has, create new ones (added in the editor,
        // by Copilot or by a feature), delete removed ones, then save the order. Before this,
        // new slides were never sent to the server and disappeared on reload.
        const known = serverSlideIdsRef.current;
        const base = `/api/presentations/${targetDoc.id}/slides`;
        const titleOf = (slide: any) => {
          const t = (slide.blocks || []).find((b: any) => b.role === "title");
          return String(t?.content || t?.text || "Slide").slice(0, 200);
        };
        const create = async (slide: any) => {
          const res = await fetch(base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: titleOf(slide), spec: slide }),
          });
          if (!res.ok) return;
          const created = await res.json().catch(() => null);
          const newId = Number(created?.slide?.id);
          if (Number.isFinite(newId)) known.set(slide.id, newId);
        };
        for (const slide of targetDoc.slides) {
          const dbId = known.get(slide.id);
          if (dbId === undefined) {
            await create(slide).catch(() => {});
            continue;
          }
          const res = await fetch(`${base}/${dbId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: titleOf(slide), spec: slide }),
          }).catch(() => null);
          if (res && res.status === 404) {
            // Deleted on the server (e.g. delete then undo): create it again.
            known.delete(slide.id);
            await create(slide).catch(() => {});
          }
        }
        const present = new Set(targetDoc.slides.map((s) => s.id));
        for (const [slideId, dbId] of Array.from(known.entries())) {
          if (!present.has(slideId)) {
            await fetch(`${base}/${dbId}`, { method: "DELETE" }).catch(() => {});
            known.delete(slideId);
          }
        }
        const order = targetDoc.slides.map((s) => known.get(s.id)).filter((n): n is number => Number.isFinite(n as number));
        if (order.length) {
          await fetch(`${base}/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slide_ids: order }),
          }).catch(() => {});
        }

        // Update stored revision
        setStoreState((s) => ({
          ...s,
          doc: { ...s.doc, revision: updatedRevision },
        }));

        setSaveStatus("saved");
        const d = new Date();
        setLastSavedTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
        clearDraftFromIndexedDB(targetDoc.id);
      } catch (err) {
        // Offline or connection failure
        setSaveStatus("offline");
        // Always persist to IndexedDB on failure
        saveDraftToIndexedDB(targetDoc);
      } finally {
        isSavingRef.current = false;
        if (pendingSaveDocRef.current) {
          const next = pendingSaveDocRef.current;
          pendingSaveDocRef.current = null;
          performSave(next);
        }
      }
    },
    []
  );

  // Trigger autosave debounced 800ms
  const scheduleAutosave = useCallback(
    (nextDoc: DeckDocument) => {
      // 1. Immediately cache in IndexedDB
      saveDraftToIndexedDB(nextDoc);

      // 2. Clear existing debounce timer
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      // 3. Schedule network write after 800ms
      saveTimerRef.current = window.setTimeout(() => {
        performSave(nextDoc);
      }, 800);
    },
    [performSave]
  );

  // Execute a recipe and trigger autosave
  const execute = useCallback(
    (description: string, recipe: (draft: DeckDocument) => void) => {
      setStoreState((prev) => {
        const next = executeRecipe(prev, description, recipe);
        if (next.doc !== prev.doc) {
          scheduleAutosave(next.doc);
        }
        return next;
      });
    },
    [scheduleAutosave]
  );

  const beginGesture = useCallback((description: string) => {
    setStoreState((prev) => storeBeginGesture(prev, description));
  }, []);

  const commitGesture = useCallback(() => {
    setStoreState((prev) => {
      const next = storeCommitGesture(prev);
      if (next.doc !== prev.doc) {
        scheduleAutosave(next.doc);
      }
      return next;
    });
  }, [scheduleAutosave]);

  const cancelGesture = useCallback(() => {
    setStoreState((prev) => storeCancelGesture(prev));
  }, []);

  const undo = useCallback(() => {
    setStoreState((prev) => {
      const next = storeUndo(prev);
      if (next.doc !== prev.doc) {
        scheduleAutosave(next.doc);
      }
      return next;
    });
  }, [scheduleAutosave]);

  const redo = useCallback(() => {
    setStoreState((prev) => {
      const next = storeRedo(prev);
      if (next.doc !== prev.doc) {
        scheduleAutosave(next.doc);
      }
      return next;
    });
  }, [scheduleAutosave]);

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    await performSave(storeState.doc);
  }, [performSave, storeState.doc]);

  const resolveConflict = useCallback(
    async (choice: "mine" | "server") => {
      if (choice === "server" && conflictServerDoc) {
        setStoreState(createStore(conflictServerDoc));
        setSaveStatus("saved");
        setConflictServerDoc(null);
        clearDraftFromIndexedDB(conflictServerDoc.id);
      } else {
        // Keep mine: force save with server revision + 1
        const target = {
          ...storeState.doc,
          revision: (conflictServerDoc?.revision || storeState.doc.revision) + 1,
        };
        setConflictServerDoc(null);
        await performSave(target, true);
      }
    },
    [conflictServerDoc, performSave, storeState.doc]
  );

  return (
    <DocumentContext.Provider
      value={{
        doc,
        selectedSlideId,
        selectedSlide,
        selectedBlockIds,
        setSelectedSlideId,
        setSelectedBlockIds,
        execute,
        beginGesture,
        commitGesture,
        cancelGesture,
        undo,
        redo,
        canUndo: storeState.undoStack.length > 0,
        canRedo: storeState.redoStack.length > 0,
        saveStatus,
        lastSavedTime,
        saveNow,
        resolveConflict,
        conflictServerDoc,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
};

export function useDocument() {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error("useDocument must be used within a DocumentProvider");
  }
  return ctx;
}
