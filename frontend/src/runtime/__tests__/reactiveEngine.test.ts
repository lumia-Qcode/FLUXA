import { describe, expect, it } from "vitest";
import { buildReactiveScope, resolveBinding, resolveBlockProps } from "../reactiveEngine";
import { Dataset, Variable, Block } from "../../../../shared/spec";

describe("reactiveEngine", () => {
  it("builds reactive scope from variables and datasets", () => {
    const variables: Record<string, Variable> = {
      growth: {
        id: "growth",
        label: "Growth Rate",
        type: "number",
        value: 1.25,
        scope: "deck",
      },
    };

    const datasets: Record<string, Dataset> = {
      sales: {
        id: "sales",
        name: "Quarterly Sales",
        source: "user",
        columns: [
          { key: "quarter", label: "Quarter", type: "text" },
          { key: "revenue", label: "Revenue", type: "number" },
          { key: "projected", label: "Projected", type: "number", expr: "revenue * growth" },
        ],
        rows: [
          { quarter: "Q1", revenue: 100 },
          { quarter: "Q2", revenue: 200 },
        ],
      },
    };

    const scope = buildReactiveScope(datasets, variables);

    expect(scope.variables.growth).toBe(1.25);
    expect(scope.datasets.sales.rows[0].projected).toBe(125);
    expect(scope.datasets.sales.rows[1].projected).toBe(250);
  });

  it("resolves bound KPI values and last() worked example", () => {
    const datasets: Record<string, Dataset> = {
      adoption: {
        id: "adoption",
        name: "Adoption",
        source: "user",
        columns: [
          { key: "year", label: "Year", type: "text" },
          { key: "pct", label: "Percentage", type: "number" },
        ],
        rows: [
          { year: "2023", pct: 35 },
          { year: "2024", pct: 55 },
          { year: "2025", pct: 74 },
        ],
      },
    };

    const scope = buildReactiveScope(datasets, {});

    const boundField = { $bind: "last(adoption.pct)" };
    const res = resolveBinding(boundField, scope);

    expect(res.isBound).toBe(true);
    expect(res.value).toBe(74);
    expect(res.error).toBeUndefined();

    const kpiBlock: Block = {
      id: "kpi-1",
      type: "kpi",
      x: 100,
      y: 100,
      w: 300,
      h: 200,
      value: { $bind: "last(adoption.pct)" },
      label: "Current Adoption",
    };

    const { resolvedBlock, errors } = resolveBlockProps(kpiBlock, scope);
    expect(Object.keys(errors).length).toBe(0);
    expect((resolvedBlock as any).value).toBe(74);
  });

  it("gracefully flags expression errors without throwing", () => {
    const scope = buildReactiveScope({}, {});
    const boundField = { $bind: "nonexistent_var * 2" };
    const res = resolveBinding(boundField, scope);

    expect(res.isBound).toBe(true);
    expect(res.error).toBeDefined();

    const kpiBlock: Block = {
      id: "kpi-bad",
      type: "kpi",
      x: 100,
      y: 100,
      w: 300,
      h: 200,
      value: { $bind: "unknown_identifier + 1" },
      label: "Broken Metric",
    };

    const { resolvedBlock, errors } = resolveBlockProps(kpiBlock, scope);
    expect(errors["value"]).toBeDefined();
    expect((resolvedBlock as any).value).toBe("Error");
  });
});
