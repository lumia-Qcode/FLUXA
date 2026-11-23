/**
 * Typography pairings for slides, chosen per deck independently of the colour theme.
 * All families are open-licence (Google Fonts / Fontsource). See index.html / fonts.css for loading.
 */
export interface FontPairing {
  id: string;
  name: string;
  heading: string;
  body: string;
  /** Generic fallback when the family hasn't loaded. */
  headingKind: "serif" | "sans-serif";
  bodyKind: "serif" | "sans-serif";
  /** Short description shown in the picker. */
  mood: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "editorial", name: "Editorial", heading: "Playfair Display", body: "Source Sans 3", headingKind: "serif", bodyKind: "sans-serif", mood: "Magazine-style, persuasive" },
  { id: "classic-serif", name: "Classic serif", heading: "Source Serif 4", body: "Literata", headingKind: "serif", bodyKind: "serif", mood: "Reports, research, policy" },
  { id: "geometric", name: "Geometric", heading: "Montserrat", body: "Work Sans", headingKind: "sans-serif", bodyKind: "sans-serif", mood: "Clean, modern, startup" },
  { id: "poster", name: "Bold poster", heading: "Red Hat Display", body: "Work Sans", headingKind: "sans-serif", bodyKind: "sans-serif", mood: "Big statements, keynotes" },
  { id: "elegant", name: "Elegant", heading: "Cormorant Garamond", body: "Lato", headingKind: "serif", bodyKind: "sans-serif", mood: "Luxury, culture, history" },
  { id: "friendly", name: "Friendly", heading: "Nunito", body: "Nunito Sans", headingKind: "sans-serif", bodyKind: "sans-serif", mood: "Education, community, warm" },
  { id: "condensed", name: "Condensed impact", heading: "Oswald", body: "Source Sans 3", headingKind: "sans-serif", bodyKind: "sans-serif", mood: "Sports, news, data-heavy" },
  { id: "tech", name: "Tech", heading: "Archivo", body: "IBM Plex Sans", headingKind: "sans-serif", bodyKind: "sans-serif", mood: "Engineering, AI, product" },
  { id: "humanist", name: "Humanist", heading: "Fraunces", body: "Public Sans", headingKind: "serif", bodyKind: "sans-serif", mood: "Health, people, sustainability" },
  { id: "accessible", name: "Accessible", heading: "Atkinson Hyperlegible", body: "Atkinson Hyperlegible", headingKind: "sans-serif", bodyKind: "sans-serif", mood: "Maximum legibility" },
  { id: "urdu", name: "Urdu / Arabic", heading: "Noto Naskh Arabic", body: "Noto Naskh Arabic", headingKind: "serif", bodyKind: "serif", mood: "Right-to-left scripts" },
];

export function getPairing(id?: string | null): FontPairing | undefined {
  return id ? FONT_PAIRINGS.find((p) => p.id === id) : undefined;
}

const SERIF = new Set(FONT_PAIRINGS.flatMap((p) => [p.headingKind === "serif" ? p.heading : "", p.bodyKind === "serif" ? p.body : ""]).filter(Boolean).concat(["Literata", "Source Serif 4"]));

/** CSS font-family stack with a matching generic fallback (serif fonts fall back to serif). */
export function fontStack(family: string): string {
  return `"${family}", ${SERIF.has(family) ? "Georgia, 'Times New Roman', serif" : "system-ui, sans-serif"}`;
}
