import { describe, expect, it } from "vitest";
import { Block } from "../../../../../shared/spec";
import { computeSnapping } from "../snapping";

describe("computeSnapping", () => {
  const otherBlocks: Block[] = [
    {
      id: "other-1",
      type: "shape",
      shape: "rect",
      x: 500,
      y: 500,
      w: 200,
      h: 200,
    },
  ];

  it("snaps to stage center X when within threshold", () => {
    // Stage center is 960. A 200px wide block has center at x + 100.
    // If x is 858, center is 958 (within 8px of 960).
    const result = computeSnapping(
      { x: 858, y: 100, w: 200, h: 100 },
      []
    );

    expect(result.x).toBe(860);
    expect(result.guides.some((g) => g.orientation === "v" && g.position === 960)).toBe(true);
  });

  it("snaps to stage left edge (0) when near left", () => {
    const result = computeSnapping(
      { x: 5, y: 100, w: 200, h: 100 },
      []
    );

    expect(result.x).toBe(0);
    expect(result.guides.some((g) => g.orientation === "v" && g.position === 0)).toBe(true);
  });

  it("snaps to stage right edge (1920) when near right", () => {
    // x = 1716, w = 200 -> right edge is 1916 (within 8px of 1920)
    const result = computeSnapping(
      { x: 1716, y: 100, w: 200, h: 100 },
      []
    );

    expect(result.x).toBe(1720);
    expect(result.guides.some((g) => g.orientation === "v" && g.position === 1920)).toBe(true);
  });

  it("snaps to other block edges", () => {
    // other-1 right edge is 700. Dragging block left at 704
    const result = computeSnapping(
      { x: 704, y: 500, w: 100, h: 100 },
      otherBlocks
    );

    expect(result.x).toBe(700);
    expect(result.guides.some((g) => g.orientation === "v" && g.position === 700)).toBe(true);
  });

  it("returns no snapping when far from any guides", () => {
    const result = computeSnapping(
      { x: 234, y: 378, w: 100, h: 100 },
      otherBlocks
    );

    expect(result.x).toBe(234);
    expect(result.y).toBe(378);
    expect(result.guides).toHaveLength(0);
  });
});
