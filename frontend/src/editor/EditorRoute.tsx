import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Slide } from "../../../shared/spec";
import { DocumentProvider } from "./store/DocumentContext";
import { DeckDocument } from "./store/types";
import { EditorShell } from "./EditorShell";

export const EditorRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deckDoc, setDeckDoc] = useState<DeckDocument | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDeck() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/presentations/${id}`);
        if (!res.ok) {
          throw new Error(`Presentation not found (status ${res.status})`);
        }
        const data = await res.json();
        const p = data.presentation;
        if (!active) return;

        // Normalize slides
        const normalizedSlides: Slide[] = (p.slides || []).map((s: any, idx: number) => {
          if (s.spec && s.spec.blocks) {
            return {
              ...s.spec,
              id: s.spec.id || `slide-${s.id || idx + 1}`,
              order: s.spec.order ?? s.slide_order ?? idx,
            };
          }

          // Fallback if slide has legacy title/content without spec
          return {
            id: `slide-${s.id || idx + 1}`,
            order: s.slide_order ?? idx,
            layout: "title",
            notes: "",
            blocks: [
              {
                id: `block-${s.id || idx + 1}-title`,
                type: "text",
                x: 10,
                y: 20,
                w: 80,
                h: 20,
                content: s.title || "Untitled Slide",
                style: { fontSize: 44, fontWeight: 700, align: "center" },
                role: "title",
              },
              ...(s.content
                ? [
                    {
                      id: `block-${s.id || idx + 1}-body`,
                      type: "text" as const,
                      x: 15,
                      y: 45,
                      w: 70,
                      h: 40,
                      content: s.content,
                      style: { fontSize: 22 },
                      role: "body" as const,
                    },
                  ]
                : []),
            ],
          };
        });

        // Ensure at least one slide exists
        if (normalizedSlides.length === 0) {
          normalizedSlides.push({
            id: "slide-1",
            order: 0,
            layout: "title",
            notes: "",
            blocks: [
              {
                id: "block-1",
                type: "text",
                x: 10,
                y: 35,
                w: 80,
                h: 30,
                doc: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: p.title || "Untitled Presentation" }],
                    },
                  ],
                },
                style: { fontSize: 48, fontWeight: 700, align: "center" },
                role: "title",
              },
            ],
          });
        }

        const doc: DeckDocument = {
          id: Number(p.id),
          title: p.title || "Untitled Presentation",
          description: p.description || "",
          theme:
            typeof p.theme === "string"
              ? { themeId: p.theme }
              : p.theme && p.theme.themeId
              ? p.theme
              : { themeId: "default" },
          datasets: p.datasets || {},
          variables: p.variables || {},
          settings: p.settings || { transition: { effect: "fade", duration: 300 }, loop: false },
          revision: p.revision || 1,
          schemaVersion: p.schema_version || 1,
          slides: normalizedSlides,
        };

        setDeckDoc(doc);
      } catch (err: any) {
        if (active) setError(err.message || "Failed to load presentation");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDeck();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-canvas, #0D0F12)",
          color: "var(--ink-secondary, #9CA3AF)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          fontSize: 14,
        }}
      >
        Loading presentation…
      </div>
    );
  }

  if (error || !deckDoc) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          backgroundColor: "var(--bg-canvas, #0D0F12)",
          color: "var(--ink, #FFFFFF)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>Unable to load presentation</h2>
        <p style={{ margin: 0, color: "var(--ink-secondary, #9CA3AF)", fontSize: 14 }}>
          {error || "Presentation could not be found."}
        </p>
        <Link
          to="/"
          style={{
            padding: "8px 16px",
            backgroundColor: "var(--signal, #3B82F6)",
            color: "#FFF",
            borderRadius: "var(--radius-md, 6px)",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <DocumentProvider key={deckDoc.id} initialDoc={deckDoc}>
      <EditorShell />
    </DocumentProvider>
  );
};
