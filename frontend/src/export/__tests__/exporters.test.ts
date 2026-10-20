import { describe, expect, it } from "vitest";
import { DeckDocument } from "../../editor/store/types";
import { buildMarkdownOutline } from "../markdownExporter";
import { buildStandaloneHtml } from "../htmlExporter";

const sampleDoc: DeckDocument = {
  id: 10,
  title: "Phase 6 Export Test Deck",
  description: "Automated test deck for export verification",
  theme: { themeId: "clean-light" },
  datasets: {
    ds1: {
      id: "ds1",
      name: "Quarterly Revenue",
      source: "user",
      columns: [
        { key: "quarter", label: "Quarter", type: "text" },
        { key: "revenue", label: "Revenue", type: "number" },
      ],
      rows: [
        { quarter: "Q1", revenue: 45 },
        { quarter: "Q2", revenue: 65 },
        { quarter: "Q3", revenue: 85 },
      ],
    },
  },
  variables: {
    growth_rate: {
      id: "growth_rate",
      label: "Growth Rate",
      type: "number",
      value: 25,
      min: 0,
      max: 100,
      step: 5,
      scope: "deck",
    },
  },
  settings: { transition: { effect: "fade", duration: 300 }, loop: false },
  revision: 1,
  schemaVersion: 1,
  slides: [
    {
      id: "s1",
      order: 0,
      layout: "title",
      notes: "Introductory notes for Phase 6",
      blocks: [
        {
          id: "b-title",
          type: "text",
          role: "title",
          style: { fontSize: 36 },
          x: 100,
          y: 100,
          w: 800,
          h: 120,
          doc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Phase 6 Export Test Deck" }] }],
          },
        },
      ],
    },
    {
      id: "s2",
      order: 1,
      layout: "chart-text",
      notes: "Chart analysis slide",
      blocks: [
        {
          id: "b-chart",
          type: "chart",
          kind: "bar",
          dataset: "ds1",
          xField: "quarter",
          options: {},
          series: [{ field: "revenue", label: "Revenue" }],
          x: 100,
          y: 200,
          w: 600,
          h: 400,
        },
        {
          id: "b-control",
          type: "control",
          control: "slider",
          variable: "growth_rate",
          label: "Growth Rate",
          min: 0,
          max: 100,
          step: 5,
          x: 750,
          y: 200,
          w: 300,
          h: 80,
        },
        {
          id: "b-kpi",
          type: "kpi",
          label: "Target Revenue",
          value: "$bind: growth_rate",
          x: 750,
          y: 320,
          w: 300,
          h: 160,
        },
      ],
    },
  ],
};

describe("Export & Share System", () => {
  it("buildMarkdownOutline formats titles, notes, and metrics", () => {
    const md = buildMarkdownOutline(sampleDoc);
    expect(md).toContain("# Phase 6 Export Test Deck");
    expect(md).toContain("Introductory notes for Phase 6");
    expect(md).toContain("Slide 1:");
    expect(md).toContain("Slide 2:");
    expect(md).toContain("[Chart: bar - Dataset: `ds1`]");
  });

  it("buildStandaloneHtml produces self-contained interactive document", () => {
    const html = buildStandaloneHtml(sampleDoc);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Phase 6 Export Test Deck");
    expect(html).toContain("standalone-slider");
    expect(html).toContain("standalone-chart-bar");
    expect(html).toContain("standalone-kpi-value");
    expect(html).toContain("resizeStage");
    // Ensure no external script or style tags
    expect(html).not.toContain("<script src=\"http");
    expect(html).not.toContain("<link rel=\"stylesheet\" href=\"http");
  });
});
