import { useLayoutEffect, useRef, useState } from "react";

/**
 * Calculates an optimal font-size scaling factor to guarantee content does not overflow its box.
 * Shrinks font down to minFontSize.
 */
export function useTextFit(
  contentDependency: unknown,
  boxHeight: number,
  initialFontSize: number = 24,
  minFontSize: number = 12
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState<number>(initialFontSize);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || boxHeight <= 0) return;

    // Reset to initial font size to measure natural content height
    el.style.fontSize = `${initialFontSize}px`;

    const scrollH = el.scrollHeight;
    if (scrollH > boxHeight) {
      // Content overflows: scale font down proportionally
      const ratio = boxHeight / scrollH;
      const targetSize = Math.max(minFontSize, Math.floor(initialFontSize * ratio * 0.95));
      setFontSize(targetSize);
      el.style.fontSize = `${targetSize}px`;
    } else {
      setFontSize(initialFontSize);
      el.style.fontSize = `${initialFontSize}px`;
    }
  }, [contentDependency, boxHeight, initialFontSize, minFontSize]);

  return { containerRef, fontSize };
}
