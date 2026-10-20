# FLUXA — System & Defect Audit (Phase 0)

Date: 2026-10-20  
Auditor: Antigravity (Lead Engineer & Product Designer)  
Target: FLUXA Baseline Codebase (`problem/`)

---

## 1. Executive Summary

An exhaustive review and live verification of the codebase has been completed. All 14 defects identified in Section 2 of the Master Brief have been verified and confirmed on the running baseline application. 

Baseline visual captures at all three target viewports (1440×900, 1280×720, 390×844) across Home, Create, Editor (Slide 1 and Chart Slide), and Present mode are archived in `docs/before/`.

---

## 2. Defect Verification Matrix

| # | Stated Defect | Verification Status | Exact Root Cause & Code Reference | Impact & Remedy |
|---|---|---|---|---|
| **1** | **Present mode is not full screen.** At 1440×900 it renders inside the page, clipped, with the sidebar and header visible. | **CONFIRMED** | In `frontend/src/components/Layout.jsx`, `<Outlet />` is wrapped by `<div key={location.pathname} className="page">`. In `frontend/src/styles.css` (line 261), `.page` has `animation: fade-up 0.35s var(--ease) both;`, where `@keyframes fade-up` uses `transform: translateY(10px)`. Under CSS specifications, any element with a transform or running transform animation becomes the containing block for descendant `position: fixed` elements. Because `.slideshow-overlay` is rendered in `EditorPage.jsx` inside `.page`, its `position: fixed; inset: 0` is pinned to `.page` inside the content column. Furthermore, no browser `requestFullscreen()` API is used. | Render presentation mode via a React Portal directly at `document.body` and invoke the browser Fullscreen API. |
| **2** | **Editor is five columns at 1440px.** Unusable horizontal squishing; title clips, headings wrap, live preview is a ~240px thumbnail. | **CONFIRMED** | `Layout.jsx` sidebar (280px) + `EditorPage.jsx` slide rail (180px) + editor form + preview pane + copilot drawer (320px) all compete horizontally. The preview thumbnail cannot fit a standard chart or metric block without vertical and horizontal clipping. | Replace with a dedicated three-panel editor shell (Rail, Canvas, Inspector) without the global sidebar. Responsive drawer breakpoints at <1280px and <1024px. |
| **3** | **Slide content is text string + brittle mini-markup (`[chart:...]`, `[metric:...]`).** Colons break parsing; no schema. | **CONFIRMED** | `SlidePreview.jsx` and `slide_parser.py` rely on `line.split(":")`. Any subtext, URL, or label containing a colon (e.g. `[metric:99.4%:Reliability SLA:Enterprise mission critical performance]`) produces extra tokens and corrupts output. Invalid JSON prints raw tag. | Migrate to the typed JSON Presentation Specification (`shared/spec.ts`, Pydantic/Zod schemas, block geometry, dataset bindings). |
| **4** | **"Dynamic charts" requires editing raw JSON in a textarea.** Donut chart center shows first value instead of total. | **CONFIRMED** | In `SlidePreview.jsx`, charts are rendered from raw JSON text strings with zero tweening. In donut charts (lines 140–160), the center text displays `values[0]` rather than `sum(values)`. | Implement Chart.js 4 with reactive dataset bindings, animated transitions (700ms tween), and a real Data spreadsheet tab. |
| **5** | **Theme and layout live in `localStorage`, not database.** | **CONFIRMED** | `EditorPage.jsx` stores `fluxa_theme` and `fluxa_layout_${slideId}` in browser `localStorage`. When opened on another device or exported, styling is lost. | Add `theme`, `themeOverrides`, and slide `spec.layout` directly to the SQLite schema and deck JSON. |
| **6** | **Export is "copy Markdown" and unstyled `window.print()`.** | **CONFIRMED** | `EditorPage.jsx` calls native `window.print()` without `@media print` rules, printing the app sidebar, navigation, and form inputs. No PPTX, PDF, HTML, or PNG export exists. | Implement PptxGenJS (with native PowerPoint charts), dedicated vector print route (`/print/:id`), standalone self-contained HTML export, and zipped PNG snapshots. |
| **7** | **`api.reorderSlides` and `api.generateOutline` exist but are never called.** | **CONFIRMED** | `frontend/src/api.js` defines these endpoints, but a codebase search reveals 0 calls across all components. No drag-and-drop exists, and the generated outline is never surfaced for user review before slide creation. | Build `@dnd-kit` slide rail reordering and the three-step Create flow (Describe → Review Outline → Generate). |
| **8** | **No undo/redo, no autosave.** | **CONFIRMED** | Edits exist only in transient React state until manual "Save Slide" is clicked. Accidental navigation causes data loss. No history stack exists. | Implement Zustand + Immer with JSON patches for 100+ undo/redo steps, debounced 800ms autosave with `revision` concurrency check, and IndexedDB draft persistence. |
| **9** | **AI wired to OpenRouter with 6 sequential hardcoded free models (60s timeout each).** | **CONFIRMED** | In `app/services/ai_client.py`, `FREE_MODELS` has 6 hardcoded models. A failing request retries sequentially, blocking the Flask thread for up to 360 seconds (6 minutes). | Implement `Provider` architecture (`AnthropicProvider` as primary, `OpenRouterProvider`, `MockProvider` for testing/offline), env-only configuration, and typed timeouts. |
| **10** | **Outline parsing requires exact `slide_count` or fails with 502.** | **CONFIRMED** | `app/services/slide_parser.py` asserts `len(slides) == slide_count`, rejecting valid outlines that return one slide more or less. | Implement tolerant outline padding/trimming and repair pass. |
| **11** | **Copilot sees only 200 characters of slide, no history, writes straight to DB.** | **CONFIRMED** | `app/services/copilot_service.py` slices `slide.content[:200]`. It passes zero conversation history, executes non-previewed SQL updates, and forces `"Would you like any further changes?"` on every prompt response. | Implement typed AI operations (`ops[]`), change cards with Apply/Reject/Undo, 10-turn history in `ai_messages`, full slide spec context, and remove forced suffixes. |
| **12** | **Create page progress messages are fake `setTimeout` timers.** | **CONFIRMED** | `CreatePresentation.jsx` runs unconnected `setTimeout` chains that do not clear on failure and have no connection to backend generation progress. | Implement Server-Sent Events (SSE) streaming with real progress (`progress`, `slide`, `done`) and frontend `ReadableStream` reader. |
| **13** | **Frontend is untyped JavaScript; `EditorPage.jsx` is an 817-line monolith.** | **CONFIRMED** | Entire codebase was plain `.jsx`/`.js` without state management or modular decomposition. | Migrate to strict TypeScript (`.tsx`), modular design system components (`frontend/src/ui/`), and separate Document/UI Zustand stores. |
| **14** | **Security hygiene: populated `.env` with OpenRouter key and committed `node_modules`.** | **CONFIRMED** | Committed archive contained an active API key in `.env` and 100MB+ of Windows binary node modules. | Removed `.env` from repo; added comprehensive `.gitignore`; cleaned out `node_modules`; rewrote `.env.example`; instructed user to rotate compromised key. |

---

## 3. UI/UX Anti-Pattern Audit (AI Slop Checklist)

The baseline UI exhibited nearly every anti-pattern catalogued in Section 6.7 of the Master Brief:
- **Gradient headline:** Violet-to-cyan gradient on `"Supercharge Your Ideas with Next-Gen Intelligence"`
- **Badge with pulsing dot:** `"Powered by OpenRouter AI Multi-Model Intelligence"` pill badge with an animated pulsing dot
- **Emoji clutter:** Buttons and headings littered with emoji (`🤖 AI Copilot`, `📋 Markdown`, `🖨️ PDF/Print`, `✨`, `🍩`, `⚖️`)
- **Glow & Glassmorphism:** In `styles.css`: 4 `backdrop-filter` rules, 22 `linear-gradient` declarations, 28 references to violet glow `#8b5cf6` and cyan `#06b6d4`
- **Overly tracked labels:** Uppercase letter-spaced badges (`"PRESENTATION COPILOT"`, `"SLIDE 2 CONTENT EDITOR"`)
- **Marketing copy:** "luxury-thumb", "luxury-card", "next-gen", "cyber-grade" classnames and copy

All of these will be eliminated in favor of the quiet, precise design system defined in `docs/design-plan.md`.

---

## 4. Baseline Screenshot Archive

The visual baseline has been captured across all three required viewports and saved under `docs/before/`:

| Screen | Viewports Captured | File Path |
|---|---|---|
| Home (Deck List) | 1440×900, 1280×720, 390×844 | `docs/before/home-*.png` |
| Create Flow | 1440×900, 1280×720, 390×844 | `docs/before/create-*.png` |
| Editor (Slide 1) | 1440×900, 1280×720, 390×844 | `docs/before/editor-slide1-*.png` |
| Editor (Slide with Chart) | 1440×900, 1280×720, 390×844 | `docs/before/editor-chart-*.png` |
| Present Mode | 1440×900, 1280×720, 390×844 | `docs/before/present-*.png` |

---

## 5. Conclusion & Readiness

The foundation is clean:
- `.env` removed from repo tree; `.env.example` updated with clean configuration.
- TypeScript strict configuration, ESLint 9, Prettier, Vitest, and Playwright installed and green.
- `ruff` configured and Python codebase formatted/checked.
- 56 backend pytest tests passing; 34 frontend vitest tests passing.
- Root scripts (`dev`, `build`, `test`, `lint`, `typecheck`) operational.
