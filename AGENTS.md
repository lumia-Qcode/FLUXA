# FLUXA — Antigravity prompt pack

**How to use this file**

1. Open the FLUXA repo (the `problem/` folder from your zip) as the Antigravity workspace.
2. Paste **PART 1 — MASTER BRIEF** as the first message. Also save it in the repo root as `AGENTS.md` so every agent run re-reads it.
3. Paste the phase prompts from **PART 2** one at a time, in order. Don't start the next phase until the current one's acceptance checks pass.
4. Use Planning mode if your Antigravity build has it. Every phase must end with screenshots or a browser recording of the acceptance checks, attached as artifacts.
5. Before anything else: **rotate the OpenRouter key** that was inside the zip's `.env`, and never zip or share `.env` again.

---

# PART 1 — MASTER BRIEF

You are the lead engineer and product designer on **FLUXA**, a web-native presentation tool meant to replace PowerPoint, with an AI model built in. You own this build end to end: spec, backend, editor, rendering engine, AI layer, export, and visual design. Work autonomously. When a decision is not covered here, pick the best option, record it in `docs/decisions.md` (one line: decision, reason), and keep going. Ask me only when a choice is irreversible and could reasonably go either way.

## 1. The product, and the one idea that matters

FLUXA is a presentation editor where **slides are live software, not pictures**. Every other tool (PowerPoint, Google Slides, Canva, Gamma, Beautiful.ai, Dokie) produces static slides, or slides with a few canned animations. Nothing lets the audience or presenter *change a number and watch the slide respond*. FLUXA must:

- Bind charts, KPIs and tables to datasets. Change a value from 55 to 74 and every bound chart animates to the new value.
- Put real controls on slides (sliders, toggles, dropdowns, buttons) that change variables, which recompute charts and numbers live, in the editor and in present mode.
- Support animated builds, slide transitions, tabs, click-to-reveal and hotspots.
- Allow a sandboxed custom HTML/JS widget block, so anything a web page can do can live on a slide (and the AI can write it).
- Let an AI model generate the whole deck from a prompt, and edit any part of it from chat, as undoable changes.
- Still behave like a real editor: direct manipulation on a canvas, thumbnails, drag to reorder, undo/redo, autosave, present mode, and export to PowerPoint, PDF, standalone HTML and images.

**References to study, not copy:**
- **Dokie** (dokie.ai): prompt-to-deck, editable outline before slides are made, chat editing plus a manual toolbar, layouts that adapt when content changes, PPTX and PDF export.
- **zarazhangrui/frontend-slides** (GitHub): each deck is one self-contained HTML file; every slide is authored on a fixed 1920×1080 stage that scales uniformly to the viewport (never reflowed for phones); one orchestrated entrance sequence instead of scattered micro-animations; `prefers-reduced-motion` respected; an explicit ban on generic "AI slop" styling (overused fonts, purple gradients, cookie-cutter cards).
- FLUXA takes Dokie's workflow and frontend-slides' rendering discipline, and adds what neither has: a **data and variables engine with on-slide controls**.

**Source documents** (in the repo or attached): `FLUXA_PRD_1.pdf` (FR-1 to FR-15, NFR-1 to NFR-7, MVP list, user stories) and `FLUXA_Project_Proposal_1.pdf`. This is an academic submission by four students, so it must be demonstrable end to end and stable. Where this brief is stricter than the PRD, follow this brief.

## 2. Current state (reviewed and tested)

**Stack today:** Flask 3.1 + SQLite (`app/`), `requests` for AI calls. Frontend: React 18 + react-router 6 + Vite 5 in plain JavaScript (`frontend/src`), one 1,704-line `styles.css`. Tables: `presentations(id,title,description,…)`, `slides(id,presentation_id,slide_order,title,content,…)`. The existing suites pass (56 pytest, 34 vitest) but they test the legacy text-markup contract and will need rewriting. Installed libraries: nothing for charts, animation, drag and drop, rich text, or export.

**What works and must be kept:** presentation and slide CRUD routes, duplicate and reorder routes, the outline → content generation split (`outline_service.py`, `slide_content_service.py`), the tolerant JSON extractor (`slide_parser.extract_json`), Urdu / Roman Urdu support in the copilot prompt, theme and layout selection, the keyboard shortcuts, the Ctrl+S and unsaved-changes warning behaviour.

**Verified defects (fix all of them):**

| # | Defect | Where |
|---|---|---|
| 1 | Present mode is not full screen. At 1440×900 it renders inside the page, clipped, with the sidebar still visible and the slide pushed off the bottom. Likely cause: the overlay is rendered inside the page tree and an ancestor (transform, animation or backdrop-filter) becomes the containing block for its `position: fixed`; confirm the exact ancestor in Phase 0. No Fullscreen API is used. | `EditorPage.jsx`, `styles.css` |
| 2 | The editor is five columns at 1440px (global sidebar, slide rail, text form, preview, copilot). The slide title field shows "Adoption Is A", the "Slide 2 Content Editor" heading wraps into the AI button, and the "live preview" is a ~240px thumbnail. A slide with a chart plus a comparison overflows and clips inside it. | `EditorPage.jsx` |
| 3 | A slide is a string of text plus a mini-markup: `[chart:bar:{json}]`, `[metric:99%:Label:Sub]`. It is parsed by `split(":")`, so any label containing a colon breaks. Invalid JSON silently falls back to printing the raw tag. There is no schema, no positions, no per-block styling. This is not the JSON presentation specification the PRD requires (FR-4, NFR-6). | `SlidePreview.jsx`, `slide_parser.py` |
| 4 | "Dynamic charts" means retyping JSON in a textarea. No data editor, no animated update. The donut centre shows the first value rather than the total. | `SlidePreview.jsx` |
| 5 | Theme and per-slide layout live in `localStorage`, not the database. They are lost on another device and cannot be exported. | `EditorPage.jsx` |
| 6 | Export is "copy Markdown" and `window.print()` with no print stylesheet, so it prints the app UI. No PPTX, PDF, HTML or image export (FR-14 and NFR-7 unmet). | `EditorPage.jsx` |
| 7 | `api.reorderSlides` and `api.generateOutline` exist but no page calls them: no drag to reorder, and the outline is never shown to the user (user story 1 says it must be). | `api.js` |
| 8 | No undo/redo, no autosave (manual save button only). | `EditorPage.jsx` |
| 9 | AI is wired to OpenRouter with a hard-coded list of free models, tried one after another with a 60 s timeout each: up to six attempts, so one HTTP request can block for about six minutes. The PRD and proposal specify the Claude API. | `ai_client.py` |
| 10 | Outline parsing requires exactly `slide_count` slides or the request fails with a 502, which weaker models trigger often. | `slide_parser.parse_outline` |
| 11 | The copilot sees only the first 200 characters of each slide, receives no chat history, can perform one action per message, writes straight into the database with no preview or undo, and its prompt forces "Would you like any further changes?" onto every reply. | `copilot_service.py` |
| 12 | The create page's progress messages are fake `setTimeout`s (never cleared), not tied to real progress. Nothing streams. | `CreatePresentation.jsx` |
| 13 | The frontend is JavaScript; the PRD says React + TypeScript. `EditorPage.jsx` is an 816-line component doing everything; there is no state management. | `frontend/src` |
| 14 | The zip contained a populated `.env` (an OpenRouter key) plus `node_modules` built for Windows. | repo root |

**The current UI looks AI-generated.** Specific tells present now, all of which must go: a violet-to-cyan gradient on a headline word; a pill badge with a pulsing dot reading "Powered by OpenRouter AI Multi-Model Intelligence"; emoji used as icons (🤖 📊 🎙️ ▶️ ✨ 🍩 ⚖️ 📋 🖨️); four identical icon + title + blurb cards; glow shadows and glass surfaces (in `styles.css`: 4 `backdrop-filter` lines, 22 `linear-gradient` lines, 28 lines using the violet glow colour); violet `#8b5cf6` and cyan `#06b6d4` on a near-black radial gradient; ALL-CAPS tracked labels above every field; "luxury / cyber / next-gen" copy; a vendor name in the product UI.

## 3. The bar (what "done" means)

You are finished only when all of these are true. They come straight from my brief:

1. **Clean UI.** It looks like a professional tool made by a design team, not like generated output (section 6).
2. **A real editor.** Canvas with direct manipulation, slide thumbnails, inspector, undo/redo, autosave. Feels closer to PowerPoint or Pitch than to a form.
3. **All dynamic features** from section 1 work in the editor, in present mode, in the share viewer, and in the standalone HTML export.
4. **The model works properly.** Generation and edits succeed reliably, fail gracefully, stream progress, and never corrupt a deck.
5. **Slides have proper functions and export.** Transitions, animations, notes, presenter view, and export to PPTX (with native, editable charts), PDF, PNG, and standalone HTML.
6. **A user-friendly chat.** An AI panel a first-time user understands immediately (section 5.8).
7. The six PRD user stories pass as automated end-to-end tests, and the app can be demonstrated offline using the mock AI provider.

## 4. Architecture decisions (final; don't relitigate)

### 4.1 Stack

- **Backend:** keep Flask + SQLite. Add Pydantic models that mirror the spec. Keep the existing route paths working.
- **Frontend:** React 18 + **TypeScript** (strict) + Vite. Migrate `.jsx` to `.tsx` as each file is rewritten. Use latest stable versions and pin them exactly in `package.json`.
- **State:** Zustand + Immer (with patches for undo/redo). The document store holds the deck; a separate UI store holds selection, zoom, panel state. Components select narrow slices; never pass the whole deck through props.
- **Spec validation:** Zod on the frontend, Pydantic on the backend, both generated from or checked against one JSON Schema in `shared/spec.schema.json`. A test fails if they drift.
- **Charts:** Chart.js 4 (via `react-chartjs-2`). Use D3 modules (`d3-scale`, `d3-shape`) only for custom visuals such as timelines. Chart.js animates between data states natively, which is what delivers "55 → 74 animates".
- **Animation:** Motion (framer-motion's successor) for block animations and transitions. **Do not use reveal.js**: it owns the DOM and keyboard handling, which conflicts with an editable canvas. A small custom present engine (stage, build steps, transitions) is simpler and fully controllable.
- **Rich text:** Tiptap (ProseMirror). **Transform handles and snapping:** `react-moveable` or an equivalent you wire yourself. **Sortable thumbnails:** `@dnd-kit`. **Menus, popovers, dialogs, tooltips:** Radix primitives, unstyled, styled by our tokens. **Command bar:** `cmdk`. **Icons:** Lucide, one set only. **Code editing for HTML widgets:** CodeMirror 6.
- **Export:** PptxGenJS (client side) for PPTX; `html-to-image` for PNG snapshots; a dedicated print route for PDF.
- **Expressions:** a small whitelisted evaluator (jsep plus your own evaluator, or a maintained library after you check its current advisories). **Never `eval`, `new Function`, or property access on arbitrary objects.** Allowed: `+ - * / % ^`, comparisons, `&&  ||  !`, ternary, and functions `sum avg min max round floor ceil abs sqrt pow clamp lerp if first last count`. Identifiers resolve only to variables, dataset columns, and `_i` (row index). Include tests with hostile input (`constructor.constructor("x")()`, `__proto__`, very deep nesting, very long strings).
- **Fonts:** self-hosted with `@fontsource` packages. No runtime Google Fonts requests (needed for offline and for the standalone export).
- **Tests:** Vitest + Testing Library (unit and component), pytest (backend), Playwright (end-to-end).
- **Dev experience:** one command at the repo root (`npm run dev`) starts Flask and Vite together. `README.md` has setup, env vars, and the demo script.

### 4.2 The presentation specification (the heart of the product)

Finalise this in `shared/spec.ts` and `docs/spec.md`. Treat it as the starting point; after v1, only make additive changes and keep a migration for every `schemaVersion` bump (NFR-6).

```ts
export type Deck = {
  schemaVersion: 1
  title: string
  themeId: string
  themeOverrides?: Partial<ThemeTokens>
  datasets: Record<string, Dataset>
  variables: Record<string, Variable>
  settings: { transition: Transition; loop: boolean }
}

export type Slide = {
  id: string; order: number
  layout: LayoutId | null        // layouts position blocks by `role`
  background?: Fill
  notes: string
  hidden?: boolean
  transition?: Transition
  blocks: Block[]                // array order = z-order
}

type Box = { x: number; y: number; w: number; h: number; rotation?: number } // stage px, 1920×1080
type BlockBase = Box & {
  id: string; role?: 'title'|'subtitle'|'body'|'media'|'chart'|'kpi'|'aside'|'footer'
  name?: string; locked?: boolean; hidden?: boolean; alt?: string
  animation?: AnimationStep[]
}

export type Block = BlockBase & (
  | { type: 'text';  doc: RichTextDoc; style: TextStyle }
  | { type: 'shape'; shape: 'rect'|'ellipse'|'line'|'arrow'|'triangle'; fill?: Fill; stroke?: Stroke; radius?: number }
  | { type: 'image'; assetId: string; fit: 'cover'|'contain'; radius?: number }
  | { type: 'icon';  name: string; color?: Color }
  | { type: 'chart'; kind: 'bar'|'column'|'line'|'area'|'pie'|'donut'|'scatter'|'radar'|'stacked'
      dataset: string; x: string; series: { field: string; label?: string; color?: Color }[]
      options: { unit?: string; legend?: 'auto'|'off'|'bottom'; valueLabels?: boolean
                 min?: Num; max?: Num; animateMs?: number } }
  | { type: 'kpi';   value: Num | Str; label: string; delta?: Num; format?: NumFormat; countUp?: boolean }
  | { type: 'table'; dataset: string; columns?: string[]; style: 'plain'|'striped'|'ruled' }
  | { type: 'steps' | 'timeline'; items: { title: string; body?: string; date?: string }[]; orientation: 'h'|'v' }
  | { type: 'comparison'; columns: { title: string; items: string[] }[] }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'control'; control: 'slider'|'toggle'|'select'|'segmented'|'button'
      variable?: string; label?: string; min?: number; max?: number; step?: number
      options?: string[]; action?: { goToSlide?: string; setVariable?: [string, unknown]; openUrl?: string } }
  | { type: 'embed'; kind: 'video'|'url'; src: string }
  | { type: 'html';  code: { html: string; css: string; js: string }; snapshotAssetId?: string }
  | { type: 'tabs';  tabs: { id: string; label: string; blocks: Block[] }[] }     // tier 2
)

type Num = number | { $bind: string }     // expression over variables, dataset columns
type Str = string | { $bind: string }
export type Dataset  = { id: string; name: string; source: 'user'|'import'|'ai-estimate'
  columns: { key: string; label: string; type: 'text'|'number'|'date'; expr?: string }[]
  rows: Record<string, string | number | null>[] }
export type Variable = { id: string; label: string; type: 'number'|'boolean'|'choice'
  value: number | boolean | string; min?: number; max?: number; step?: number; options?: string[]
  scope: 'deck'|'slide'; resetOnEnter?: boolean }
export type AnimationStep = { effect: 'fade'|'rise'|'slide'|'zoom'|'wipe'|'draw'|'countUp'|'exit'
  trigger: 'onEnter'|'onClick'|'afterPrev'|'withPrev'; delay?: number; duration?: number
  easing?: string; direction?: 'l'|'r'|'u'|'d' }
```

**Worked example (must work exactly like this):** a deck has dataset `adoption` with rows `{year:"2025", pct:55}`. A bar chart block references `dataset:"adoption"`. The user opens the Data tab (or clicks the chart → Edit data), changes 55 to 74, and the bar tweens to 74 in under a second, with no other action. A KPI block bound to `{ $bind: "last(adoption.pct)" }` counts up to 74 at the same time.

**What-if example (must also work):** variable `growth` (slider 0–40, default 12). Dataset `forecast` has a computed column `revenue` with `expr: "base * pow(1 + growth/100, _i)"`. A chart plots `revenue`; a KPI shows `round(last(revenue))`. In present mode the presenter drags the slider and both update live.

**Layouts do geometry; the AI does meaning.** Provide at least 12 layouts (title, section break, title + bullets, two columns, big number, chart + text, image + text, quote, timeline, comparison, full-bleed image, blank). A layout assigns positions to blocks by `role`. Applying a layout re-flows existing blocks, so content-aware layout changes are cheap. Text blocks shrink to fit down to a minimum size; never let text overflow its box.

### 4.3 Persistence and API

- `presentations`: add `theme` (JSON), `datasets` (JSON), `variables` (JSON), `settings` (JSON), `schema_version`, `revision` (integer for optimistic concurrency).
- `slides`: add `spec` (JSON text: layout, background, notes, transition, blocks). Keep `title` for lists and the outline. Keep legacy `content` only until migration has run.
- New `assets` table (id, presentation_id, filename, mime, size, path, created_at). Add `POST /api/assets` (allow png, jpg, webp, svg-sanitised, mp4; enforce size caps; store under `instance/uploads/`; serve through `GET /api/assets/<id>` with correct headers) and delete on orphan.
- New `ai_messages` table to persist chat per deck.
- **Migration script** `scripts/migrate_legacy_content.py`: back up the DB first; convert legacy `- bullets` and `[chart|metric|compare|steps|quote:…]` lines into blocks using a proper tokenizer (not `split(":")`); idempotent; unit-tested with colons, invalid JSON, empty content, and Urdu text.
- Keep every existing route working. Add: `PUT/PATCH /api/presentations/<id>` (title, theme, datasets, variables, settings, with `revision` check returning 409 on conflict), `PUT/PATCH …/slides/<sid>` accepting `{title, spec}`, `POST …/slides/reorder` (already exists; wire the UI), asset routes, AI routes (section 4.5).
- Validate every write with Pydantic. Reject unknown block types with a clear 422, but let the renderer show unknown blocks as a labelled placeholder rather than crashing (forward compatibility).

### 4.4 Rendering: one renderer, everywhere

Build a single `<SlideStage>` with modes `edit | present | thumbnail | print | export`. The editor canvas, the thumbnails, present mode, the share viewer, the print route and the standalone export **all use it**, so what you see in the editor is what the audience sees.

- Logical size 1920×1080. Scale with a CSS transform from a `ResizeObserver`. Inside the stage nothing is responsive: no media queries, no reflow. Letterbox when the aspect ratio differs.
- Responsiveness (NFR-3) applies to the **app chrome**: ≥1280px three panels; 1024–1279px right panel becomes a drawer; <1024px the rail collapses to a bottom strip; <640px the app offers view, present and AI chat, and tells the user plainly that editing needs a larger screen.
- Present mode uses the browser **Fullscreen API** on a portal rendered at `document.body`. Never position-fixed inside the app tree (see defect 1).
- Every chart also renders a visually hidden data table. It serves screen readers and gives the tests something exact to assert on.

### 4.5 The AI layer (this is "the model")

**Providers.** `app/ai/` with a `Provider` interface and three implementations: `AnthropicProvider` (primary; Messages API with forced tool use), `OpenRouterProvider` (fallback and development; `response_format` JSON schema where the model supports it, otherwise JSON in the prompt plus repair), and `MockProvider` (deterministic canned valid decks and ops, used by tests and as the offline demo mode). Configuration comes from env only: `AI_PROVIDER` (`anthropic|openrouter|mock`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`. **Do not hard-code model IDs or free-model lists.** Delete the stale list in `ai_client.py`. Keys never reach the browser (NFR-4). Add `GET /api/ai/status` so the UI can show "AI is not configured" with the exact fix instead of failing mid-request.

**The model never writes pixel coordinates.** It writes *semantic* slide content (layout name + slots: title, bullets, chart dataset, KPI, quote…). A deterministic **compiler** turns that into positioned blocks using the layout. This removes the most common LLM failure (overlapping or off-canvas elements). Content limits are enforced in the repair pass: title ≤ 70 characters, ≤ 5 bullets, ≤ 90 characters per bullet, chart ≤ 12 data points.

**Generation pipeline** (replaces the sequential blocking calls):

1. `POST /api/presentations/generate/outline` (streamed): returns a title and N slide intents, each with `layout`, `purpose`, and `visual` (chart / kpi / timeline / comparison / quote / none).
2. The UI shows the outline as an **editable list** (rename, reorder, delete, add, change layout). Nothing is generated until the user presses **Generate slides** (FR-2, user story 1).
3. `POST /api/presentations/generate` (streamed, Server-Sent Events): generates slides in parallel (concurrency 3), each from the outline, deck context, and a forced-tool schema; validates; repairs once; compiles; saves; emits `outline`, `slide`, `progress`, `error`, `done` events. Slides appear in the rail as they arrive.
4. A final **polish pass** checks consistency, flags overflow, and makes sure at least a third of slides have a visual, and at least one has an interactive element when the topic suits it.

The frontend reads the stream with `fetch` + `ReadableStream` (EventSource cannot POST). Tolerate a miscount of slides by padding or trimming rather than failing (fixes defect 10).

**Editing: the AI returns operations, not rewritten slides.** `POST /api/presentations/<id>/ai/chat` (streamed) returns assistant text plus `ops[]`. Ops are typed commands that go through the same store as manual edits, so **AI changes are undoable and appear in history**:

`set_block_props · add_block · remove_block · set_dataset · set_dataset_cell · add_variable · add_slide(layout, slots) · remove_slide · reorder_slides · apply_layout · apply_theme · set_animation · set_notes`

The UI previews ops as a change card (what will change, which blocks are highlighted on the canvas) with **Apply / Reject**; a setting allows auto-apply. Apply is atomic: all ops or none.

**Context sent to the model:** the full spec of the selected slide and selected blocks; datasets and variables; a compact outline of the rest of the deck; the last 10 chat turns; the user's selection. Slide text is data, never instructions (guard against prompt injection from pasted or imported content).

**Inline AI (FR-9):** select text → Shorten, Expand, Fix grammar, Change tone, Translate → three suggestions in a small popover, never silently replacing text. Chart: "Create from pasted table or text". Block: "Make this interactive". Slide: "Improve design" (critique plus ops). Deck: "Write speaker notes", "Translate".

**HTML widgets by AI.** "Add a compound-interest calculator" produces an `html` block (HTML, CSS, JS) wired to deck variables through the widget bridge (section 5.4). Validate it renders before offering Apply.

**Honesty about data.** When the model invents numbers it must set `dataset.source = "ai-estimate"`; the UI then shows a "Sample data" marker on the chart and in the Data tab. When the user supplies data (paste, CSV), use exactly those values. Never present invented statistics as fact in speaker notes.

**Reliability (FR-15, NFR-5):** per-call timeout 45 s; at most one repair retry (send the validation errors back to the model); retry only on 429/5xx with exponential backoff and jitter; a total time budget per request; typed error codes (`not_configured`, `rate_limited`, `invalid_output`, `timeout`, `provider_error`) mapped to plain messages with a Retry button; a cancel button that aborts the stream and the backend work; never half-apply a result; caps on slide count (30), tokens and concurrent requests.

**Languages.** English, Urdu and Roman Urdu at minimum. Text blocks use `dir="auto"`; bundle Noto Naskh Arabic (or Noto Nastaliq Urdu) as the Urdu fallback; check that the editor, thumbnails, present mode and PPTX export render right-to-left text correctly.

**Remove** the forced "Would you like any further changes?" suffix. The assistant answers briefly and only asks a question when the request is genuinely ambiguous.

## 5. Feature specification

### 5.1 Editor shell and canvas

Replace the five-column layout with the standard three-panel editor. The global presentations sidebar is removed from the editor (decks live in the workspace).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ F  Quarterly review     Saved 12:04        Undo Redo      Present    Export  │  40px bar
├────────┬────────────────────────────────────────────────────┬────────────────┤
│ 1 ▭▭▭  │ Text  Shape  Image  Chart  KPI  Control  Table  …  │ Design Animate │
│ 2 ▭▭▭  │ ┌────────────────────────────────────────────────┐ │ Data   Ask     │
│ 3 ▭▭▭  │ │                                                │ │                │
│ 4 ▭▭▭  │ │          slide canvas, 16:9, WYSIWYG           │ │ inspector for  │
│        │ │                                                │ │ the selection  │
│ New    │ └────────────────────────────────────────────────┘ │                │
│ slide  │ Notes (collapsible)                    Fit  62%    │                │
└────────┴────────────────────────────────────────────────────┴────────────────┘
```

- **Canvas direct manipulation:** click to select; shift-click and marquee for multi-select; drag to move; eight resize handles (shift keeps aspect); rotation handle; snapping to slide edges, slide centre and other blocks with visible guides; arrow keys nudge 1px, shift+arrow 10px; Cmd/Ctrl+C, V, D (duplicate), X; Delete; bring forward / send backward; lock; hide; align and distribute (multi-select); group and ungroup (tier 2).
- **Text:** double-click to edit in place with Tiptap. Bold, italic, underline, strike, link, text colour, size, alignment, bullet and numbered lists, line height. Selecting text shows a small floating toolbar with the inline AI actions.
- **Insert:** a toolbar above the canvas and `/` inside the canvas for quick insert. Chart insertion opens a small picker (kind) and creates a dataset with 4 editable sample rows flagged as sample data.
- **Slide rail:** real rendered thumbnails (`SlideStage` in `thumbnail` mode); drag to reorder with `@dnd-kit` (calls the existing reorder route); right-click menu (duplicate, delete, hide, new from layout); a current-slide marker; keyboard navigation with arrow keys when the rail is focused.
- **Zoom:** fit (default), 50–200%, Cmd/Ctrl + and −, Cmd/Ctrl+0 for fit.
- **Slide sorter** (G): grid overview for bulk reorder.
- **Layouts and themes:** a layout gallery (current slide, with live thumbnails) and a theme gallery in the Design tab. Theme changes apply instantly across the deck and are saved in the database (defect 5).

### 5.2 Inspector

Tabs, contextual to the selection:

- **Design:** position and size, rotation, fill, stroke, radius, opacity, shadow; text style when text is selected; chart style (kind, colours, labels, legend, axis range); for nothing selected, slide background, layout, and theme.
- **Animate:** the block's animation steps and the slide transition; a reorderable build-order list for the whole slide; a Preview button that plays the slide's builds in the canvas.
- **Data:** the deck's datasets as a spreadsheet-style grid (edit cells, add and remove rows and columns, paste from Excel or CSV, import CSV, computed columns with formulas), and the deck's variables (create a slider, toggle or choice; set range and default). Blocks bound to the selected dataset are highlighted on the canvas.
- **Ask:** the AI panel (section 5.8).

**Bound fields are visible.** Any property bound to a variable or dataset shows a small signal-coloured link glyph and its expression; clicking opens an expression editor with autocomplete for variables and columns and an inline result preview.

### 5.3 The dynamic engine

- **Reactivity:** datasets and variables form a small dependency graph. When a cell or variable changes, only the blocks that depend on it re-render. Charts update with Chart.js's animated update (default 700 ms ease-in-out); KPIs count to the new value; tables flash the changed cell once.
- **Controls** (`control` blocks): slider, toggle, select, segmented, and button. A control writes a variable. Buttons can go to a slide, set a variable, or open a URL. In the editor, controls work when the block is not being edited (a "Try it" toggle in the toolbar); in present mode and in the viewer they always work. Variable `scope` and `resetOnEnter` decide whether values persist as you move between slides.
- **Interactions:** tabs and click-to-reveal containers, image hotspots with tooltips, and "go to slide" buttons, all in the spec, all editable in the inspector, all working in present mode.
- **Spec hygiene:** the evaluator runs in the main thread with a step and depth limit; an expression error shows a small inline error badge on the block and in the inspector and never blanks the slide.

### 5.4 HTML widget block

The escape hatch that makes the tool unlimited.

- Rendered in an `<iframe sandbox="allow-scripts">` (no `allow-same-origin`, no top navigation, no forms, no popups) from `srcdoc`, with a CSP meta tag: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:`. No network access from inside the widget.
- A tiny bridge over `postMessage` exposes `fluxa.get(name)`, `fluxa.set(name, value)`, `fluxa.on("change", fn)`, plus the theme colours as CSS variables, so a widget can read and write deck variables. Messages are validated (origin is `null` for sandboxed frames; check `event.source` against the known iframe and validate the payload shape).
- Edited in a CodeMirror panel (HTML, CSS, JS tabs) with a live preview, and creatable by the AI.
- In PPTX, PDF and PNG exports the widget becomes a rendered snapshot image (captured at export time or stored in `snapshotAssetId`).

### 5.5 Animation, transitions, present mode

- **Block animations:** effects `fade, rise, slide, zoom, wipe, draw (lines and charts), countUp (KPI), exit`, triggers `onEnter, onClick, afterPrev, withPrev`, delay, duration, easing. Defaults are subtle and quick (200–400 ms). By default a slide's blocks enter in one staggered sequence, authored once, not scattered effects.
- **Slide transitions:** none, fade, push, zoom; "morph" (blocks with the same `id` on consecutive slides animate between their boxes, FLIP technique) is a stretch goal. Deck default plus per-slide override.
- **Present mode:** Fullscreen API; right/space/click advance (steps through builds first), left goes back; `F` toggles fullscreen, `B` blanks the screen, `G` shows a slide grid, number + Enter jumps to a slide, `Esc` exits. Controls auto-hide after 2 s of no mouse movement; a hairline progress indicator. Interactive blocks stay interactive; a click on a control never advances the slide.
- **Presenter view:** a second window opened from Present (via `BroadcastChannel`) showing the current slide, the next slide, speaker notes (readable size), a timer, and the build step. It controls the main window.
- `prefers-reduced-motion`: all block animation and transitions collapse to instant; chart tweening shortens to 0 ms.

### 5.6 Export and sharing

One **Export** menu with a dialog that states in plain words what will and will not survive in each format.

| Format | How | Notes |
|---|---|---|
| **PowerPoint (.pptx)** | PptxGenJS on the client. Slide boxes map from 1920×1080 px to 13.333×7.5 in. | Text, shapes, images, tables, speaker notes native. **Charts are native, editable PowerPoint charts** built from the datasets in their current variable state. KPI and control blocks become text and shapes. `html`, `embed`, and unsupported blocks become a snapshot image with a "Live version" hyperlink. Fonts map to a safe fallback per theme. Simple fade-in builds map to PowerPoint animations if feasible; otherwise omitted and stated in the dialog. |
| **PDF** | A dedicated print route (`/print/:id`) with `@page { size: 1920px 1080px; margin: 0 }`, one slide per page, then the browser's Save as PDF. | Text stays vector. Charts print at their final state. |
| **Images** | PNG per slide, zipped. | Uses `html-to-image` on `SlideStage`. |
| **Standalone HTML** | One self-contained `.html` file with the viewer, the deck JSON, and fonts inlined. | Works offline. **Charts, sliders, tabs and animations stay live.** This is the format PowerPoint cannot match; promote it in the dialog. |
| **Share link** | Read-only viewer at `/v/:id` using the same viewer bundle. | No account system; link is unguessable (random token) and can be revoked. |
| **Markdown outline** | Keep the existing action, built from the new spec. | |

Verify PPTX output in tests: unzip it, assert the chart parts and slide count exist, load it with `python-pptx`, and convert it with LibreOffice headless to confirm it opens.

### 5.7 Autosave, history, keyboard

- Autosave 800 ms after the last change, as a debounced diff with the `revision` check. A status in the top bar: "Saving", "Saved 12:04", "Offline: changes kept on this device", "Couldn't save: Retry". Keep the current draft in IndexedDB so a closed tab or lost connection doesn't lose work. On 409, show a clear choice: reload the server version or keep mine.
- Undo and redo cover manual edits, data edits, layout and theme changes, and AI ops, at least 100 steps, with one history entry per user gesture (a drag is one step, not hundreds).
- Destructive actions use an undo toast instead of a confirm dialog. Deleting a whole deck asks for confirmation by name.
- A shortcut sheet (`?`) and tooltips that show shortcuts. `Cmd/Ctrl+K` opens the command bar: search commands, slides, blocks, or type a request for the AI.

### 5.8 The AI chat panel ("Ask")

The existing copilot is a chat drawer with four hard-coded chips. Replace it with something a first-time user understands in five seconds.

- **Where:** the fourth tab in the right inspector, with an option to dock it wider. `Cmd/Ctrl+K` reaches the same assistant.
- **Context chips** at the top of the composer show exactly what the AI will act on: "Slide 3", "Chart: Adoption", or "Whole deck". Click to change. With a selection, "make this shorter" acts on the selection; without one, on the current slide.
- **Suggestions are contextual**, derived from the selection type (text, chart, empty slide, whole deck), not a fixed list. Three at most, written as actions ("Turn these bullets into a timeline", "Add a slider for churn").
- **Streaming** assistant text with a Stop button. The model's answer is short. No filler, no forced follow-up question.
- **Changes appear as a change card**: a one-line summary, the list of what changes, the affected blocks highlighted on the canvas, and **Apply**, **Reject**, and after applying **Undo**. Applying is one history step.
- **History** persists per deck (`ai_messages`). Each applied change is linked to its message so it can be reverted.
- **Errors** say what happened and what to do: "AI isn't configured. Add `ANTHROPIC_API_KEY` in `.env`." / "The model returned something I couldn't read. Retry, or rephrase." Never "Something went wrong."
- Understands English, Urdu and Roman Urdu; replies in the user's language.
- Accepts a pasted table (becomes a dataset) and, as a stretch goal, an attached image or document.

### 5.9 Accessibility and performance

- Everything reachable by keyboard; visible focus rings; block selection by Tab, move by arrows; reading order follows z-order; alt text field on images and charts; theme contrast checker that warns when text on background is below 4.5:1 (3:1 large text).
- A 40-slide deck stays smooth: thumbnails render lazily (virtualised rail), only the visible slide mounts live charts, large decks save by slide, not as one blob.

---

## 6. Design direction: the UI must not look AI-generated

### 6.1 Intent

FLUXA's chrome is a **quiet instrument**. The *slide* is where colour and personality live; the app around it stays neutral, dense, and precise. People use it for hours, on laptops, often in two scripts (English and Urdu). The job of the design is to make editing feel exact and fast, and to make live data feel tangible.

**The one memorable thing:** live data made visible. A bound value is marked wherever it appears, editing a cell visibly drives the canvas, charts tween, and sliders respond under the presenter's hand. Spend all the boldness here and keep everything else disciplined.

### 6.2 Tokens (starting values; change only via a written design review)

Define these as CSS custom properties; light is the default, dark is a first-class alternate (system preference plus a manual switch). Use true neutral greys, not tinted ones.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-app` | `#F2F2F3` | `#151517` | app background |
| `--bg-panel` | `#FFFFFF` | `#1C1C1F` | panels, bars, menus |
| `--bg-well` | `#E6E6E8` | `#101012` | the area behind the slide |
| `--line` | `#D9D9DD` | `#2C2C30` | hairlines between regions |
| `--ink` | `#1D1D1F` | `#EDEDEF` | primary text |
| `--ink-2` | `#5B5B61` | `#A4A4AB` | secondary text |
| `--ink-3` | `#75757B` | `#85858C` | placeholders, disabled |
| `--signal` | `#2352F5` | `#7F9BFF` | **selection, focus ring, primary action, and "bound/live" markers, nothing else** |
| `--signal-weak` | `#E7EDFF` | `#232C4D` | selected rows, bound-field tint |
| `--danger` / `--ok` / `--warn` | `#C4262E` / `#1B7F4B` / `#9A5B00` | adjust for contrast | status only |

Check every text/background pair for ≥ 4.5:1 and every UI boundary for ≥ 3:1 with a script, and commit the script. Chrome contains **no gradients, glow, glass or backdrop blur**.

### 6.3 Type

- **IBM Plex Sans** (400, 500, 600) for the interface and **IBM Plex Mono** (400, 500) only for real data: the data grid, formulas, code editor, expression fields. The two share metrics, so a number in a grid and a label beside it align. Use tabular numerals for all figures. This pairing is chosen for a data-heavy tool, not as a house default.
- Scale: 11 (hints), 12 (field labels), **13 (base)**, 15 (dialog text), 18 (panel and dialog titles), 22 (page titles), 30 (workspace title). Letter-spacing 0, except −0.01em at 22 and above. Sentence case everywhere. Line length under 70 characters for any paragraph.
- Urdu: Noto Naskh Arabic (or Nastaliq) at +2px optical size and 1.7 line height; mixed-script lines must align on the baseline.

### 6.4 Shape, density, elevation, motion

- Radius: 4px controls, 6px menus and popovers, 8px dialogs, 0 on the slide stage. Not one radius for everything.
- Panels are separated by 1px lines, not by cards. One shared elevation token for floating layers only (menus, popovers, dialogs, toasts). Nothing else casts a shadow.
- 4px spacing grid. Control height 28px (compact) with a 32px hit area. Icons: Lucide, 16px, 1.5px stroke, `currentColor`. Left-aligned chrome; numbers right-aligned in tables and the data grid.
- Motion answers an action and is quick: 120 ms ease-out for state changes, 100 ms for menus. **No entrance animation on pages or sections. No hover lift or scale on cards.** The single orchestrated moment: during generation, each new thumbnail fades into the rail (150 ms) as its slide arrives. Data changes tween 600–800 ms. `prefers-reduced-motion` makes everything instant.

### 6.5 Layouts of the non-editor screens

**Workspace (replaces the marketing home page).** No hero, no feature cards, no vendor line.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ F  FLUXA                                 Search decks            New deck ▾  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Your decks                                              Sort: Last edited ▾  │
│                                                                              │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│ │ real render│  │ real render│  │ real render│  │ real render│               │
│ │ first slide│  │ first slide│  │ first slide│  │ first slide│               │
│ └────────────┘  └────────────┘  └────────────┘  └────────────┘               │
│ AI in healthcare Q3 review      Thesis defence  Pitch                        │
│ 12 slides        8 slides       24 slides       6 slides      (left / right  │
│ Edited 2 h ago   …                                             two lines)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Deck tiles are renders of the actual first slide in its theme, with the title below and two plain text lines (slide count left, last edited right). `New deck` is a split button: From a prompt (default), Blank, From a template. The first-run empty state is one sentence and one button, not an illustration.

**Create flow.** Three steps on one page that does not scroll sideways.
1. *Describe*: a large prompt box with a compact row beneath it (slide count stepper, audience, tone, language, theme chooser showing a live thumbnail of the deck's first slide). Example prompts appear as a plain list under the box, replaced when the user types.
2. *Review outline*: an editable list on the left (rename, drag to reorder, delete, add, change layout per row); on the right a live preview of the selected row's layout in the chosen theme. Button: **Generate slides**.
3. *Generating*: a grid where each slide appears as it arrives, with a real progress count ("4 of 8") and a Cancel button. When done, open the editor on slide 1.

**Present mode.** Full-bleed stage, no chrome until the pointer moves; controls sit bottom-centre, grouped, small, auto-hiding.

### 6.6 Copy

- Sentence case, plain verbs, active voice: "Generate slides", "Save changes", "Present". One action keeps one name across the flow: the button says "Export", the toast says "Exported".
- Errors state what happened and the fix, and don't apologise. Empty states say what to do next. No exclamation marks, no emoji, no "magic", "supercharge", "unlock", "next-gen", "AI-powered" in product UI, no model or vendor names in the interface (those belong in Settings and docs).
- AI actions are named for what they do ("Shorten", "Turn into a timeline"), never "AI Polish" or a sparkle icon. If a mark is needed, use FLUXA's own.

### 6.7 Do not do any of this (reject on sight, including the lookalikes)

Gradients on text, surfaces or buttons in the chrome; glow, glass, backdrop blur; emoji used as icons or decoration; pulsing dots and pill badges with dots; ALL-CAPS or letter-spaced labels; an eyebrow label above headings; labels built as `WORD — fragment`; meta strings joined with middle dots (`12 slides · Edited today`); arrows appended to links and buttons (`Open →`); a hero with a gradient word plus a row of identical feature cards; one border-radius and one soft shadow on everything; a mono face for decorative small labels; fade-up on every section; hover lift on every card. Also avoid the two common generated looks: warm cream background with a high-contrast serif and a terracotta accent, and near-black background with a single neon accent. Banned fonts in the chrome: Inter, Roboto, Arial, system-ui stacks, Space Grotesk, Plus Jakarta Sans, Poppins, DM Sans, Manrope.

### 6.8 Slide themes (the content, not the chrome)

Ship **at least 10 themes**, each genuinely different. A theme defines: name; heading and body fonts (self-hosted, open licence); a six-step palette; **six chart series colours** (colour-blind safe, ≥ 3:1 against the theme background, checked by script); title size, margins and alignment (they must differ between themes; one theme may be centred); background treatment (flat colour; at most one theme with a subtle texture; no gradient washes); and a PPTX fallback font. Required spread: plain light, plain dark, editorial serif, large-type poster, soft and pastel, corporate blue, high-contrast accessible, technical, warm neutral, and one that supports right-to-left text first. No two themes share a heading font. Candidate open-licence families: Source Serif 4, Literata, Libre Caslon Text, Archivo, Work Sans, Red Hat Display, Barlow, Fira Sans, Public Sans, Atkinson Hyperlegible, IBM Plex Sans, Spectral, Bitter, Lexend.

### 6.9 Process (do this before writing UI code, and again before each phase ends)

1. **Design plan first** (Phase 0, saved as `docs/design-plan.md`): compact token set, type, layout concept with ASCII wireframes for the four screens, principles. Then a paragraph that reviews the plan against section 6.7 and the "memorable thing" rule, naming anything that read like a default and what you changed. Post it as an artifact and **wait for me to reply "go"** before building UI.
2. Build the design system as real components in `frontend/src/ui/` (Button, IconButton, Field, NumberField, Select, Slider, Switch, Tabs, Menu, Popover, Dialog, Tooltip, Toast, Kbd, Panel) before building screens. Style only through tokens.
3. **Critique with screenshots** at 1440×900, 1280×720 and 390×844, light and dark, for every screen. Fix overflow, clipped text, misalignment and anything that looks like section 6.7. Cut one decorative element per screen before declaring it done.
4. Delete `styles.css`. No dead CSS survives the rewrite.

## 7. Rules for every phase

- **Plan first.** At the start of each phase, write the implementation plan and task list as an artifact, then execute it.
- **Verify in the browser yourself.** Never claim a UI works because the code looks right. Run the app, perform the acceptance steps, and attach screenshots or a recording.
- **Keep it green.** At the end of each phase these all pass: TypeScript typecheck, lint, Vitest, pytest, and the Playwright tests that exist so far. Replace legacy tests deliberately (note which and why); don't delete tests to get green.
- **No fakes.** No lorem ipsum, no stubbed feature presented as finished, no `TODO` in shipped paths, no hard-coded demo data outside `scripts/seed_demo.py` and the mock provider. If something can't be finished, say so in the phase report.
- **Dependencies:** every new package gets one line in `docs/decisions.md` (name, why, licence). Prefer small, maintained packages.
- **Code shape:** files under about 400 lines; components do one job; the document store and the UI store stay separate; commands are pure functions over the spec.
- **Security:** never log or commit secrets; the AI key stays on the server; sandbox user-authored HTML; validate every upload and every write.
- **Tests never call a real model.** Use `MockProvider`.
- **Phase report** (end of every phase): what changed, how it was verified, screenshots, known gaps, decisions made. Commit with a clear message.

---

# PART 2 — PHASE PROMPTS

Paste one at a time. Each begins by pointing back to the master brief.

---

## PHASE 0 — Hygiene, audit, design plan

> You are on **Phase 0** of FLUXA (master brief above). Goal: a clean, safe, typed foundation, an honest baseline, and an approved design plan, with no feature work yet.
>
> 1. **Hygiene.** Remove `.env` from the repository tree and make sure `.gitignore` covers `.env`, `node_modules/`, `dist/`, `instance/*.db`, `instance/uploads/`, `__pycache__/`, `.pytest_cache/`. Rewrite `.env.example` for the variables in section 4.5. Delete the committed `frontend/node_modules` and `frontend/dist` and reinstall cleanly. Tell me to rotate the leaked OpenRouter key.
> 2. **Tooling.** Add TypeScript (strict), ESLint, Prettier, Vitest, Playwright. Add a root `package.json` with `dev` (Flask + Vite together), `build`, `test`, `lint`, `typecheck`. Add `ruff` for Python. Split `requirements.txt` into runtime and dev, and add `pydantic`.
> 3. **Baseline.** Run the current app and save screenshots of Home, Create, Editor (two slides, one with a chart) and Present mode at 1440×900, 1280×720, 390×844 into `docs/before/`. Write `docs/audit.md` confirming or correcting the defect table in section 2 of the brief.
> 4. **Design plan.** Produce `docs/design-plan.md` exactly as section 6.9 step 1 describes, including ASCII wireframes of the Workspace, Create flow, Editor, and Present mode, and the self-review paragraph. Post it as an artifact.
>
> **Acceptance:** `npm run dev` starts both servers; typecheck, lint and all existing tests pass; `.env` is no longer in the tree; `docs/before/*` and `docs/audit.md` exist; the design plan is posted. **Stop and wait for me to reply "go" before Phase 1.**

---

## PHASE 1 — Specification and backend

> You are on **Phase 1**. Goal: the structured presentation specification (the PRD's FR-4 and NFR-6) and a backend that stores and validates it.
>
> Do sections 4.2 and 4.3 in full:
> 1. Write `shared/spec.ts`, `shared/spec.schema.json`, Pydantic models in `app/spec/`, and a test that fails if the Zod and Pydantic definitions disagree. Write `docs/spec.md` with the worked examples from section 4.2.
> 2. Add the new columns and tables (guarded, non-destructive `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS`): `theme`, `datasets`, `variables`, `settings`, `schema_version`, `revision` on presentations; `spec` on slides; `assets`; `ai_messages`.
> 3. Write `scripts/migrate_legacy_content.py` (backs up the DB, idempotent, tokenizer rather than `split(":")`). Test it on: bullets only, each of the five legacy tags, labels containing colons, invalid JSON inside a tag, empty content, Urdu text.
> 4. Routes: extend presentation and slide routes as in 4.3 (including the 409 revision check); add asset upload, serve and delete with type and size validation; keep all existing routes and their response shapes working.
> 5. Rewrite or replace the legacy tests that encode the text-markup contract. Add tests for validation failures (unknown block type, bad bounds, oversize asset, conflicting revision).
>
> **Acceptance:** pytest green. Running the migration on a DB containing a legacy deck with `[metric:Q3: growth:12%:Up]` produces correct blocks. An invalid spec returns 422 with a readable message. Upload then fetch an image round-trips with correct headers. Two writes with the same `revision` return 409 on the second.

---

## PHASE 2 — Rendering core

> You are on **Phase 2**. Goal: one renderer used everywhere, ten themes, twelve layouts, and a present mode that actually goes full screen. Implement 4.4, 6.8, and the present-mode part of 5.5.
>
> 1. Build the token-driven theme engine and ship ten themes (6.8), with a script that checks palette contrast and chart-colour contrast.
> 2. Build twelve layouts that position blocks by `role`, with text-fit (shrink to a minimum, never overflow).
> 3. Build `<SlideStage>` (modes `edit|present|thumbnail|print|export`) and static renderers for text, shape, image, icon, chart (Chart.js, with the hidden data table), kpi, table, steps, timeline, comparison, quote, embed. Unknown block types render a labelled placeholder.
> 4. Present mode as a portal at `document.body` with the Fullscreen API, keyboard controls, auto-hiding controls. Share viewer at `/v/:id` and print route at `/print/:id`.
> 5. Playwright visual baselines for every layout × three themes at 1920×1080, plus fixtures with very long text, many bullets, and Urdu text.
>
> **Acceptance:** at 1440×900, Present shows only the slide, full screen, no sidebar or header (defect 1 gone). The same slide looks identical in the editor thumbnail, present, viewer and print. No layout overflows with the long-text fixture. The Urdu fixture is right-to-left and correctly shaped in all four. Screenshots attached.

---

## PHASE 3 — The editor

> You are on **Phase 3**. Goal: a real editor, per 5.1, 5.2 (Design tab), 5.7 and 6.5. Build the design system components first (6.9 step 2), then the screens.
>
> 1. Document store with Immer patches, command functions, history (undo/redo, gesture grouping), debounced autosave with `revision`, IndexedDB draft, save-status indicator.
> 2. Editor shell with three panels and responsive behaviour (4.4). Remove the five-column layout and the old `EditorPage.jsx`.
> 3. Canvas: selection, multi-select, move, resize, rotate, snapping guides, nudge, copy/paste/duplicate, delete, z-order, lock, hide, align and distribute, zoom, slide sorter view.
> 4. Text blocks edited in place (Tiptap), with the floating text toolbar. Insert toolbar and `/` quick insert.
> 5. Slide rail with real thumbnails, drag-to-reorder through the existing reorder route, context menu, lazy rendering.
> 6. Inspector Design tab; layout gallery; theme gallery with live preview; theme saved to the database.
> 7. Workspace screen (6.5) with real first-slide renders, search, sort, New deck split button. Command bar (`Cmd/Ctrl+K`) for commands, slides and blocks; shortcut sheet (`?`).
> 8. Shortcuts per 5.1 and 5.7; undo toasts instead of confirms.
>
> **Acceptance (perform in the browser):** create a deck from a layout; add and edit text in place; move a block and see snap guides; resize; undo three steps and redo three; reload and find the deck exactly as left; drag slide 3 to position 1 and confirm it persists; go offline (DevTools) and see "Offline: changes kept on this device", then reconnect and see it save; switch the theme and see every slide change; open on a 390px viewport and confirm the app explains that editing needs a larger screen while Present still works. Run the screenshot critique (6.9 step 3) for the Workspace and Editor in light and dark.

---

## PHASE 4 — The dynamic engine

> You are on **Phase 4**. Goal: the part no other tool has. Implement 5.3, 5.4, 5.5 (animations, transitions, presenter view) and the Data tab of 5.2.
>
> 1. The expression evaluator with the whitelist and limits from 4.1, and its tests including hostile input.
> 2. Datasets and variables in the store; the Data tab grid (edit, add/remove rows and columns, paste from Excel/CSV, import CSV, computed columns); the variables editor.
> 3. Reactive bindings (`$bind`) with the bound-field affordance and expression editor (6.1, 5.2).
> 4. Chart block fully live: kinds, series, animated update; KPI count-up; table with changed-cell flash; `control` blocks; steps, timeline, comparison, tabs and click-to-reveal, hotspots.
> 5. HTML widget block with the sandbox, CSP and bridge (5.4), CodeMirror editor, live preview, snapshot capture.
> 6. Block animations, slide transitions, the build-order list, Preview button, `prefers-reduced-motion`; presenter view with notes, next slide, timer.
>
> **Acceptance:** (a) Build the *55 → 74* example from 4.2 by hand: change the cell; the bar tweens to 74 and the bound KPI counts to 74. (b) Build the *what-if* example: drag the slider in the editor's Try-it mode and in present mode; chart and KPI update live. (c) From inside an HTML widget, `window.parent.document`, `fetch("https://example.com")` and `localStorage` all fail; `fluxa.get/set` work. (d) Hostile expressions return an inline error and the slide still renders. (e) Present steps through builds before advancing; with reduced motion on, everything is instant. (f) The presenter window stays in sync with the main window. Record a short screen capture of (a), (b) and (f).

---

## PHASE 5 — The AI layer

> You are on **Phase 5**. Goal: a model integration that works reliably and a chat people enjoy using. Implement 4.5 and 5.8 and the Create flow of 6.5.
>
> 1. `app/ai/` with the `Provider` interface, `AnthropicProvider`, `OpenRouterProvider`, `MockProvider`; env-only config; `GET /api/ai/status`; delete the old fallback list and the blocking `ai_client.py` loop.
> 2. Forced-tool schemas for outline, slide intent, and ops. The semantic-to-blocks **compiler** and the content-limit repair pass. One repair retry. Typed error codes. Timeouts, backoff, cancellation.
> 3. Streaming endpoints: outline, generate, chat (SSE). The frontend stream reader.
> 4. **Create flow** (Describe → editable outline → generating grid with real progress and Cancel).
> 5. The **Ask** panel: context chips, contextual suggestions, streaming text, change cards with Apply / Reject / Undo, persisted history. Ops engine applying through the same store as manual edits, atomically.
> 6. Inline AI on selected text (three suggestions), "Create chart from pasted table", "Make this interactive", "Improve design", "Write speaker notes".
> 7. AI-authored HTML widgets with a render check before Apply.
> 8. Remove the forced follow-up question from the prompts. Keep Urdu and Roman Urdu support.
>
> **Acceptance (with `AI_PROVIDER=mock`):** prompt → outline appears → edit it (rename, reorder, delete) → Generate slides → slides stream into the rail with a real count → Cancel mid-stream leaves no partial slide. "Make this slide shorter" with a block selected produces a change card; Apply updates the slide; Undo restores it exactly. "Turn these bullets into a timeline" works. Feed the pipeline each of these bad outputs and confirm either a clean repair or a clear error, with the deck untouched: invalid JSON, JSON in a code fence with prose around it, wrong slide count, unknown block type, a missing required field, an overlong title, an empty response, a timeout. With no key configured the UI says exactly how to configure it. With a real key (if I've provided one) repeat the main flow once and record it.

---

## PHASE 6 — Export and share

> You are on **Phase 6**. Goal: everything in 5.6, with honest fidelity notes.
>
> 1. PPTX export with PptxGenJS: native text, shapes, images, tables, notes; **native editable charts**; snapshots for `html` and `embed`; font fallbacks per theme.
> 2. PDF via the print route; PNG zip; Markdown outline from the new spec.
> 3. Standalone HTML export (viewer bundle + deck JSON + fonts inlined into one file).
> 4. Share link with random token, revoke, and the read-only viewer.
> 5. Export dialog describing what each format keeps and loses.
> 6. Automated checks: unzip the PPTX and assert slide count and chart parts; load it with `python-pptx`; convert it with LibreOffice headless; open the standalone HTML from `file://` in Playwright and confirm the slider still updates the chart.
>
> **Acceptance:** export the demo deck (Phase 7's seed, or a fixture) to every format. The PPTX opens, its charts are editable (the data sheet is present), and slide count matches. The standalone file works offline. Revoking a share link makes `/v/:id` return a clear "no longer shared" page.

---

## PHASE 7 — Polish, quality, delivery

> You are on **Phase 7**. Goal: make it demonstrable and defensible.
>
> 1. Run the design critique loop (6.9 step 3) on every screen in light and dark at all three viewports. Remove anything that matches 6.7. Confirm `styles.css` is gone.
> 2. Accessibility: axe checks in Playwright on every screen; keyboard-only run through create, edit, present; contrast checker; alt text prompts.
> 3. Performance: a 40-slide seed deck stays smooth in the editor; measure and record time to first outline event and time to first slide from the mock and (if available) a real provider.
> 4. Playwright end-to-end tests for the six PRD user stories (generate an outline; edit text directly; AI command makes a slide shorter; change a chart value and watch it update; present with transitions; export a PPTX that opens).
> 5. `scripts/seed_demo.py` creates a demo deck that shows every dynamic feature. `README.md`: setup, env vars, how to run tests, the five-minute demo script below, known limitations. Finalise `docs/decisions.md`.
> 6. Delete dead code, unused dependencies and unused assets.
>
> **Acceptance:** all suites pass from a clean clone with `npm run test`; the demo script runs start to finish offline with `AI_PROVIDER=mock`; the final screenshots for every screen are attached; the requirements table below is filled in with the test or file that proves each row.

---

# PART 3 — REFERENCE

## 8. Requirements traceability (fill in during Phase 7)

| Requirement | Where it is met |
|---|---|
| FR-1 prompt input | Create flow, step 1 |
| FR-2 outline from the model | `/generate/outline`, outline editor |
| FR-3 slide content from the model | `/generate` (SSE), compiler |
| FR-4 structured JSON specification | `shared/spec.ts`, `docs/spec.md` |
| FR-5 HTML rendering, not images | `SlideStage` |
| FR-6 browser-based visual editor | Editor (5.1) |
| FR-7 direct text editing | Tiptap in-place editing |
| FR-8 natural-language edit commands | Ask panel, ops engine |
| FR-9 AI improvement suggestions | Inline AI popover |
| FR-10 data-bound live charts | Chart block, datasets, bindings |
| FR-11 transitions and animations | 5.5 |
| FR-12 preview and present mode | Present, presenter view, viewer |
| FR-13 CRUD via backend APIs | Presentation, slide, asset routes |
| FR-14 export incl. PowerPoint-compatible | 5.6 |
| FR-15 graceful AI errors | Typed errors, repair pass, Retry |
| NFR-1 first-time usability | Keyboard and mouse run in Phase 7, no instructions given |
| NFR-2 performance | Streaming; timings recorded in Phase 7 |
| NFR-3 responsiveness | 4.4 chrome breakpoints, viewer scaling |
| NFR-4 secrets stay server-side | env-only config, `/api/ai/status` |
| NFR-5 reliability | Repair pass, atomic ops, mock provider |
| NFR-6 extensible schema | `schemaVersion`, migrations, unknown-block placeholder |
| NFR-7 compatibility | PPTX checks (python-pptx, LibreOffice) |

## 9. Five-minute demo script (must work offline)

1. New deck from a prompt. Edit the outline (rename one slide, delete one). Generate; watch slides arrive.
2. Open the adoption chart, change 55 to 74 in the Data tab. The chart tweens and the KPI counts up.
3. On the forecast slide, drag the growth slider; the chart and the headline number follow.
4. In Ask: "make this slide shorter". Review the change card, Apply, then Undo.
5. Insert an HTML widget by asking for "a compound interest calculator".
6. Present full screen with a transition; open the presenter view with notes.
7. Export PowerPoint and open it, then export the standalone HTML and open it with the network off.
