import React, { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Slide } from "../../../shared/spec";
import { SlideStage } from "../rendering/SlideStage";
import { resolveDeckTheme, Theme } from "../rendering/themes";

/**
 * PDF export: one 1920x1080 page per slide, rendered by the same SlideStage as the editor
 * and present mode (mode "print": scale 1, no toolbars, charts drawn in their final state).
 *
 * The page waits for everything a slide needs before it is printed - web fonts, every image
 * (loaded or failed), charts and a couple of frames for layout and text fitting - and then
 * marks itself `data-print-ready`. With `?autoprint=1` it opens the print dialog itself, so
 * "Save as PDF" never captures a half-loaded deck.
 */

const PAGE_W = 1920;
const PAGE_H = 1080;

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForImages(root: HTMLElement, timeoutMs: number) {
  const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function waitUntilPrintable(root: HTMLElement, timeoutMs = 20000) {
  const fonts = (document as any).fonts;
  if (fonts?.ready) await Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
  // Images can appear after the first render (3D stills, lazy blocks): check twice.
  await waitForImages(root, timeoutMs);
  await nextFrame();
  await waitForImages(root, timeoutMs / 2);
  // Text fitting re-runs after fonts load; let it and the charts settle.
  await nextFrame();
  await nextFrame();
  await new Promise((r) => setTimeout(r, 300));
}

export const PrintRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const autoprint = new URLSearchParams(location.search).get("autoprint") === "1";
  const [presentation, setPresentation] = useState<any>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function fetchDeck() {
      try {
        const res = await fetch(`/api/presentations/${id}`);
        if (!res.ok) throw new Error(`The presentation could not be loaded (${res.status}).`);
        const data = await res.json();
        setPresentation(data.presentation);
        setSlides((data.presentation.slides || []).filter((s: any) => !(s.spec?.hidden ?? s.hidden)));
      } catch (err: any) {
        setError(err?.message || "The presentation could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    fetchDeck();
  }, [id]);

  useEffect(() => {
    if (!presentation || !rootRef.current) return;
    let cancelled = false;
    waitUntilPrintable(rootRef.current).then(() => {
      if (cancelled) return;
      setReady(true);
      if (autoprint) setTimeout(() => window.print(), 50);
    });
    return () => {
      cancelled = true;
    };
  }, [presentation, slides.length, autoprint]);

  if (loading) return <div style={{ padding: 24 }}>Preparing presentation for print…</div>;
  if (error) return <div style={{ padding: 24 }}>{error}</div>;
  if (!presentation || slides.length === 0) return <div style={{ padding: 24 }}>No slides to print.</div>;

  const themeId = typeof presentation.theme === "string" ? presentation.theme : presentation.theme?.themeId;
  const theme: Theme = resolveDeckTheme(themeId, presentation.brand, presentation.theme?.fontPairing);

  return (
    <div className="fluxa-print-document" ref={rootRef} data-print-ready={ready ? "true" : "false"} data-page-count={slides.length}>
      <style>{`
        @page {
          size: ${PAGE_W}px ${PAGE_H}px;
          margin: 0;
        }
        html, body, #root {
          margin: 0 !important;
          padding: 0 !important;
          background: #FFFFFF;
          overflow: visible !important;
          height: auto !important;
          min-height: 0 !important;
        }
        .fluxa-print-document, .fluxa-print-document * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          animation: none !important;
          transition: none !important;
        }
        .fluxa-print-page {
          width: ${PAGE_W}px;
          height: ${PAGE_H}px;
          overflow: hidden;
          position: relative;
          box-sizing: border-box;
        }
        @media print {
          .fluxa-print-document { width: ${PAGE_W}px; }
          .fluxa-print-page {
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
          }
          /* No trailing blank page after the last slide. */
          .fluxa-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .fluxa-print-status { display: none !important; }
        }
        @media screen {
          .fluxa-print-document { background: #E6E6E8; padding: 20px 0; }
          .fluxa-print-page { margin: 0 auto 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
        }
      `}</style>

      <div
        className="fluxa-print-status"
        style={{ position: "fixed", top: 12, right: 12, zIndex: 10, background: "#FFFFFF", border: "1px solid #D9D9DD", borderRadius: 6, padding: "8px 12px", font: "13px sans-serif" }}
      >
        {ready ? (
          <>
            {slides.length} slides ready.{" "}
            <button type="button" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          </>
        ) : (
          "Loading fonts, images and charts…"
        )}
      </div>

      {slides.map((slide, idx) => (
        <div key={slide.id || idx} className="fluxa-print-page" data-slide-index={idx}>
          <SlideStage slide={slide} theme={theme} datasets={presentation.datasets} mode="print" />
        </div>
      ))}
    </div>
  );
};
