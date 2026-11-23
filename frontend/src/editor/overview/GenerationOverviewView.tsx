import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DeckDocument } from "../store/types";
import { Theme } from "../../rendering/themes";
import { SlideStage } from "../../rendering/SlideStage";
import { preloadDeck } from "../../rendering/preload";
import { ArrowLeft, Download, ExternalLink, Play, PenLine, Sparkles } from "lucide-react";

interface Props {
  doc: DeckDocument;
  theme: Theme;
  onEditSlide: (slideId: string) => void;
  onEditWithCopilot?: (slideId: string) => void;
  onPresent: () => void;
  onExport: () => void;
}

type Tab = "slides" | "outline" | "sources";

const KIND_LABEL: Record<string, string> = {
  journal: "Peer-reviewed",
  scholarly: "Scholarly",
  government: "Official",
  academic: "University",
  encyclopedia: "Encyclopedia",
  documentation: "Documentation",
  reference: "Reference",
  media: "News & research",
  web: "Web",
};

function slideTitle(slide: any): string {
  const blocks = slide?.blocks || slide?.spec?.blocks || [];
  const t = blocks.find((b: any) => b.role === "title");
  return String(t?.content || t?.props?.text || t?.text || slide?.title || "Untitled slide");
}

function slideCitations(slide: any): string[] {
  const blocks = slide?.blocks || slide?.spec?.blocks || [];
  const out: string[] = [];
  blocks.forEach((b: any) => (b.citations || b.props?.citations || []).forEach((c: string) => !out.includes(c) && out.push(c)));
  return out;
}

/** Overview after generation: what the deck is, what it's built on, and every slide. */
export const GenerationOverviewView: React.FC<Props> = ({ doc, theme, onEditSlide, onEditWithCopilot, onPresent, onExport }) => {
  const [tab, setTab] = useState<Tab>("slides");
  const slides = doc.slides || [];
  const dossier = (doc.variables as any)?.research_dossier || {};
  const sources: any[] = Array.isArray(dossier.sources) ? dossier.sources : [];
  const legacyCitations: any[] = !sources.length && Array.isArray(dossier.citations) ? dossier.citations : [];
  const trace = dossier.research_trace || {};
  const limitations: string[] = Array.isArray(dossier.limitations) ? dossier.limitations : [];
  const references = useMemo(
    () => slides.filter((s: any) => (s.layout || s.spec?.layout) === "references"),
    [slides]
  );
  const contentSlides = slides.length - references.length;
  const heroSlides = slides.slice(0, 3);
  const words = (doc.title || "Presentation").toUpperCase().split(/\s+/);
  const firstSlideId = slides[0]?.id;
  // Warm the image cache while the overview is open, so Present starts instantly.
  useEffect(() => {
    const id = window.setTimeout(() => preloadDeck(slides), 800);
    return () => window.clearTimeout(id);
  }, [slides]);

  return (
    <div className="ov">
      <style>{OV_CSS}</style>

      {/* Top bar: same pill language as the landing page */}
      <header className="ov-top">
        <div className="ov-top-left">
          <Link to="/workspace" className="ov-icon" title="Back to workspace" aria-label="Back to workspace">
            <ArrowLeft size={17} strokeWidth={1.75} />
          </Link>
          <span className="ov-logo">FLUXA</span>
        </div>
        <nav className="ov-nav" aria-label="Overview sections">
          {(["slides", "outline", "sources"] as Tab[]).map((t) => (
            <button key={t} type="button" className={tab === t ? "on" : ""} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === "slides" ? "Slides" : t === "outline" ? "Outline" : "Sources"}
            </button>
          ))}
        </nav>
        <div className="ov-top-right">
          <button type="button" className="ov-ghost" onClick={onExport}>
            <Download size={14} strokeWidth={1.75} /> Export
          </button>
          {firstSlideId && (
            <button type="button" className="ov-ghost" onClick={() => onEditSlide(firstSlideId)}>
              <PenLine size={14} strokeWidth={1.75} /> Edit
            </button>
          )}
          <button type="button" className="ov-start" onClick={onPresent}>
            <Play size={13} fill="currentColor" strokeWidth={1.75} /> Present
          </button>
        </div>
      </header>

      <main className="ov-main">
        {/* Hero: oversized title over layered slide previews (reference: editorial poster sites) */}
        <section className="ov-hero">
          <div className="ov-glow" aria-hidden="true" />
          <h1
            className="ov-title"
            title={doc.title}
            // The longest word must fit the width: ~0.62em per uppercase character in Plex Sans Bold.
            style={{ fontSize: `clamp(40px, min(8.2vw, calc(88vw / ${(Math.max(...words.map((w) => w.length)) * 0.64).toFixed(2)})), 132px)` }}
          >
            {words.map((w, i) => (
              <span key={i} className={i === words.length - 1 ? "ov-title-last" : undefined}>
                {w}{" "}
              </span>
            ))}
          </h1>
          <div className="ov-stack" aria-hidden="true">
            {heroSlides.map((s, i) => (
              <div key={s.id} className={`ov-stack-card ov-stack-${i}`}>
                <div className="ov-chrome"><i /><i /><i /></div>
                <div className="ov-stack-stage">
                  <SlideStage slide={s} theme={theme} datasets={doc.datasets} mode="thumbnail" />
                </div>
              </div>
            ))}
          </div>
          <dl className="ov-stats">
            <div><dt>Slides</dt><dd>{contentSlides}</dd></div>
            <div><dt>Sources</dt><dd>{sources.length || legacyCitations.length}</dd></div>
            <div><dt>Reference slides</dt><dd>{references.length}</dd></div>
            <div>
              <dt>Research</dt>
              <dd className="ov-small">
                {dossier.research_mode === "live" ? "Live sources" : dossier.research_mode === "unavailable" ? "No sources found" : dossier.research_mode ? "Not live" : "None recorded"}
              </dd>
            </div>
          </dl>
          <div className="ov-actions">
            {doc.description && <p className="ov-brief">{doc.description}</p>}
            {firstSlideId && (
              <div className="ov-row">
                <button type="button" className="ov-start ov-big" onClick={() => (onEditWithCopilot || onEditSlide)(firstSlideId)}>
                  <Sparkles size={15} strokeWidth={1.75} /> Edit with Copilot
                </button>
                <button type="button" className="ov-ghost ov-big" onClick={() => onEditSlide(firstSlideId)}>
                  <PenLine size={15} strokeWidth={1.75} /> Open editor
                </button>
              </div>
            )}
          </div>
        </section>

        {tab === "slides" && (
          <section className="ov-section" aria-label="Slides">
            <h2 className="ov-h2">Slides</h2>
            <div className="ov-grid">
              {slides.map((s: any, i: number) => (
                <button key={s.id} type="button" className="ov-card" onClick={() => onEditSlide(s.id)} title="Open in the editor">
                  <div className="ov-card-stage">
                    <SlideStage slide={s} theme={theme} datasets={doc.datasets} mode="thumbnail" />
                  </div>
                  <div className="ov-card-meta">
                    <span className="ov-num">{String(i + 1).padStart(2, "0")}</span>
                    <span className="ov-card-title">{slideTitle(s)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === "outline" && (
          <section className="ov-section" aria-label="Outline">
            <h2 className="ov-h2">Outline</h2>
            <ol className="ov-outline">
              {slides.map((s: any, i: number) => {
                const cites = slideCitations(s);
                return (
                  <li key={s.id}>
                    <span className="ov-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <button type="button" className="ov-link" onClick={() => onEditSlide(s.id)}>{slideTitle(s)}</button>
                      {cites.length > 0 && <p className="ov-muted">{cites.join("   ")}</p>}
                      {s.notes && <p className="ov-notes">{String(s.notes).slice(0, 220)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {tab === "sources" && (
          <section className="ov-section" aria-label="Sources">
            <h2 className="ov-h2">Sources</h2>
            {(trace.query_count || limitations.length > 0) && (
              <div className="ov-research">
                {trace.query_count ? (
                  <p>
                    {trace.successful_queries ?? "?"} of {trace.query_count} searches answered, {trace.documents_retrieved ?? "?"} documents read,{" "}
                    {trace.sources_kept ?? sources.length} kept{trace.seconds ? ` in ${trace.seconds} s` : ""}.
                  </p>
                ) : null}
                {limitations.map((l, i) => (
                  <p key={i} className="ov-muted">{l}</p>
                ))}
              </div>
            )}
            {sources.length > 0 ? (
              <ul className="ov-sources">
                {sources.map((src: any) => {
                  const year = /(1[5-9]|20)\d\d/.exec(src.published || "")?.[0];
                  return (
                    <li key={src.id}>
                      <span className="ov-tag">{KIND_LABEL[src.kind] || src.kind || "Source"}</span>
                      <div>
                        <a href={src.url} target="_blank" rel="noreferrer noopener" className="ov-src-title">
                          {src.title || src.url} <ExternalLink size={12} strokeWidth={1.75} />
                        </a>
                        <p className="ov-muted">
                          {[src.authors?.slice(0, 3).join(", "), src.venue || src.organization, year].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : legacyCitations.length > 0 ? (
              <ul className="ov-sources">
                {legacyCitations.map((c: any, i: number) => (
                  <li key={i}>
                    <span className="ov-tag">Source</span>
                    <div>
                      <span className="ov-src-title">{c.title || c.source}</span>
                      <p className="ov-muted">This deck was made before sources were verified; check these before presenting.</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ov-muted">No research sources are recorded for this presentation.</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

const OV_CSS = `
.ov{position:fixed;inset:0;overflow-y:auto;background:#000;color:#fff;font-family:'IBM Plex Sans',system-ui,sans-serif;--peri:#aebfff;--peri-2:#8aa0ff;--line:#26262b;--card:#101013}
.ov *{box-sizing:border-box}
.ov-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 28px;background:rgba(0,0,0,.86);border-bottom:1px solid #141417}
.ov-top-left,.ov-top-right{display:flex;align-items:center;gap:10px}
.ov-logo{font-weight:700;font-size:18px;letter-spacing:.02em}
.ov-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;color:#fff;background:#1b1b1e}
.ov-icon:hover{background:#2a2a2f}
.ov-nav{display:flex;gap:4px;padding:5px;background:#1b1b1e;border-radius:999px}
.ov-nav button{background:none;border:0;color:#b9b9c0;font:500 13px inherit;font-family:inherit;padding:7px 16px;border-radius:999px;cursor:pointer}
.ov-nav button:hover{color:#fff}
.ov-nav button.on{background:#3a3a40;color:#fff}
.ov-ghost{display:inline-flex;align-items:center;gap:6px;background:transparent;color:#e7e7ea;border:1px solid #3a3a40;border-radius:999px;padding:8px 14px;font:500 13px inherit;font-family:inherit;cursor:pointer}
.ov-ghost:hover{border-color:var(--peri);color:#fff}
.ov-start{display:inline-flex;align-items:center;gap:6px;background:var(--peri);color:#0a0a0c;border:0;border-radius:999px;padding:9px 20px;font:600 13px inherit;font-family:inherit;cursor:pointer}
.ov-start:hover{background:#c6d2ff}
.ov-main{max-width:1440px;margin:0 auto;padding:0 28px 80px}
.ov-hero{position:relative;min-height:560px;padding:56px 0 40px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);grid-template-rows:auto auto 1fr;column-gap:40px;isolation:isolate}
.ov-glow{position:absolute;inset:-40px -28px 0;z-index:-1;background:radial-gradient(60% 70% at 78% 40%,rgba(90,110,255,.42) 0%,rgba(60,70,200,.18) 38%,transparent 70%),radial-gradient(40% 50% at 10% 90%,rgba(174,191,255,.10) 0%,transparent 70%)}
.ov-title{grid-column:1/-1;grid-row:1;margin:0;font-weight:700;line-height:.9;letter-spacing:-.02em;font-size:clamp(48px,8.2vw,132px);overflow-wrap:anywhere;position:relative;z-index:2;mix-blend-mode:normal}
.ov-title-last{background:linear-gradient(180deg,#fff 0%,#dfe5ff 45%,var(--peri-2) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.ov-stack{grid-column:2;grid-row:2/4;position:relative;min-height:340px;margin-top:-30px}
.ov-stack-card{position:absolute;width:78%;border-radius:12px;overflow:hidden;background:#0d0d10;border:1px solid #2a2a30;box-shadow:0 30px 60px rgba(0,0,0,.55)}
.ov-chrome{height:22px;display:flex;align-items:center;gap:6px;padding:0 10px;background:#f2f2f4}
.ov-chrome i{width:8px;height:8px;border-radius:50%;background:#c9c9cf;display:block}
.ov-chrome i:first-child{background:#ff6b6b}.ov-chrome i:nth-child(2){background:#ffcc4d}.ov-chrome i:nth-child(3){background:#5ad17e}
.ov-stack-stage{aspect-ratio:16/9;position:relative}
.ov-stack-0{left:0;top:30px;transform:rotate(-4deg);z-index:1}
.ov-stack-1{right:0;top:0;transform:rotate(3deg);z-index:2}
.ov-stack-2{left:16%;top:150px;transform:rotate(-1deg);z-index:3}
.ov-stats{grid-column:1;grid-row:2;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:36px 0 0;padding:0}
.ov-stats div{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px}
.ov-stats dt{font-size:12px;color:#a4a4ac;margin-bottom:6px}
.ov-stats dd{margin:0;font-size:34px;font-weight:600;line-height:1}
.ov-stats dd.ov-small{font-size:16px;line-height:1.25;color:var(--peri)}
.ov-actions{grid-column:1;grid-row:3;display:flex;flex-direction:column;gap:18px;margin-top:20px}
.ov-brief{margin:0;max-width:560px;font-size:14px;line-height:1.6;color:#c9c9d0}
.ov-row{display:flex;gap:10px;flex-wrap:wrap}
.ov-big{padding:12px 22px;font-size:14px}
.ov-section{margin-top:28px}
.ov-h2{font-size:clamp(28px,3.2vw,44px);font-weight:700;letter-spacing:-.01em;margin:0 0 20px;text-transform:uppercase}
.ov-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}
.ov-card{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:10px}
.ov-card-stage{aspect-ratio:16/9;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#0d0d10;position:relative}
.ov-card:hover .ov-card-stage,.ov-card:focus-visible .ov-card-stage{border-color:var(--peri)}
.ov-card:focus-visible{outline:2px solid var(--peri);outline-offset:4px;border-radius:12px}
.ov-card-meta{display:flex;gap:12px;align-items:baseline}
.ov-num{font-weight:700;font-size:14px;color:var(--peri);font-variant-numeric:tabular-nums;flex-shrink:0}
.ov-card-title{font-size:14px;line-height:1.4;color:#e7e7ea}
.ov-outline{list-style:none;margin:0;padding:0;border-top:1px solid #1b1b1e}
.ov-outline li{display:flex;gap:20px;padding:18px 0;border-bottom:1px solid #1b1b1e}
.ov-outline .ov-num{font-size:22px;width:44px}
.ov-link{all:unset;cursor:pointer;font-size:20px;font-weight:600;line-height:1.3}
.ov-link:hover{color:var(--peri)}
.ov-muted{margin:6px 0 0;font-size:13px;line-height:1.5;color:#a4a4ac}
.ov-notes{margin:8px 0 0;font-size:13px;line-height:1.55;color:#c9c9d0;max-width:860px}
.ov-research{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 20px;margin-bottom:18px}
.ov-research p:first-child{margin:0;font-size:15px}
.ov-sources{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}
.ov-sources li{display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.ov-tag{flex-shrink:0;font-size:11px;font-weight:600;color:#0a0a0c;background:var(--peri);border-radius:999px;padding:3px 9px;margin-top:2px}
.ov-src-title{color:#fff;text-decoration:none;font-size:14px;line-height:1.4;font-weight:500}
a.ov-src-title:hover{color:var(--peri)}
@media(max-width:980px){.ov-hero{grid-template-columns:1fr;grid-template-rows:auto auto auto auto}.ov-stack{grid-column:1;grid-row:4;min-height:300px;margin-top:24px}.ov-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ov-nav{display:none}.ov-sources{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.ov *{transition:none!important}}
`;
