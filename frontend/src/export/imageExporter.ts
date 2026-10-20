import JSZip from "jszip";
import { toBlob } from "html-to-image";
import { DeckDocument } from "../editor/store/types";

/**
 * Exports all slides as PNG images packaged in a zip archive.
 * If live DOM stage elements are present, captures using html-to-image;
 * otherwise generates rendered canvas frames.
 */
export async function exportSlidesToZip(
  doc: DeckDocument,
  options?: {
    onProgress?: (progress: { current: number; total: number; stage: string }) => void;
  }
): Promise<Blob> {
  const zip = new JSZip();
  const totalSlides = doc.slides.length;

  for (let idx = 0; idx < totalSlides; idx++) {
    const slide = doc.slides[idx];
    const slideNumber = String(idx + 1).padStart(2, "0");
    const filename = `slide-${slideNumber}.png`;

    options?.onProgress?.({
      current: idx + 1,
      total: totalSlides,
      stage: `Rendering ${filename}…`,
    });

    // Check if the slide stage element is in the DOM
    const stageEl = document.querySelector(".ui-slide-stage") as HTMLElement;
    let blob: Blob | null = null;

    if (stageEl && idx === 0) {
      try {
        blob = await toBlob(stageEl, { pixelRatio: 1.5, cacheBust: true });
      } catch {
        blob = null;
      }
    }

    if (!blob) {
      // Fallback: render high-resolution 1920x1080 canvas
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Draw background
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, 1920, 1080);

        // Draw slide header
        const titleBlock = slide.blocks.find((b) => b.role === "title" || b.type === "text") as any;
        const slideTitle = (slide as any).title || titleBlock?.props?.text || `Slide ${idx + 1}`;
        ctx.fillStyle = "#111827";
        ctx.font = "bold 56px sans-serif";
        ctx.fillText(slideTitle, 100, 160);

        // Draw slide watermark / indicator
        ctx.fillStyle = "#6B7280";
        ctx.font = "24px sans-serif";
        ctx.fillText(`FLUXA — ${doc.title || "Presentation"} | Slide ${idx + 1} of ${totalSlides}`, 100, 1000);

        // Draw blocks overview
        slide.blocks.forEach((b) => {
          if (b.type === "text") {
            ctx.fillStyle = "#374151";
            ctx.font = "28px sans-serif";
            const text = (b as any).props?.text || "Slide content";
            ctx.fillText(text.slice(0, 80), b.x, b.y + 40);
          } else if (b.type === "kpi") {
            ctx.fillStyle = "#2563EB";
            ctx.font = "bold 72px sans-serif";
            ctx.fillText(String(b.value), b.x, b.y + 80);
            ctx.fillStyle = "#4B5563";
            ctx.font = "24px sans-serif";
            ctx.fillText(b.label || "", b.x, b.y + 120);
          } else {
            ctx.fillStyle = "#F3F4F6";
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeStyle = "#E5E7EB";
            ctx.strokeRect(b.x, b.y, b.w, b.h);
          }
        });

        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      }
    }

    if (blob) {
      zip.file(filename, blob);
    }
  }

  options?.onProgress?.({
    current: totalSlides,
    total: totalSlides,
    stage: "Compressing images into zip archive…",
  });

  return await zip.generateAsync({ type: "blob" });
}
