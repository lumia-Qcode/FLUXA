import themesData from "../../../shared/themes.json";

export interface ThemeColors {
  bg: string;
  text: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
  chart: string[];
}

export interface ThemeFonts {
  heading: string;
  body: string;
  mono?: string;
}

export interface TitleStyle {
  size: number;
  weight: number | string;
  align: "left" | "center" | "right";
  letterSpacing?: string;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Theme {
  id: string;
  name: string;
  fonts: ThemeFonts;
  colors: ThemeColors;
  titleStyle: TitleStyle;
  margins: Margins;
  backgroundTreatment: "flat" | "subtle-texture";
  pptxFallbackFont: string;
}

export const THEMES: Theme[] = themesData as Theme[];

export function getTheme(themeId?: string): Theme {
  if (!themeId) return THEMES[0];
  const found = THEMES.find((t) => t.id === themeId);
  return found || THEMES[0];
}

export function getThemeCssVariables(theme: Theme, overrides?: Partial<Theme>): Record<string, string> {
  const merged = { ...theme, ...overrides };
  const c = merged.colors;
  const f = merged.fonts;

  return {
    "--theme-bg": c.bg,
    "--theme-text": c.text,
    "--theme-primary": c.primary,
    "--theme-secondary": c.secondary,
    "--theme-accent": c.accent,
    "--theme-muted": c.muted,
    "--theme-chart-1": c.chart[0] || "#2563EB",
    "--theme-chart-2": c.chart[1] || "#047857",
    "--theme-chart-3": c.chart[2] || "#B45309",
    "--theme-chart-4": c.chart[3] || "#7C3AED",
    "--theme-chart-5": c.chart[4] || "#BE185D",
    "--theme-chart-6": c.chart[5] || "#0369A1",
    "--theme-font-heading": `"${f.heading}", system-ui, sans-serif`,
    "--theme-font-body": `"${f.body}", system-ui, sans-serif`,
    "--theme-font-mono": `"${f.mono || "IBM Plex Mono"}", monospace`,
  };
}
