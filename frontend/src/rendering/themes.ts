import themesData from "../../../shared/themes.json";
import { fontStack, getPairing } from "./typography";

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
  /** Set when a brand's tokens were applied (F6): the slide canvas then uses colors.bg as-is. */
  brandId?: number;
}

export const THEMES: Theme[] = themesData as Theme[];

export function getTheme(themeId?: string): Theme {
  if (!themeId) return THEMES[0];
  const found = THEMES.find((t) => t.id === themeId);
  return found || THEMES[0];
}

/** Theme keys a brand (or deck override) may set; anything left out keeps the theme's value. */
export interface ThemeOverrides {
  colors?: Partial<ThemeColors>;
  fonts?: Partial<ThemeFonts>;
  titleStyle?: Partial<TitleStyle>;
  margins?: Partial<Margins>;
}

/** A deck's pinned brand version, as the API sends it (`presentation.brand`). */
export interface DeckBrand {
  id: number;
  name: string;
  versionId: number;
  version: number;
  tokens: Record<string, unknown>;
  themeOverrides: ThemeOverrides;
}

/** Merge overrides onto a theme one level deep, so a partial `colors` keeps the rest. */
export function mergeTheme(theme: Theme, overrides?: ThemeOverrides | Partial<Theme> | null): Theme {
  if (!overrides) return theme;
  const o = overrides as ThemeOverrides;
  return {
    ...theme,
    colors: { ...theme.colors, ...(o.colors || {}) } as ThemeColors,
    fonts: { ...theme.fonts, ...(o.fonts || {}) } as ThemeFonts,
    titleStyle: { ...theme.titleStyle, ...(o.titleStyle || {}) } as TitleStyle,
    margins: { ...theme.margins, ...(o.margins || {}) } as Margins,
  };
}

/** The theme a deck renders with: its base theme, with its brand's tokens on top (if it has one). */
/** The font pairing id stored on a deck's theme (`theme.fontPairing`), if any. */
export function deckPairingId(theme: unknown): string | undefined {
  return theme && typeof theme === "object" ? ((theme as any).fontPairing as string | undefined) : undefined;
}

/**
 * The theme a deck renders with: its base theme, then its typography pairing (if chosen),
 * then its brand's tokens on top (a brand's own fonts win over the pairing).
 */
export function resolveDeckTheme(themeId?: string, brand?: DeckBrand | null, fontPairing?: string | null): Theme {
  let theme = getTheme(themeId);
  const pairing = getPairing(fontPairing);
  if (pairing) theme = mergeTheme(theme, { fonts: { heading: pairing.heading, body: pairing.body } });
  if (!brand) return theme;
  return { ...mergeTheme(theme, brand.themeOverrides), brandId: brand.id };
}

/** True when a #RRGGBB colour is dark enough to need light text (relative luminance < 0.4). */
export function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l < 0.4;
}

export function getThemeCssVariables(theme: Theme, overrides?: ThemeOverrides | Partial<Theme>): Record<string, string> {
  const merged = mergeTheme(theme, overrides);
  const c = merged.colors;
  const f = merged.fonts;
  const isDark =
    c.bg === "#0B1120" ||
    c.bg === "#0F172A" ||
    c.bg.toLowerCase().startsWith("#0") ||
    c.bg.toLowerCase().startsWith("#1");

  return {
    "--theme-bg": c.bg,
    "--theme-text": c.text,
    "--theme-primary": c.primary,
    "--theme-secondary": c.secondary,
    "--theme-accent": c.accent,
    "--theme-muted": c.muted,
    "--theme-card-bg": isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.85)",
    "--theme-card-border": isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(226, 232, 240, 0.8)",
    "--theme-chart-1": c.chart[0] || "#2563EB",
    "--theme-chart-2": c.chart[1] || "#047857",
    "--theme-chart-3": c.chart[2] || "#B45309",
    "--theme-chart-4": c.chart[3] || "#7C3AED",
    "--theme-chart-5": c.chart[4] || "#BE185D",
    "--theme-chart-6": c.chart[5] || "#0369A1",
    "--theme-font-heading": fontStack(f.heading),
    "--theme-font-body": fontStack(f.body),
    "--theme-font-mono": `"${f.mono || "IBM Plex Mono"}", monospace`,
  };
}
