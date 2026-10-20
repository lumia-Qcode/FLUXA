import { describe, expect, it } from "vitest";
import { DeckDocument } from "../types";
import {
  beginGesture,
  cancelGesture,
  commands,
  commitGesture,
  createStore,
  executeRecipe,
  redo,
  undo,
} from "../documentStore";

const mockDoc: DeckDocument = {
  id: 1,
  title: "Test Deck",
  theme: { themeId: "midnight" },
  datasets: {},
  variables: {},
  settings: { transition: { effect: "fade", duration: 300 }, loop: false },
  revision: 1,
  schemaVersion: 1,
  slides: [
    {
      id: "slide-1",
      order: 0,
      layout: "title",
      notes: "Intro note",
      blocks: [
        {
          id: "block-1",
          type: "text",
          x: 10,
          y: 20,
          w: 80,
          h: 30,
          content: "Hello World",
          style: { fontSize: 40 },
          role: "title",
        },
      ],
    },
    {
      id: "slide-2",
      order: 1,
      layout: "bullets",
      notes: "",
      blocks: [],
    },
  ],
};

describe("documentStore", () => {
  it("initializes with clean undo and redo stacks", () => {
    const store = createStore(mockDoc);
    expect(store.doc.title).toBe("Test Deck");
    expect(store.undoStack).toHaveLength(0);
    expect(store.redoStack).toHaveLength(0);
    expect(store.activeGesture).toBeNull();
  });

  it("executes recipe and creates undoable patch", () => {
    let store = createStore(mockDoc);
    store = executeRecipe(store, "Set title", commands.setDeckTitle("Updated Title"));

    expect(store.doc.title).toBe("Updated Title");
    expect(store.undoStack).toHaveLength(1);
    expect(store.undoStack[0].description).toBe("Set title");
    expect(store.redoStack).toHaveLength(0);

    // Undo
    store = undo(store);
    expect(store.doc.title).toBe("Test Deck");
    expect(store.undoStack).toHaveLength(0);
    expect(store.redoStack).toHaveLength(1);

    // Redo
    store = redo(store);
    expect(store.doc.title).toBe("Updated Title");
    expect(store.undoStack).toHaveLength(1);
    expect(store.redoStack).toHaveLength(0);
  });

  it("supports deep multi-step undo and redo", () => {
    let store = createStore(mockDoc);

    for (let i = 1; i <= 5; i++) {
      store = executeRecipe(store, `Step ${i}`, (draft) => {
        draft.title = `Title ${i}`;
      });
    }

    expect(store.doc.title).toBe("Title 5");
    expect(store.undoStack).toHaveLength(5);

    // Undo 3 steps
    store = undo(store);
    store = undo(store);
    store = undo(store);
    expect(store.doc.title).toBe("Title 2");

    // Redo 2 steps
    store = redo(store);
    store = redo(store);
    expect(store.doc.title).toBe("Title 4");
  });

  it("groups gestures into a single undo step", () => {
    let store = createStore(mockDoc);

    // Begin drag gesture
    store = beginGesture(store, "Drag block");
    expect(store.activeGesture).not.toBeNull();

    // 10 intermediate drag events
    for (let x = 11; x <= 20; x++) {
      store = executeRecipe(store, "Move", (draft) => {
        draft.slides[0].blocks[0].x = x;
      });
    }

    expect(store.doc.slides[0].blocks[0].x).toBe(20);
    // Undo stack not populated until commit
    expect(store.undoStack).toHaveLength(0);

    // Commit gesture
    store = commitGesture(store);
    expect(store.activeGesture).toBeNull();
    expect(store.undoStack).toHaveLength(1);
    expect(store.undoStack[0].description).toBe("Drag block");

    // Single undo restores initial position (10)
    store = undo(store);
    expect(store.doc.slides[0].blocks[0].x).toBe(10);

    // Single redo restores final position (20)
    store = redo(store);
    expect(store.doc.slides[0].blocks[0].x).toBe(20);
  });

  it("cancels an active gesture and rolls back state", () => {
    let store = createStore(mockDoc);
    store = beginGesture(store, "Resize block");

    store = executeRecipe(store, "Resize intermediate", (draft) => {
      draft.slides[0].blocks[0].w = 50;
    });
    expect(store.doc.slides[0].blocks[0].w).toBe(50);

    store = cancelGesture(store);
    expect(store.activeGesture).toBeNull();
    expect(store.doc.slides[0].blocks[0].w).toBe(80);
    expect(store.undoStack).toHaveLength(0);
  });

  it("adds, duplicates, and removes slides with undo/redo", () => {
    let store = createStore(mockDoc);

    // Add slide
    store = executeRecipe(
      store,
      "Add slide",
      commands.addSlide({
        id: "slide-3",
        order: 2,
        layout: "blank",
        notes: "",
        blocks: [],
      })
    );
    expect(store.doc.slides).toHaveLength(3);

    // Duplicate slide
    store = executeRecipe(store, "Duplicate slide", commands.duplicateSlide("slide-1", "slide-dup"));
    expect(store.doc.slides).toHaveLength(4);
    expect(store.doc.slides[1].id).toBe("slide-dup");
    expect(store.doc.slides[1].blocks[0].content).toBe("Hello World");

    // Remove slide
    store = executeRecipe(store, "Remove slide", commands.removeSlide("slide-dup"));
    expect(store.doc.slides).toHaveLength(3);

    // Undo removal
    store = undo(store);
    expect(store.doc.slides).toHaveLength(4);
    expect(store.doc.slides[1].id).toBe("slide-dup");
  });

  it("updates block properties and z-order", () => {
    let store = createStore(mockDoc);

    // Add second block
    store = executeRecipe(
      store,
      "Add block",
      commands.addBlock("slide-1", {
        id: "block-2",
        type: "shape",
        shape: "rectangle",
        x: 30,
        y: 40,
        w: 20,
        h: 20,
        fill: { color: "#3B82F6" },
      })
    );
    expect(store.doc.slides[0].blocks).toHaveLength(2);

    // Update block
    store = executeRecipe(
      store,
      "Update block",
      commands.updateBlock("slide-1", "block-2", { x: 35, y: 45 })
    );
    expect(store.doc.slides[0].blocks[1].x).toBe(35);
    expect(store.doc.slides[0].blocks[1].y).toBe(45);

    // Send to back (reorder)
    store = executeRecipe(
      store,
      "Send to back",
      commands.reorderBlocks("slide-1", ["block-2", "block-1"])
    );
    expect(store.doc.slides[0].blocks[0].id).toBe("block-2");
    expect(store.doc.slides[0].blocks[1].id).toBe("block-1");

    // Undo reorder
    store = undo(store);
    expect(store.doc.slides[0].blocks[0].id).toBe("block-1");
  });
});
