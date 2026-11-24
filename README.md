# FLUXA — Reactive Presentation Software

FLUXA is an open-source web-native presentation software platform where slides are live reactive programs. Unlike traditional static slide decks that treat canvas content as dumb pixels or inert vector shapes, FLUXA models every deck as a stateful computational graph with embedded datasets, variables, mathematical expressions, interactive widgets, bidirectional AI assistance, and open export engines.

---

## 1. Architecture Overview

```
                      +---------------------------------------+
                      |         FLUXA React Application       |
                      +---------------------------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
+---------------+                 +---------------+                 +---------------+
|  Editor Shell |                 |  Slide Stage  |                 | Inspector Rail|
| (Top bar, rail|                 | (16:9 canvas, |                 | (Slide, Block,|
|  command bar, |                 |  CSS transform|                 |  Data sheet,  |
|  dialogs)     |                 |  hit testing) |                 |  Animate, Ask)|
+---------------+                 +---------------+                 +---------------+
        |                                 |                                 |
        +---------------------------------+---------------------------------+
                                          |
                      +---------------------------------------+
                      |       Reactive Runtime Engine         |
                      |  - JSEP AST expression evaluation     |
                      |  - Deck variable & dataset bindings   |
                      |  - Sandboxed postMessage widget bus   |
                      |  - Topo-sorted dependency propagation |
                      +---------------------------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
+---------------+                 +---------------+                 +---------------+
| Export Engine |                 | AI Assistant  |                 | Storage Layer |
| - PptxGenJS   |                 | - LLM Router  |                 | - Flask REST  |
| - Standalone  |                 | - SSE stream  |                 | - SQLite WAL  |
|   offline HTML|                 | - Change card |                 | - IndexedDB   |
| - ZIP / MD    |                 | - Undo engine |                 |   offline     |
+---------------+                 +---------------+                 +---------------+
```

### Component Roles
1. **Editor Shell:** 40px top bar, responsive thumbnail rail with drag-and-drop reordering, slide sorter grid, keyboard shortcut sheet, and modal dialogs.
2. **Slide Stage:** 1920x1080 fixed virtual coordinate system rendered inside letterboxed flex container with responsive dynamic CSS matrix scale (`scale(min(w/1920, h/1080))`), direct manipulation bounding handles, and snapping alignment guides.
3. **Reactive Runtime:** Zero-runtime-dependency mathematical expression engine built on JSEP AST parsing and safe evaluation. Variables and computed dataset columns propagate changes instantly across chart bars and KPI counters with 400ms ease-out transitions.
4. **Sandboxed HTML Widgets:** `<iframe>` blocks isolated via strict CSP (`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'`) communicating bidirectionally with the deck runtime using the `fluxa.on("change")` and `fluxa.emit("update")` postMessage bridge.
5. **Bidirectional AI Layer:** Multi-provider LLM client (Anthropic Claude, OpenAI, DeepSeek, Google Gemini, Ollama, and Mock) streaming slide generation via Server-Sent Events (SSE). Inspector edits produce atomic, inspectable Change Cards with 1-click Apply and Undo.
6. **Export and Sharing:** Client-side generation of native editable PowerPoint presentations (.pptx) with real Office charts, standalone offline single-file HTML bundles, PNG slide image archives, and cryptographic revocable share links.

---

## 2. Tech Stack

- **Frontend:**
  - React 18 with TypeScript 5
  - Vite 6 build engine
  - CSS Variables design token architecture (Light & Dark luxury themes)
  - Lucide React icon set
  - Chart.js & react-chartjs-2 with Accessible HTML table fallbacks
  - Tiptap / ProseMirror rich text inline editor
  - JSEP (JavaScript Expression Parser)
  - PptxGenJS, JSZip, and html-to-image
- **Backend:**
  - Python 3.11+
  - Flask 3.0+ REST API with SSE streaming
  - SQLite with WAL mode and foreign key constraints
  - Pydantic v2 schemas for strict contract validation
  - python-pptx for export verification
  - ruff for linting and formatting
- **Testing & Quality:**
  - Playwright E2E browser test suite (Chromium)
  - Vitest frontend unit & store test suite
  - Pytest backend routes & validation suite

---

## 3. Setup Instructions

### Prerequisites
- Node.js 18.x or 20.x
- Python 3.10+ with `pip`
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Backend Setup
```bash
# Clone the repository
git clone https://github.com/fluxa-org/fluxa.git
cd fluxa

# Create and activate Python virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Run database migrations and seed demo data
python run.py --init-db
python scripts/seed_demo.py
```

### Frontend Setup
```bash
# Install NPM dependencies
npm install

# Start Vite frontend development server
npm run dev --workspace=frontend
```

By default, the backend API runs at `http://127.0.0.1:5000` and the frontend runs at `http://127.0.0.1:5173`.

---

## 4. Environment Variables Reference

Create a `.env` file in the root directory (refer to `.env.example`):

```bash
# Server configuration
FLASK_ENV=development
PORT=5000
DATABASE_PATH=instance/fluxa.db

# AI Provider configuration
# Options: mock | anthropic | openai | deepseek | gemini | ollama
AI_PROVIDER=mock

# API Keys (required only when AI_PROVIDER is not 'mock')
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Security
SECRET_KEY=fluxa-secret-development-key-change-in-production
```

When `AI_PROVIDER=mock`, the application is **100% offline capable** with zero external API calls or latency overhead.

---

## 5. Testing Commands

Execute full-fidelity verification across the stack:

```bash
# 1. Backend pytests (81 tests: auth, presentation, slides, AI routes, SSE streaming)
python -m pytest tests/

# 2. Frontend vitests (53 tests: reactive engine, JSEP AST, ops engine, PPTX/HTML exporters)
npm run test --workspace=frontend

# 3. TypeScript compilation check (0 errors)
npm run check --workspace=frontend

# 4. Python linting check (0 errors)
python -m ruff check .

# 5. Playwright E2E test suite (36 tests across all 6 suites)
npx playwright test

# 6. Specific Phase 7 PRD user stories acceptance suite
npx playwright test e2e/prd_user_stories.spec.ts

# 7. AI streaming latency benchmarks
python scripts/benchmark_streaming.py

# 8. Theme contrast accessibility audit
python scripts/check_theme_contrast.py

# 9. 40-slide performance stress deck benchmark
python scripts/seed_40_slides.py
```

---

## 6. 5-Minute Offline Demo Script

This script walks through all core capabilities in under 5 minutes without needing an internet connection.

### Minute 0:00 - 1:00: Seed and Explore
1. Run `python scripts/seed_demo.py` in your terminal.
2. Open `http://localhost:5173/presentations/14` in your browser.
3. Observe the neutral 3-panel layout: slide rail on the left, 16:9 canvas stage centered, and multi-tab inspector on the right.
4. Press `G` to open the full-deck Slide Sorter modal. Press `Escape` to close it.
5. Press `?` to review the keyboard shortcut reference sheet. Press `Escape` to dismiss.

### Minute 1:00 - 2:00: Direct Canvas Manipulation
1. Double-click the headline on Slide 1: `"FLUXA: Presentations as Reactive Software"`.
2. The inline Tiptap editor mounts with a floating formatting toolbar. Type new text and press `Escape`.
3. Notice the top bar save indicator transition from `Saving…` to `Saved` with zero lag.
4. Click on the subtitle block. In the right Inspector panel under the **Block** tab, adjust font size or alignment. Drag the canvas block corner handle to resize.

### Minute 2:00 - 3:00: Live Reactive Engine (The 55 -> 74 Worked Example)
1. In the slide rail on the left, click **Slide 2** (`Adoption Velocity: The 55 → 74 Transition`).
2. Observe the initial state: the KPI counter displays `55%`, and the bar chart shows the 2024 bar at height 55.
3. In the right Inspector panel, click the **Data** tab.
4. Locate the `adoption` table. Click the cell for `2024` currently set to `55`.
5. Type `74` and press `Enter`.
6. Watch the canvas: the chart bar immediately tweens upward to 74, and the KPI counter smoothly counts from 55% to 74% over 400ms.

### Minute 3:00 - 3:45: Interactive What-If Forecast & Sandboxed Widget
1. Select **Slide 3** (`Interactive Revenue Forecast`).
2. Drag the interactive **Growth Rate Multiplier** slider on the canvas from `1.2` to `1.6`.
3. Notice the forecast chart bars and the `$876M` total revenue KPI block recalculate instantly using the reactive expression `round(sum(forecast.projected), 1)`.
4. Select **Slide 4** (`Sandboxed HTML/JS Widget`). Drag the annual yield slider to observe the compound interest schedule recalculating inside the CSP-isolated `<iframe>`.

### Minute 3:45 - 4:15: Bidirectional AI Assistant
1. Switch to the **Ask** tab in the Inspector panel.
2. In the input box, type: `Make this slide shorter` and press `Enter`.
3. An atomic **Change Card** renders, showing the proposed summary text alongside `Apply` and `Reject` buttons.
4. Click `Apply`. The slide updates immediately, and a 1-click `Undo` button appears. Click `Undo` to restore the original text.

### Minute 4:15 - 5:00: Presentation & Honest Export
1. Click the **Present** button in the top bar (or press `Ctrl+Enter`).
2. The presenter portal mounts directly to `document.body`, escaping all container transforms for full-bleed display. Press `Space` or `ArrowRight` to advance slides. Press `Escape` to return.
3. Click the **Export** button in the top bar.
4. The Honest Export dialog opens, detailing format fidelity:
   - **PowerPoint (.pptx):** Generates real native Office shapes and editable chart series using PptxGenJS.
   - **Standalone HTML (.html):** Exports a single self-contained offline bundle with embedded reactive engine and interactive sliders.
   - **ZIP (.zip):** Slide images rendered at 1920x1080.
   - **Markdown (.md):** Semantic outline with table benchmarks.
5. Click **Export PPTX**. Open the downloaded deck in Microsoft PowerPoint, Apple Keynote, or Google Slides to verify native editable charts.

---

## 7. Known Limitations & Honest Fidelity Disclosures

In accordance with FLUXA's design principles, we disclose all format limitations honestly:

| Format | Native Capabilities | Fidelity Trade-offs & Limitations |
| :--- | :--- | :--- |
| **PowerPoint (.pptx)** | Vector shapes, native Office Bar/Line/Pie/Doughnut charts, editable tables, typography | Interactive JS sliders and iframe widgets cannot run inside Office OpenXML; they are exported as high-resolution raster snapshots. |
| **Standalone HTML (.html)** | 100% full fidelity: reactive expressions, dynamic sliders, Chart.js animations, offline self-contained bundle | File size is larger (~1.2 MB) because it includes embedded Chart.js and runtime logic in a single file without external CDN links. |
| **Slide Images (.zip)** | Pixel-perfect 1920x1080 PNG renderings of all slides | Inert raster format without text selectable or reactive interaction. |
| **Markdown (.md)** | Lightweight portable plain text with outline headings, notes, and Markdown data tables | Visual styling, chart graphics, and canvas coordinates are omitted by design. |
| **Share Links** | Instant public/restricted read-only viewing with cryptographic token revocation | Requires a reachable FLUXA server instance to serve live deck updates. |

---

## 8. Requirements Traceability Matrix

| Requirement | Description | Code Implementation | Verification Proof |
| :--- | :--- | :--- | :--- |
| **FR-1** | Presentation CRUD | `app/routes/presentation_routes.py` | `tests/test_presentation_routes.py` |
| **FR-2** | Slide CRUD & Ordering | `app/routes/slide_routes.py` | `tests/test_slide_routes.py` |
| **FR-3** | Rich Content Blocks | `frontend/src/rendering/blocks/*` | `e2e/rendering.spec.ts` |
| **FR-4** | Themes & Typography | `frontend/src/themes/themeDefinitions.ts` | `scripts/check_theme_contrast.py` |
| **FR-5** | Direct Canvas Editing | `frontend/src/editor/canvas/EditorCanvas.tsx` | `e2e/prd_user_stories.spec.ts` (Story 2) |
| **FR-6** | Slide Rail & Sorter | `frontend/src/editor/rail/SlideRail.tsx` | `e2e/editor.spec.ts` |
| **FR-7** | Reactive State Engine | `frontend/src/runtime/reactiveEngine.ts` | `frontend/src/runtime/__tests__/reactiveEngine.test.ts` |
| **FR-8** | Live Data Table (55->74) | `frontend/src/editor/inspector/DataInspector.tsx` | `e2e/prd_user_stories.spec.ts` (Story 4) |
| **FR-9** | Interactive What-If Sliders | `frontend/src/rendering/blocks/ControlBlockRenderer.tsx` | `e2e/dynamic_engine.spec.ts` |
| **FR-10** | Sandboxed HTML Widgets | `frontend/src/rendering/blocks/HtmlBlockRenderer.tsx` | `e2e/dynamic_engine.spec.ts` |
| **FR-11** | AI Outline & Slide Stream | `app/routes/generation_routes.py` | `e2e/prd_user_stories.spec.ts` (Story 1) |
| **FR-12** | AI Assistant Change Cards | `frontend/src/editor/inspector/AskInspector.tsx` | `e2e/prd_user_stories.spec.ts` (Story 3) |
| **FR-13** | Presenter Mode & Multi-Window | `frontend/src/rendering/PresentMode.tsx` | `e2e/prd_user_stories.spec.ts` (Story 5) |
| **FR-14** | Export Engines (PPTX/HTML/ZIP) | `frontend/src/export/*` | `e2e/prd_user_stories.spec.ts` (Story 6) |
| **FR-15** | Share Links & Revocation | `app/routes/share_routes.py` | `e2e/export_and_share.spec.ts` |
| **NFR-1** | Canvas FPS $\ge 60$ fps | `frontend/src/editor/canvas/EditorCanvas.tsx` | `e2e/editor.spec.ts` |
| **NFR-2** | Streaming Latency $< 500$ ms | `app/services/llm_client.py` | `scripts/benchmark_streaming.py` (208.5 ms) |
| **NFR-3** | Offline First Guarantee | `frontend/src/editor/store/persistence.ts` | `e2e/export_and_share.spec.ts` |
| **NFR-4** | WCAG AA Contrast ($\ge 4.5:1$) | `frontend/src/themes/themeDefinitions.ts` | `scripts/check_theme_contrast.py` (10/10 pass) |
| **NFR-5** | Strict Sandboxing & CSP | `frontend/src/rendering/blocks/HtmlBlockRenderer.tsx` | `e2e/dynamic_engine.spec.ts` |
| **NFR-6** | Atomic Ops & Undo Engine | `frontend/src/editor/store/documentStore.ts` | `frontend/src/editor/store/__tests__/opsEngine.test.ts` |
| **NFR-7** | Responsive Editor Layout | `frontend/src/editor/EditorShell.tsx` | `e2e/editor.spec.ts` (1440px, 1280px, 390px) |

---

## 9. License

FLUXA is open-source software licensed under the MIT License.
#   F L U X A  
 