# FLUXA: research-grounded generation, rendering and PDF fixes (2026-11-23)

Technical report for the system-wide investigation. Status words used below:
**Fixed** (changed and verified by a test I ran), **Partly fixed**, **Not fixed**, **Not tested**.

## 1. Root causes found

| Symptom | Actual cause (file) |
|---|---|
| Brain deck showed "Capital Commitment: $12.8 Billion", "Stakeholder Alignment: 91.2%" | `app/ai/research_agent.py` `_domain_fallback_research()` returned a hardcoded generic "strategic briefing" dossier for any topic it didn't recognise. It ran whenever live research was off (it was off: `RESEARCH_LIVE=auto` needs a Tavily/Brave key, none is set) and the "answer from memory" call failed. The saved deck 101 has `research_mode: "offline"`, confirming this path. |
| Corporate headings on every topic ("…: today vs. where it's heading", "What drives …", "Next steps for …") | `app/ai/designer_agent.py` `_dossier_to_outline()` + `plain_template_titles()`: three hardcoded consulting outlines per archetype, used whenever the outline call failed. `agent_loop.py` also had a "— Strategic Briefing / Slide N" placeholder outline. |
| Fake citations ("Harvard Business Review Strategic Review (2025)", McKinsey, Gartner) | Same fallback dossier, plus `compiler.py` inserted default citation footnotes on every non-title slide; citation URLs were Google Scholar *searches*, not sources. |
| Irrelevant bar chart (2022: 28, 2023: 46 … 2026: 125) | `compiler.py` invented chart rows when a chart-text slide had no data; `designer.slide` prompt demanded "4 to 6 realistic data points" for every slide; outline prompt made bar charts "the PRIMARY and DEFAULT visual". Also an auto-added slider that rescaled chart values. |
| Topic drift / wrong content | Slide prompt never received the user's original prompt or the evidence, only the deck title + a 2-citation summary; outline ran on the fabricated dossier. Model failures fell back to `MockProvider` canned slides ("Quarterly Momentum", "Key Takeaways"). |
| Images stopped appearing / wrong images | (1) This network's IPv6 route to Wikimedia stalls ~21 s per request (measured: 21.6 s IPv6 vs 1.2 s IPv4). The image fetcher's 3.5 s timeout therefore always failed and fell back to generic Unsplash business photos. (2) The image search used the whole topic string and Wikipedia `pageimages`, which returned logos (deck 101 used the "Big Brain Academy" Nintendo logo). (3) The newer Sketchfab 3D lookup put image blocks into 3D mode by default, hiding the photo. (4) `commons.wikimedia.org` does not resolve on this network (DNS NXDOMAIN). |
| Content clipped in full screen / PDF | Text blocks: bullet cards used fixed-pixel padding/gaps/badges that don't shrink with the font, the fit hook made one proportional guess, never re-measured after web fonts loaded, and the container hid overflow. The stage geometry itself was correct (verified, see §10). |
| Light themes unreadable | `SlideStage.tsx` painted a dark navy canvas for *non-dark* themes, under the themes' dark text colour. |
| PDF trailing blank page, half-loaded content | `PrintRoute.tsx`: `break-after: page` on the last page, no wait for fonts/images/charts, charts animated, 3D/chart toolbars printed. |
| Research was not a real pipeline stage | Live research only ran with a paid search key; the keyless DuckDuckGo backend returns HTTP 202 bot challenges (0 results). The generation route also ran `AgentLoop` and then regenerated every slide again (double model cost) without using its research. |


## 2. New generation pipeline

```
user prompt ─► research.plan (1 model call: subject, audience, purpose, 4-8 subtopics, queries)
            ─► searches: Wikipedia (full article text), OpenAlex (peer-reviewed abstracts),
               PubMed (science/medicine), Tavily/Brave web search when a key is set,
               and the primary sources the Wikipedia articles cite (.gov, .edu, journals, WHO, UNEP …)
            ─► evidence: verbatim sentences per source, ranked by relevance; numbers cross-checked
            ─► citation registry: S1…Sn with title, authors, venue, date, URL, DOI, credibility
            ─► deck.outline (1 call): structure decided from subject + evidence; visual per slide
            ─► deck.slides (1 call per 4 slides): points with per-claim source ids
            ─► validation (code): unknown ids dropped; every number must appear in the cited
               evidence (re-attributed to the source that states it, else the claim is removed);
               charts/KPIs/tables/quotes only with values found in the evidence
            ─► deck.review (1 call) + rule checks for drift → one repair batch → otherwise a slide
               of verbatim cited evidence (never a template)
            ─► images per slide (Wikimedia, credited) ─► numbered citations + References slides
            ─► compiler (geometry only) ─► SlideStage (editor / present / print)
```

About 5–6 model calls per 8-slide deck (previously ~10–18, including a duplicated slide pass),
which matters on the free OpenRouter tier (50 requests/day).

Files: `app/ai/research_pipeline.py` (new), `app/ai/deck_writer.py` (new),
`app/ai/image_search.py` (new), `app/ai/net.py` (new), `app/services/deck_generation.py` (new),
`app/ai/research_agent.py`, `app/ai/designer_agent.py`, `app/ai/compiler.py`,
`app/ai/openrouter_provider.py`, `app/ai/provider.py` (+ `complete_json` in all providers),
`app/routes/generation_routes.py`, `app/prompts/registry.py`, `app/ai/agent_loop.py`, `app/__init__.py`.

## 3. Prompts and topic fidelity

- The original prompt is passed (as untrusted data) to the plan, outline, slide and review calls;
  a test asserts every model call contains it.
- Removed prompts that told the model to produce "realistic" statistics, "4 to 6 data points"
  and citations from memory (`research.memory`, `designer.outline`, `designer.slide`).
- New prompts forbid inventing numbers, names, dates, quotations or sources; require citations per
  claim; require charts only when the evidence has the values; ask for titles that name what the
  slide shows; and forbid corporate material the request did not ask for.
- Persona changed from "McKinsey Senior Partner" to a subject-matter author and a fact checker.

## 4. Hardcoded content removed

Template outlines (`_dossier_to_outline`, `plain_template_titles`), the fabricated domain dossiers
(smog, hospitals, EVs, solar, Rome, generic "strategic briefing"), compiler defaults (fake chart
rows, KPI 78, SWOT, TAM/SAM/SOM, funnel, "Option A/B", "Design is how it works.",
"Strictly Confidential • Executive Briefing" footer, McKinsey/Gartner/NEJM citations), the
"Strategic Intelligence Briefing" label on every slide (`SlideStage.tsx`), the create page's
"Key Highlights / Market Growth" stand-in outline, the table renderer's "Item A/B/C" rows, the
citation renderer's "WHO & World Bank" default, the image renderer's skyscraper stock photo, and
the AgentLoop "Slide N" placeholder outline. Layout templates (geometry) are kept.

The mock provider (`AI_PROVIDER=mock`, used by tests and the offline demo) still returns its
canned sample deck by design; it is only used when explicitly selected.

## 5–6. Sources, citations and provenance

- Credibility by source type/domain (intergovernmental and government agencies, scholarly
  publishers, universities, standards bodies, encyclopedia, general web; social media,
  dictionaries and Q&A sites are excluded).
- Numeric evidence is cross-checked; `corroborated_by` lists independent sources stating the
  same number and is shown to the model.
- Each point keeps `citations` (source ids) and `refs` (reference numbers) in the slide spec
  (`spec.provenance` and the text block's `props.points`), inline `[n]` marks in the text, a
  per-slide "Sources" footnote with links to the retrieved URLs, and numbered References slides
  built only from retrieved metadata (authors, year, title, venue, DOI or URL).
- Numbers are assigned once at generation, so they stay correct after slides are reordered or
  edited (the text and the References slide carry the same numbers).
- The full registry, research trace (queries, successes, documents, timing), limitations and a
  generation report (removed claims, dropped visuals, repaired/extractive slides, images) are
  saved with the deck (`variables.research_dossier`).
- Research datasets use a new additive `source: "research"` value with `citations`
  (`app/spec/models.py`, `shared/spec.ts`, regenerated `shared/spec.schema.json`).

## 7. Charts

A chart is created only when the model proposes one and at least two of its values are found in
the cited evidence; otherwise the slide gets an image or diagram and the drop is logged. Charts
show their title, unit and "Source: [n]"; `ai-estimate` datasets show "Sample data". The slider
that rescaled generated chart values is no longer added.

## 8. Images

IPv4-first resolution (`app/ai/net.py`, installed at startup) removes the 21 s stall. Images come
from the Wikipedia articles the research read (their figures) plus up to four targeted searches,
ranked by overlap with the slide's own image query, never reused within a deck, with author and
licence shown on the image. A slide with no suitable image gets a text layout; a failed image
shows "Image could not be loaded" with its alt text instead of a stock photo. 3D models are used
only when the slide's visual is "3d" (the Sketchfab/procedural 3D viewers are unchanged).

## 9. Layout selection

The outline chooses a visual per slide (image, diagram, chart, timeline, process, comparison,
table, KPI, quote, 3D, none); the compiler maps it to a layout and falls back to a text layout
when the content for that visual isn't there. New `text`, `table` and `references` layouts.

## 10. Full-screen rendering

Measured in present mode at 1920×1080, 1600×900, 1366×768, 1280×720 and a non-16:9 1200×1000
window, on all 10 slides of the brain deck: the 1920×1080 canvas scales uniformly (1, 0.833,
0.711, 0.667, 0.625), is centred and letterboxed (1200×675 at y=163), and no block lies outside
the slide or overflows its box. The stage geometry was already correct; the clipping came from
text that did not fit its box. Fixes:

- `frontend/src/rendering/textFit.ts`: binary search over real layout for the largest font that
  fits; re-runs on content/box change, element width change, and when web fonts finish loading.
- `TextBlockRenderer.tsx`: card padding, gaps and number badges in `em` so they shrink with the
  text; citation marks set smaller in the accent colour; plain list style for references.
- `SlideStage.tsx`: hardcoded label removed; light themes paint their own background;
  percentage-coordinate detection no longer misreads small pixel boxes.
- A stress deck (five 220-character claims per slide, long title, chart, timeline) fits with no
  overflow in print.

Text shrinks to a minimum (14 px body, 26 px titles on the 1920 stage) instead of being hidden,
and the generator limits slides to 5 points of about 200 characters.

## 11. PDF export

`frontend/src/pages/PrintRoute.tsx`: `@page` sized to the slide (1920×1080 px), one page per
slide, no trailing page break, colours and backgrounds kept, animations off, charts drawn in their
final state, toolbars hidden. The page waits for fonts, every image (loaded or failed) and layout
frames, then sets `data-print-ready`; from the Export dialog (`?autoprint=1`) it opens the print
dialog itself. 3D models print as their still image. `scripts/verify_pdf_export.mjs` (new)
exports a deck with headless Chromium and audits it.

## 12. Files changed

New: `app/ai/net.py`, `app/ai/research_pipeline.py`, `app/ai/deck_writer.py`,
`app/ai/image_search.py`, `app/services/deck_generation.py`, `tests/test_deck_writer.py`,
`scripts/verify_pdf_export.mjs`, this report.

Backend: `app/__init__.py`, `app/ai/research_agent.py`, `app/ai/designer_agent.py`,
`app/ai/compiler.py`, `app/ai/openrouter_provider.py`, `app/ai/provider.py`,
`app/ai/anthropic_provider.py`, `app/ai/gemini_provider.py`, `app/ai/openai_provider.py`,
`app/ai/agent_loop.py`, `app/prompts/registry.py`, `app/routes/generation_routes.py`,
`app/spec/models.py`, `shared/spec.ts`, `shared/spec.schema.json` (regenerated), `.gitignore`.

Frontend (under `frontend/src/`): `rendering/SlideStage.tsx`, `rendering/textFit.ts`, and in
`rendering/blocks/`: `TextBlockRenderer.tsx`, `ImageBlockRenderer.tsx`, `ChartBlockRenderer.tsx`,
`CitationBlockRenderer.tsx`, `TableBlockRenderer.tsx`, `BlockRenderer.tsx`; plus
`pages/PrintRoute.tsx`, `pages/CreatePresentation.jsx`, `editor/dialogs/ExportDialog.tsx`.

Tests changed on purpose because they asserted the removed behaviour:
`test_generation_respects_outline.py`, `test_gateway.py`, `test_prompt_registry.py`,
`test_research_tools.py`, `test_ai_layer.py` (bullet cap 90 → 220 characters so sourced claims
are not cut mid-sentence).

## 13–14. Tests run and results

**Live generation** (configured model: OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`;
8 slides requested; streamed through `/api/presentations/generate`; 4–5 minutes per deck):

| Topic | Deck | Searches ok | Sources kept | References | Slides | Layouts used | Images | Claims removed | Visuals dropped | Slides repaired | AI status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Human Brain | 102 | 21/21 | 20 | 12 | 10 | comparison, image-text, references, timeline, title | 5 | 0 | 0 | 3,6,7 | live |
| DNA Structure | 104 | 21/21 | 20 | 9 | 9 | comparison, image-text, references, timeline, title | 5 | 2 | 0 | 3,7 | live |
| Climate Change | 105 | 16/20 | 13 | 12 | 10 | comparison, image-text, references, timeline, title | 6 | 1 | 1 | 3,4,6 | live |
| Artificial Intelligence | 106 | 16/21 | 18 | 11 | 10 | comparison, image-text, references, text, timeline, title | 5 | 2 | 0 | 1,2,3,6 | live |
| Cybersecurity | 107 | 20/20 | 18 | 9 | 9 | comparison, image-text, references, timeline, title | 5 | 1 | 0 | 3–8 | live |
| Business Strategy | 108 | 21/21 | 20 | 10 | 9 | comparison, image-text, references, timeline, title | 5 | 0 | 0 | 3,7 | live |

Every deck: titles specific to the subject and different between subjects; every factual point
cites a retrieved source (Nature, NeuroImage, JCI Insight, ChemistryOpen, NLM MeSH, UNEP, GOV.UK,
DHS, NIST, Wikipedia and others); References slides with authors, year, venue and DOI; no
corporate filler; claims whose numbers were not in the evidence were removed and logged; AI status
"live" (no fallback content).

**PDF** (`scripts/verify_pdf_export.mjs` on all six decks): page count equals slide count
(10, 9, 10, 10, 9, 9); every page 1440×810 pt (1920×1080 px, 16:9); 31/31 images loaded; zero
overflowing blocks; zero console errors; ready in 5–9 s.

**Full screen**: see §10 (5 viewport sizes × 10 slides, no overflow, correct scale and centring).

**Automated tests**: backend 266 passed, 6 failed — the same 6 that failed before any change
(3 in `test_ft12_generation_api.py`; 3 in `test_spec_agreement.py` that need `node` on PATH —
with Node on PATH they pass, confirming the schema change agrees between Zod and Pydantic).
New `tests/test_deck_writer.py` (10 tests) covers invented numbers removed, mis-attributed
citations corrected, unsupported charts dropped, drifted slides replaced with cited evidence,
model-free outline from research subtopics, no template deck without model and research, the
compiler never inventing charts/KPIs/citations/images, and prompts carrying the original request.
Frontend: typecheck clean except one pre-existing unused import in `PresenterVoice.test.tsx`;
Vitest 95 passed, 7 failed in `App.test.jsx` and `EditorShell.test.tsx` (workspace and
editor-shell expectations such as a "Deck One" link and an inspector panel class) — files this
work did not touch; not re-run on a pre-change copy.

## 15. Status and remaining limitations

| Area | Status |
|---|---|
| Fabricated/hardcoded content, topic drift | **Fixed** (six topics verified) |
| Research stage, citation registry, claim-level citations, references | **Fixed**, with the web-search limitation below |
| Number/statistic verification | **Fixed** for numbers; non-numeric support is judged by the model's fact-check pass |
| Images | **Fixed** (relevant, credited, no stock stand-ins); individual picks are good, not perfect |
| Charts only from evidence | **Fixed** in code and unit tests; no live deck produced a chart (no plottable series in the evidence), so a live research chart is **not observed** |
| Full-screen scaling and clipping | **Fixed** (measured) |
| PDF export | **Fixed** (Chromium PDF engine); Firefox/Safari print **not tested** |
| Layout variety | **Partly fixed**: varies per slide, but decks lean on image-text, timeline and comparison |

Limitations:

1. **General web search needs a key.** Without `TAVILY_API_KEY` or `BRAVE_SEARCH_API_KEY` there is
   no general web search: DuckDuckGo blocks automated clients and Bing RSS ignores the query.
   Research then uses Wikipedia, OpenAlex, PubMed and the primary sources Wikipedia cites; each
   deck records this. A Tavily key (free tier) turns web search on with no code change.
2. **Model.** The app runs a free OpenRouter model (50 requests/day), not Claude. A deck costs
   about 6 requests. Claude needs OpenRouter credits or `AI_PROVIDER=anthropic` with
   `ANTHROPIC_API_KEY`; the pipeline works with any provider.
3. **Citation precision.** One DNA claim cited a loosely related 1976 cell-cycle paper.
4. **Network-specific.** `commons.wikimedia.org` does not resolve on this network; images come via
   en.wikipedia.org and upload/thumb.wikimedia.org. Wikipedia allows ~9 API calls per 30 s, so
   research is throttled (about 50–60 s per deck).
5. **Generation time**: 4–5 minutes per 8-slide deck, mostly the free model.
6. **Copilot chat edits** still fall back to the mock provider's canned edits when the model fails
   (flagged to the user as a fallback); outside this change.
7. **Existing decks** (e.g. deck 101) keep their old content; regenerate them.
8. Not run: Playwright e2e suite (`e2e/`), PPTX/HTML/PNG exports, Urdu decks.
