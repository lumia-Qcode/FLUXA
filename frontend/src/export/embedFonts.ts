/**
 * Inlines the app's bundled font files (Fontsource) for the given families as base64 @font-face
 * rules, so an exported HTML file shows the deck's typography on any computer, offline.
 * Only the regular and bold weights of the Latin (and Arabic, for Arabic fonts) subsets are
 * embedded to keep the file small. Returns "" if anything fails; the export then falls back.
 */
// Browsers normalise "U+0000-00FF" to "U+0-FF", so match both spellings.
const KEEP_RANGE = /U\+0+-0*FF(?![0-9A-F])|U\+0*600-0*6FF(?![0-9A-F])/i;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function embedFontCss(families: string[]): Promise<string> {
  const wanted = new Set(families.map((f) => f.toLowerCase()));
  const rules: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of Array.from(list)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const s = rule.style;
      const family = s.getPropertyValue("font-family").replace(/["']/g, "").trim().toLowerCase();
      const weight = s.getPropertyValue("font-weight").trim();
      const range = s.getPropertyValue("unicode-range");
      if (!wanted.has(family) || !["400", "700", "normal", "bold"].includes(weight)) continue;
      if (s.getPropertyValue("font-style").trim() === "italic") continue;
      if (range && !KEEP_RANGE.test(range)) continue;
      rules.push(rule);
    }
  }
  const out: string[] = [];
  for (const rule of rules) {
    const src = rule.style.getPropertyValue("src");
    const m = src.match(/url\(["']?([^"')]+\.woff2[^"')]*)["']?\)/i);
    if (!m) continue;
    try {
      const res = await fetch(new URL(m[1], (rule.parentStyleSheet?.href || location.href)).href);
      if (!res.ok) continue;
      const data = await blobToDataUrl(await res.blob());
      const s = rule.style;
      out.push(
        `@font-face{font-family:'${s.getPropertyValue("font-family").replace(/["']/g, "").trim()}';` +
          `font-style:normal;font-weight:${s.getPropertyValue("font-weight").trim()};font-display:swap;` +
          `src:url(${data}) format('woff2');` +
          (s.getPropertyValue("unicode-range") ? `unicode-range:${s.getPropertyValue("unicode-range")};` : "") +
          `}`
      );
    } catch {
      /* skip this file */
    }
  }
  return out.join("\n");
}
