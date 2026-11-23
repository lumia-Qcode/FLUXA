import { useLayoutEffect, useRef, useState } from "react";

/**
 * Largest font size (between minFontSize and initialFontSize) at which the content fits its box.
 *
 * Measured, not estimated: a binary search over real layout, re-run when the content or box
 * changes, when the element's width changes, and once web fonts have loaded (fallback fonts
 * have different metrics, which is how text that fitted in the editor overflowed in present
 * mode and print). Spacing inside text blocks is in `em`, so it shrinks with the font.
 *
 * Works in logical stage pixels: the stage is scaled with a CSS transform, which does not
 * change scrollHeight/clientHeight, so editor, present, thumbnail and print agree.
 */
export function fitFontSize(el: HTMLElement, boxHeight: number, initial: number, min: number): number {
  const limit = Math.max(1, boxHeight > 0 ? Math.min(boxHeight, el.clientHeight || boxHeight) : el.clientHeight);
  const fits = (size: number) => {
    el.style.fontSize = `${size}px`;
    return el.scrollHeight <= limit + 1;
  };
  if (fits(initial)) return initial;
  let lo = min;
  let hi = initial;
  if (!fits(lo)) return lo;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  const size = Math.floor(lo * 2) / 2;
  el.style.fontSize = `${size}px`;
  return size;
}

export function useTextFit(
  contentDependency: unknown,
  boxHeight: number,
  initialFontSize: number = 24,
  minFontSize: number = 12
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState<number>(initialFontSize);
  const [fontsReady, setFontsReady] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setFontSize(fitFontSize(el, boxHeight, initialFontSize, minFontSize));
  }, [contentDependency, boxHeight, initialFontSize, minFontSize, fontsReady]);

  // Re-fit when web fonts finish loading and when the block is resized.
  useLayoutEffect(() => {
    const el = containerRef.current;
    let cancelled = false;
    const fonts = (typeof document !== "undefined" && (document as any).fonts) || null;
    if (fonts?.ready) {
      fonts.ready.then(() => !cancelled && setFontsReady((n) => n + 1)).catch(() => {});
    }
    if (!el || typeof ResizeObserver === "undefined") return () => { cancelled = true; };
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        setFontsReady((n) => n + 1);
      }
    });
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  return { containerRef, fontSize };
}
