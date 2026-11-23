import { describe, expect, it } from "vitest";
import { applyAIOps } from "../opsEngine";

const deck = () =>
  ({
    id: 1,
    title: "Deck",
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
        notes: "",
        blocks: [
          // Generated title: shown from `content`, with a rich-text doc built on load.
          { id: "t1", type: "text", role: "title", x: 100, y: 80, w: 1720, h: 120, content: "Old title", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Old title" }] }] }, props: { text: "Old title" } },
          { id: "b1", type: "text", role: "body", x: 100, y: 240, w: 800, h: 400, bullets: ["a", "b", "c", "d"], props: { bullets: ["a", "b", "c", "d"] } },
        ],
      },
      { id: "slide-2", order: 1, layout: "bullets", notes: "", blocks: [{ id: "t2", type: "text", role: "title", x: 0, y: 0, w: 10, h: 10, content: "Two" }] },
    ],
  }) as any;

describe("Copilot ops change what the slide shows", () => {
  it("a title edit replaces content and the rich-text doc (it used to stay invisible)", () => {
    const d = deck();
    applyAIOps(d, [{ op: "set_block_props", block_id: "t1", props: { text: "New title" } }]);
    const t = d.slides[0].blocks[0];
    expect(t.content).toBe("New title");
    expect(JSON.stringify(t.doc)).toContain("New title");
    expect(JSON.stringify(t.doc)).not.toContain("Old title");
  });

  it("new bullets replace the old list everywhere it is read", () => {
    const d = deck();
    applyAIOps(d, [{ op: "set_block_props", block_id: "b1", props: { bullets: ["x", "y", "z"] } }]);
    const b = d.slides[0].blocks[1];
    expect(b.bullets).toEqual(["x", "y", "z"]);
    expect(b.props.bullets).toEqual(["x", "y", "z"]);
    expect(b.doc.content[0].type).toBe("bulletList");
  });

  it("a paragraph replaces a bullet list", () => {
    const d = deck();
    applyAIOps(d, [{ op: "set_block_props", block_id: "b1", props: { text: "One line" } }]);
    const b = d.slides[0].blocks[1];
    expect(b.bullets).toBeUndefined();
    expect(b.content).toBe("One line");
  });

  it("resizing moves the block box, and several ops all apply", () => {
    const d = deck();
    applyAIOps(d, [
      { op: "set_block_props", block_id: "t1", props: { text: "A" } },
      { op: "set_block_props", block_id: "b1", props: { w: 1200, h: 600 } },
      { op: "set_block_props", block_id: "t2", props: { text: "Edited on slide 2" } },
      { op: "set_notes", slide_id: "slide-2", notes: "Notes for two" },
    ]);
    expect(d.slides[0].blocks[1].w).toBe(1200);
    expect(d.slides[0].blocks[1].box.h).toBe(600);
    expect(d.slides[1].blocks[0].content).toBe("Edited on slide 2");
    expect(d.slides[1].notes).toBe("Notes for two");
  });
});
