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
          const slideId = s.id ? `slide-${s.id}` : (s.spec?.id || `slide-${idx + 1}`);
          const rawSpec =
            typeof s.spec === "string"
              ? (() => {
                  try {
                    return JSON.parse(s.spec);
                  } catch {
                    return null;
                  }
                })()
              : s.spec;

          const slideTitle = s.title || rawSpec?.title || `Slide ${idx + 1}`;

          if (rawSpec && rawSpec.blocks) {
            const rawBlocks = rawSpec.blocks || [];
            const normalizedBlocks = rawBlocks.map((b: any, bIdx: number) => {
              const x = b.x ?? b.box?.x ?? 100;
              const y = b.y ?? b.box?.y ?? 100;
              const w = b.w ?? b.box?.w ?? 800;
              const h = b.h ?? b.box?.h ?? 400;

              let doc = b.doc;
              const bullets = b.bullets ?? b.props?.bullets;
              const content = b.content ?? b.props?.text ?? b.text ?? "";

              if (!doc) {
                if (Array.isArray(bullets) && bullets.length > 0) {
                  doc = {
                    type: "doc",
                    content: [
                      {
                        type: "bulletList",
                        content: bullets.map((item: any) => ({
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: String(item) }],
                            },
                          ],
                        })),
                      },
                    ],
                  };
                } else if (content) {
                  doc = {
                    type: "doc",
                    content: [{ type: "paragraph", content: [{ type: "text", text: String(content) }] }],
                  };
                }
              }

              const columns =
                b.columns ??
                b.props?.columns ??
                (b.props?.leftTitle
                  ? [
                      { title: b.props.leftTitle, items: b.props.leftItems || [] },
                      {
                        title: b.props.rightTitle || "Alternative",
                        items: b.props.rightItems || [],
                      },
                    ]
                  : undefined);

              const items =
                b.items ??
                b.props?.items ??
                (b.props?.steps
                  ? b.props.steps.map((st: any, sIdx: number) => ({
                      title: st.title || st.step || `Phase ${sIdx + 1}`,
                      body: st.body || st.desc || "",
                      date: st.date || `0${sIdx + 1}`,
                    }))
                  : undefined);

              const text = b.text ?? b.props?.text ?? content;
              const attribution =
                b.attribution ??
                b.props?.attribution ??
                b.props?.author ??
                b.author;

              return {
                ...b,
                id: b.id || `blk-${bIdx}`,
                x,
                y,
                w,
                h,
                doc,
                content,
                bullets,
                columns,
                items,
                text,
                attribution,
                style: { ...(b.style || {}), ...(b.props || {}) },
                value: b.value ?? b.props?.value,
                label: b.label ?? b.props?.label,
                delta: b.delta ?? b.props?.delta,
                control: b.control ?? b.props?.control,
                variable: b.variable ?? b.props?.variable,
                min: b.min ?? b.props?.min,
                max: b.max ?? b.props?.max,
                step: b.step ?? b.props?.step,
                kind: b.kind ?? b.props?.kind,
                dataset: b.dataset ?? b.props?.dataset,
                xField: b.xField ?? b.props?.xField,
                citations: b.citations ?? b.props?.citations,
                swot: b.swot ?? b.props?.swot,
                marketSize: b.marketSize ?? b.props?.marketSize,
                funnel: b.funnel ?? b.props?.funnel,
                series:
                  b.series ??
                  b.props?.series ??
                  (b.props?.yField
                    ? [{ field: b.props.yField, label: b.props?.title || "Value" }]
                    : undefined),
              };
            });

            return {
              ...rawSpec,
              id: slideId,
              title: slideTitle,
              order: rawSpec.order ?? s.slide_order ?? idx,
              blocks: normalizedBlocks,
            };
          }

          // Fallback if slide has legacy title/content without spec
          const isFirstSlide = idx === 0;
          return {
            id: slideId,
            order: s.slide_order ?? idx,
            layout: isFirstSlide ? "title" : "bullets",
            notes: "",
            blocks: isFirstSlide
              ? [
                  {
                    id: `block-${s.id || idx + 1}-title`,
                    type: "text",
                    x: 160,
                    y: 340,
                    w: 1600,
                    h: 220,
                    content: s.title || "Untitled Presentation",
                    style: { fontSize: 64, fontWeight: 700, align: "center", lineHeight: 1.2 },
                    role: "title",
                  },
                  ...(s.content
                    ? [
                        {
                          id: `block-${s.id || idx + 1}-sub`,
                          type: "text" as const,
                          x: 240,
                          y: 580,
                          w: 1440,
                          h: 140,
                          content: s.content,
                          style: { fontSize: 32, align: "center", color: "#64748B" },
                          role: "subtitle" as const,
                        },
                      ]
                    : []),
                ]
              : [
                  {
                    id: `block-${s.id || idx + 1}-title`,
                    type: "text",
                    x: 100,
                    y: 80,
                    w: 1720,
                    h: 120,
                    content: s.title || `Slide ${idx + 1}`,
                    style: { fontSize: 52, fontWeight: 700, align: "left" },
                    role: "title",
                  },
                  ...(s.content
                    ? [
                        {
                          id: `block-${s.id || idx + 1}-body`,
                          type: "text" as const,
                          x: 100,
                          y: 240,
                          w: 1720,
                          h: 720,
                          content: s.content,
                          bullets: s.content
                            .split("\n")
                            .map((l: string) => l.replace(/^[-*•]\s*/, "").trim())
                            .filter(Boolean),
                          style: { fontSize: 28, lineHeight: 1.6 },
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
                x: 160,
                y: 360,
                w: 1600,
                h: 220,
                doc: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: p.title || "Untitled Presentation" }],
                    },
                  ],
                },
                style: { fontSize: 64, fontWeight: 700, align: "center" },
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
            typeof p.theme === "string" && p.theme !== "default" && p.theme !== "clean-light"
              ? { themeId: p.theme }
              : p.theme && p.theme.themeId && p.theme.themeId !== "default" && p.theme.themeId !== "clean-light"
              ? p.theme
              : { themeId: "midnight", ...(p.theme?.fontPairing ? { fontPairing: p.theme.fontPairing } : {}) },
          datasets: p.datasets || {},
          variables: p.variables || {},
          settings: p.settings || { transition: { effect: "fade", duration: 300 }, loop: false },
          revision: p.revision || 1,
          schemaVersion: p.schema_version || 1,
          slides: normalizedSlides,
          brand: p.brand ?? null,
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
