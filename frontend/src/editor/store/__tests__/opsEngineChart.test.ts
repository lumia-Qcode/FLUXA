import { describe, expect, it } from "vitest";
import { applyAIOps } from "../opsEngine";

const deck = () =>
  ({
    id: 1,
    title: "Deck",
    theme: { themeId: "midnight" },
    datasets: {
      sales: {
        id: "sales",
        name: "Sales",
        source: "research",
        columns: [
          { key: "quarter", label: "Quarter", type: "text" },
          { key: "score", label: "Score", type: "number" },
        ],
        rows: [{ quarter: "Q1", score: 1 }],
      },
    },
    variables: {},
    settings: { transition: { effect: "fade", duration: 300 }, loop: false },
    revision: 1,
    schemaVersion: 1,
    slides: [
      {
        id: "slide-1",
        order: 0,
        layout: "chart-text",
        notes: "",
        blocks: [
          { id: "c1", type: "chart", kind: "bar", dataset: "sales", xField: "quarter", series: [{ field: "score" }], x: 0, y: 0, w: 900, h: 600, props: { kind: "bar", dataset: "sales" } },
          { id: "c2", type: "chart", kind: "pie", x: 0, y: 0, w: 900, h: 600, props: { kind: "pie" } },
          { id: "img", type: "image", role: "media", assetId: "old.png", model3d: "globe", x: 0, y: 0, w: 800, h: 600, props: { assetId: "old.png", model3d: "globe" } },
        ],
      },
    ],
  }) as any;

describe("Copilot chart and image ops", () => {
  it("writes chart edits into the chart's dataset, using its own column names", () => {
    const d = deck();
    applyAIOps(d, [{ op: "update_chart", block_id: "c1", props: { labels: ["Q1", "Q2"], values: [10, "20%"] } } as any], 0);
    expect(d.datasets.sales.rows).toEqual([{ quarter: "Q1", score: 10 }, { quarter: "Q2", score: 20 }]);
    expect(d.datasets.sales.source).toBe("user"); // no longer the cited source's numbers
    expect(d.slides[0].blocks[0].labels).toBeUndefined();
  });

  it("set_block_props with chart data and data[] rows also reaches the dataset", () => {
    const d = deck();
    applyAIOps(d, [{ op: "set_block_props", block_id: "c1", props: { data: [{ label: "A", value: 3 }], kind: "line" } } as any], 0);
    expect(d.datasets.sales.rows).toEqual([{ quarter: "A", score: 3 }]);
    expect(d.slides[0].blocks[0].kind).toBe("line");
  });

  it("charts without a dataset keep labels and values on the block", () => {
    const d = deck();
    applyAIOps(d, [{ op: "update_chart", block_id: "c2", props: { labels: ["x", "y"], values: [1, 2] } } as any], 0);
    expect(d.slides[0].blocks[1].labels).toEqual(["x", "y"]);
    expect(d.slides[0].blocks[1].props.values).toEqual([1, 2]);
  });

  it("an image swap replaces the picture and leaves 3D mode", () => {
    const d = deck();
    applyAIOps(d, [{ op: "set_block_props", block_id: "img", props: { assetId: "https://upload.wikimedia.org/n.png", credit: "Image: A", model3d: null } } as any], 0);
    const img = d.slides[0].blocks[2];
    expect(img.assetId).toBe("https://upload.wikimedia.org/n.png");
    expect(img.props.credit).toBe("Image: A");
    expect(img.model3d).toBeNull();
  });
});
