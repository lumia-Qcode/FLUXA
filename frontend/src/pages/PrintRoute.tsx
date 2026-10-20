import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Slide } from "../../../shared/spec";
import { SlideStage } from "../rendering/SlideStage";
import { getTheme, Theme } from "../rendering/themes";

export const PrintRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [presentation, setPresentation] = useState<any>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeck() {
      try {
        const res = await fetch(`/api/presentations/${id}`);
        const data = await res.json();
        setPresentation(data.presentation);
        setSlides(data.presentation.slides || []);
      } catch (err) {
        console.error("Print route load error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDeck();
  }, [id]);

  if (loading) return <div>Preparing presentation for print…</div>;
  if (!presentation || slides.length === 0) return <div>No slides to print.</div>;

  const themeId = typeof presentation.theme === "string" ? presentation.theme : presentation.theme?.themeId;
  const theme: Theme = getTheme(themeId);

  return (
    <div className="fluxa-print-document">
      <style>{`
        @page {
          size: 1920px 1080px;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0;
            padding: 0;
            background: #FFFFFF;
          }
          .fluxa-print-page {
            page-break-after: always;
            break-after: page;
            width: 1920px;
            height: 1080px;
            overflow: hidden;
            position: relative;
          }
        }
        @media screen {
          .fluxa-print-page {
            width: 1920px;
            height: 1080px;
            margin: 20px auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            overflow: hidden;
            position: relative;
          }
        }
      `}</style>

      {slides.map((slide, idx) => (
        <div key={slide.id || idx} className="fluxa-print-page">
          <SlideStage
            slide={slide}
            theme={theme}
            datasets={presentation.datasets}
            mode="print"
          />
        </div>
      ))}
    </div>
  );
};
