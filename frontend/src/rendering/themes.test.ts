import { describe, expect, it } from "vitest";
import { DeckBrand, getTheme, getThemeCssVariables, isDarkColor, mergeTheme, resolveDeckTheme } from "./themes";

const brand: DeckBrand = {
  id: 1,
  name: "Acme",
  versionId: 3,
  version: 1,
  tokens: {},
  themeOverrides: {
    colors: { primary: "#0A3D91", secondary: "#F2A900" },
    fonts: { heading: "Acme Sans" },
    titleStyle: { size: 72 },
  },
};

describe("brand-aware themes", () => {
  it("renders a deck without a brand exactly as its theme", () => {
    expect(resolveDeckTheme("midnight", null)).toEqual(getTheme("midnight"));
    expect(resolveDeckTheme("midnight")).toEqual(getTheme("midnight"));
  });

  it("puts the brand's tokens on top and keeps everything it leaves out", () => {
    const base = getTheme("clean-light");
    const t = resolveDeckTheme("clean-light", brand);
    expect(t.colors.primary).toBe("#0A3D91");
    expect(t.colors.secondary).toBe("#F2A900");
    expect(t.colors.bg).toBe(base.colors.bg);
    expect(t.colors.chart).toEqual(base.colors.chart);
    expect(t.fonts).toEqual({ ...base.fonts, heading: "Acme Sans" });
    expect(t.titleStyle).toEqual({ ...base.titleStyle, size: 72 });
    expect(t.margins).toEqual(base.margins);
  });

  it("marks branded themes so the canvas uses the brand background", () => {
    expect(resolveDeckTheme("midnight", brand).brandId).toBe(1);
    expect(resolveDeckTheme("midnight").brandId).toBeUndefined();
  });

  it("tells dark backgrounds from light ones", () => {
    expect(isDarkColor("#0B1120")).toBe(true);
    expect(isDarkColor("#0A3D91")).toBe(true);
    expect(isDarkColor("#FFF8F0")).toBe(false);
    expect(isDarkColor("#F2A900")).toBe(false);
    expect(isDarkColor("not a colour")).toBe(false);
  });

  it("does not mutate the shared theme objects", () => {
    const before = JSON.stringify(getTheme("clean-light"));
    resolveDeckTheme("clean-light", brand);
    expect(JSON.stringify(getTheme("clean-light"))).toBe(before);
  });

  it("feeds the brand values into the slide CSS variables", () => {
    const vars = getThemeCssVariables(resolveDeckTheme("clean-light", brand));
    expect(vars["--theme-primary"]).toBe("#0A3D91");
    expect(vars["--theme-font-heading"]).toContain("Acme Sans");
  });

  it("merges partial overrides passed straight to the stage", () => {
    const base = getTheme("clean-light");
    const vars = getThemeCssVariables(base, { colors: { accent: "#123456" } });
    expect(vars["--theme-accent"]).toBe("#123456");
    expect(vars["--theme-chart-1"]).toBe(base.colors.chart[0]);
    expect(mergeTheme(base, undefined)).toBe(base);
  });
});
