import { describe, it, expect } from "vitest";
import { applyAIOps, AIOperation } from "../opsEngine";
import { createStore, executeRecipe, undo, redo, commands } from "../documentStore";
import { DeckDocument } from "../types";

describe("Ops Engine", () => {
  const initialDoc: DeckDocument = {
    id: 1,
    title: "Test Deck",
    revision: 1,
    schemaVersion: 1,
    theme: { themeId: "default" },
    datasets: {},
    variables: {},
    settings: {
      transition: { effect: "fade", duration: 300 },
      loop: false,
    },
    slides: [
      {
        id: "slide-1",
        order: 0,
        layout: "bullets",
        notes: "",
        blocks: [
          {
            id: "b1",
            type: "text",
            role: "title",
            x: 100,
            y: 100,
            w: 800,
            h: 100,
            props: { text: "Original Title" },
          } as any,
          {
            id: "b2",
            type: "text",
            role: "body",
            x: 100,
            y: 240,
            w: 800,
            h: 400,
            props: { bullets: ["Bullet 1", "Bullet 2", "Bullet 3"] },
          } as any,
        ],
      },
    ],
  };

  it("applies set_block_props and records affected block IDs", () => {
    const doc = JSON.parse(JSON.stringify(initialDoc));
    const ops: AIOperation[] = [
      {
        op: "set_block_props",
        block_id: "b1",
        props: { text: "Shortened Title" },
      },
    ];

    const affected = applyAIOps(doc, ops, 0);
    expect(affected).toContain("b1");
    expect((doc.slides[0].blocks[0] as any).props.text).toBe("Shortened Title");
  });

  it("applies add_block, add_variable, and set_notes", () => {
    const doc = JSON.parse(JSON.stringify(initialDoc));
    const ops: AIOperation[] = [
      {
        op: "add_variable",
        variable: {
          id: "growth",
          label: "Growth Rate",
          type: "number",
          value: 12,
          scope: "deck",
        },
      },
      {
        op: "add_block",
        block: {
          id: "b-new",
          type: "kpi",
          role: "kpi",
          x: 200,
          y: 200,
          w: 400,
          h: 200,
          props: { value: 74, label: "Adoption" },
        } as any,
      },
      {
        op: "set_notes",
        notes: "Present the adoption metric clearly.",
      },
    ];

    const affected = applyAIOps(doc, ops, 0);
    expect(affected).toContain("b-new");
    expect(doc.variables["growth"]).toBeDefined();
    expect(doc.slides[0].blocks.length).toBe(3);
    expect(doc.slides[0].notes).toBe("Present the adoption metric clearly.");
  });

  it("executes atomically through documentStore with undo/redo support", () => {
    let state = createStore(initialDoc);

    const ops: AIOperation[] = [
      {
        op: "set_block_props",
        block_id: "b2",
        props: { bullets: ["Only 1 concise point"] },
      },
      {
        op: "set_notes",
        notes: "Concise summary notes",
      },
    ];

    // Apply AI ops
    state = executeRecipe(state, "AI: Shorten slide", commands.applyAIOps(ops, 0));
    expect((state.doc.slides[0].blocks[1] as any).props.bullets).toEqual(["Only 1 concise point"]);
    expect(state.doc.slides[0].notes).toBe("Concise summary notes");
    expect(state.undoStack.length).toBe(1);

    // Undo reverts everything in one atomic step
    state = undo(state);
    expect((state.doc.slides[0].blocks[1] as any).props.bullets).toEqual(["Bullet 1", "Bullet 2", "Bullet 3"]);
    expect(state.doc.slides[0].notes).toBe("");

    // Redo reapplies cleanly
    state = redo(state);
    expect((state.doc.slides[0].blocks[1] as any).props.bullets).toEqual(["Only 1 concise point"]);
  });
});
