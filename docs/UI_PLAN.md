# UI Plan (Part A + Brand section chrome)

Status: **planning, awaiting approval**. No code has been changed.

## 0. Decisions taken for this plan

| Decision | Choice | Why |
|---|---|---|
| Landing page (A1) | **Out of scope. Not touched.** | User instruction: "dont change the landing page". `BrandLandingPage.tsx`, `landing.css`, `robot.png` stay byte-identical. |
| "Outline generation page" | `/create` (steps 2 and 3: review outline, generating) is the restyled page. The `/workspace` pipeline modal reuses the same generating components so both flows look the same. | `/create` is the only page with an editable outline. `/workspace` is where landing CTAs land, so it must match visually, but its data flow stays as is. |
| Reference screenshot | Received 2026-11-21. Style only, no branding or photo copied. | See §1a. |
| Chart dependency | Reuse existing `chart.js` / `react-chartjs-2`. No new chart lib. | Already in the bundle. |
| Drag and drop | Native HTML5 DnD + keyboard reorder (Alt+↑/↓). No new dependency. | The current outline uses up/down buttons only; the editor rail already uses native DnD (`SlideRail.tsx`). |
| Part A data flow | No backend, route or API change in Part A. Pause/Cancel use the existing `AbortController`. True server-side cost cancellation comes with the AI gateway in Phase 0 (see PERFORMANCE.md §D2). | Part A is UI-only by requirement. |

## 1. Existing setup to reuse

- Tokens: `frontend/src/ui/tokens.css` (light + `[data-theme="dark"]`). Chrome radii today are 4 to 8px. The new look gets a **scoped token layer** (`.fx-copilot` scope) so the editor and other pages don't change.
- Components: `ui/Button`, `IconButton`, `Select`, `Menu`, `Popover`, `Tooltip`, `Toast`, `Dialog`, `Tabs`.
- Existing copilot styling: `editor/copilot/copilot.css` + `ChatInput.tsx` (pill input, send button). The refine bar should share this, not duplicate it.
- Streaming: `runtime/streamClient.ts` (`postStream` with abort signal).

## 1a. What the reference shows (style notes)

- **Generating screen (black):** near-black background with 4 concentric soft rings (low-opacity white, outer rings fainter) around a dark circular button holding a white waveform glyph. A circular back button top-left, centered title, kebab menu top-right. At the bottom: a white "Pause" pill and a light teal-to-cyan gradient "Cancel" pill side by side, then a white rounded card with streaming text and a small square copy button.
- **Home screen (blue):** saturated royal blue (#1f5af6-ish) fading darker toward the bottom. Search circle top-left, bell with a small count badge, round avatar. Title + muted subtitle. White pill-shaped feature cards with a dark circular icon. A "Popular Prompt / See all" row with a large rounded image card, an arrow button in its top-right corner and a translucent caption bubble. Floating white bottom nav with a teal "Home" pill (replaced by the optional desktop sidebar).
- **Result screen (navy):** dark navy gradient. Back circle + title, bell + avatar. A translucent "Creative ▾" dropdown chip and a teal circular action button. A white card "Price analysis" with 👍 and copy icon buttons, a layered blue area chart with a value tooltip, then "Learn more" with numbered dark circles + domain pills. Below: a user prompt row with avatar, and a white pill input "Type your question..." with a teal circular left icon and a waveform icon on the right.
- **Tokens taken from it:** card radius about 24px, pill radius 999px, card shadow soft and large-blur, primary gradient teal (#5eead4) to cyan/blue, icon buttons 36 to 40px circles with translucent white fill on dark backgrounds.

## 1b. Checklist for Part A (found 2026-11-21, settles how the page is written)

Reference: the request's design (screenshot, level 3) for shape. The editor copilot (`editor/copilot/*`) is the nearest built page of the same kind (chat-style AI surface) for how it is written.

| # | Position | Decision | What settled it |
|---|---|---|---|
| 1 | Page holder / styling | One feature stylesheet (`components/outline/outline.css`) with **scoped** custom properties under `.fx-outline`, class names prefixed `fx-`. | Copilot (8 files) and landing use a feature CSS file with scoped vars; global `tokens.css` stays untouched so the editor does not change. |
| 2 | Refine input | **Reuse `editor/copilot/ChatInput`** (pill input, mic via Web Speech, send/stop) by import, restyled through scoped selectors. No second input component. | Shared piece exists with the exact behavior (level 4). |
| 3 | Prompt field + example prompts | Keep `components/PromptInput.jsx` unchanged; restyle its `.field` / `.chip` classes inside the scope. Its examples become the "Popular prompts" row. | Only user is this page; tests rely on its labels. |
| 4 | Buttons | Native `<button>` with `fx-pill` / `fx-icon-btn` classes. `ui/Button` is 28px, 4px radius and token-colored, so it can't express the pill/gradient look without overriding every prop. | Design (level 3) needs pills; `ui/Button` usage elsewhere unchanged. |
| 5 | Focus | `:focus-visible` uses the global `--focus-ring` pattern with a scoped ring color that is visible on blue. | `tokens.css:111` convention. |
| 6 | Errors | Keep the existing `role="alert"` banner (tests assert it), restyled as a rounded card. | Existing behavior + tests. |
| 7 | Loading (outline request) | The **generating state** (pulse orb, Pause, Cancel, status card) replaces today's silent `busy` wait. Cancel aborts the fetch (`AbortController`). Pause holds the arrived outline until Resume. No artificial delay. | Design + UI-only constraint. |
| 8 | Step 3 (slides) | Same generating panel + the existing arrival grid of real `SlideStage` thumbnails, as white cards. Pause defers opening the editor when done. Cancel unchanged. | Existing flow kept. |
| 9 | Outline cards | One card per item: number, editable title, purpose as the bullet, layout select, visual tag. Action row: copy, regenerate (existing outline endpoint, one item), 👍/👎 (local state, `aria-pressed`). Drag handle + Alt+↑/↓, delete, add slide. | Request A2.2; reorder/delete/add exist today. |
| 10 | Layout preview | Kept (existing feature) as a card in the right column above refine. | "All existing functionality must keep working". |
| 11 | Sources | Numbered pills from `outline.research_dossier.citations` when present; hidden otherwise. | Request A2.5. |
| 12 | Stat card | **Not built**: outline items carry no numeric data today, so there is nothing to chart. | Request A2.7 ("only where…"). |
| 13 | Header chips | Tone chip = the existing tone select. Brand chip shows "No brand" (single option until Part C). Bell with badge hidden at 0. Avatar = initials placeholder. | Request A2 header; no notification or user system exists yet. |
| 14 | Motion | Pulse rings + card fade-in. All of it off under `prefers-reduced-motion`. | Request + 6 existing reduced-motion rules. |

Conflict noted: AGENTS.md §6.2/6.7 bans gradients and glow in the chrome; the user's A2 request (newer, explicit) asks for both on this page. Followed the request, scoped to the outline page only.

## 2. Files

### New
| File | Purpose |
|---|---|
| `frontend/src/ui/copilot-tokens.css` | Scoped tokens: `--cp-bg-gradient` (#1e4fd8 to #0b1a4a), `--cp-bg-dark` (#07080c), `--cp-card` (#fff), `--cp-radius-card: 24px`, `--cp-radius-pill: 999px`, `--cp-primary-gradient` (#14b8a6 to #2563eb), glow and shadow values. Light/dark variants. |
| `frontend/src/components/outline/OutlineHeader.tsx` | Circular back button, title, tone chip (dropdown), **brand selector chip** (Part C, shows "No brand" until brands exist), bell with count badge, avatar. |
| `frontend/src/components/outline/PulseOrb.tsx` | Concentric pulse rings + central sparkle/waveform button. CSS-only animation, static under `prefers-reduced-motion`. |
| `frontend/src/components/outline/GeneratingPanel.tsx` | PulseOrb + Pause (white pill) / Cancel (gradient pill) + streaming text card with copy button. |
| `frontend/src/components/outline/OutlineCard.tsx` | One slide: title, bullets, editable inline, action row (copy, regenerate, 👍, 👎), drag handle, keyboard reorder. |
| `frontend/src/components/outline/OutlineList.tsx` | Ordered list with DnD and fade-in. Virtualized past 40 cards (simple windowing, no new dependency). |
| `frontend/src/components/outline/RefinePanel.tsx` | Right column: quick-action chips, refine input, sources. |
| `frontend/src/components/outline/RefineInput.tsx` | Pill input "Refine your outline...", mic icon (Web Speech, hidden if unsupported), send. Pinned to panel bottom on desktop, viewport bottom below 1024px. |
| `frontend/src/components/outline/SourceChips.tsx` | "Learn more" + numbered pill chips from `research_dossier.citations`. |
| `frontend/src/components/outline/SuggestedTopics.tsx` | "Suggested topics / See all" gradient cards with arrow button. Shown only on the empty or result state of `/create`. |
| `frontend/src/components/outline/StatCard.tsx` | White card + Chart.js line/bar, rendered only when an outline item has numeric `data`. |
| `frontend/src/components/outline/outline.css` | Layout, breakpoints, animations. |
| `frontend/src/components/outline/__tests__/*.test.tsx` | Vitest: render states, keyboard reorder, chip triggers refine, aria labels. |

### Changed
| File | Change |
|---|---|
| `frontend/src/pages/CreatePresentation.jsx` | Steps 2 and 3 render the new components. State, handlers and API calls stay. Step 1 gets the same chrome (header, gradient). |
| `frontend/src/pages/WorkspacePage.tsx` | The pipeline modal (around line 815) swaps its visual for `GeneratingPanel`. Handlers stay. |
| `frontend/src/test/CreatePresentation.test.jsx` | Update selectors only where markup changed. Behavior assertions stay. |

Not touched: landing page files, editor, renderer, backend.

## 3. Outline page: before → after

**Before:** a 960px single column on the light app background. The step breadcrumb reads "1. Describe / 2. Review outline / 3. Generating". Step 2 is a list of plain rows with up/down/delete icons and a side editor for the selected item. Step 3 is a progress bar with "Slide n of m" and an outline Cancel button. The outline is **not streamed** (one JSON response).

**After (desktop ≥1280px):**
```
┌ header: (←) Title  [Tone ▾] [Brand: No brand ▾]              🔔3  (A) ┐
│ max-width 1320, deep-blue gradient bg, soft glows                     │
│ ┌──────── left 2fr ────────────────┐ ┌──── right 1fr ─────────────┐   │
│ │ GENERATING: pulse orb            │ │ Refine with AI             │   │
│ │   [Pause] [Cancel]               │ │ chips: shorter · conclusion│   │
│ │   ┌ streaming text card   ⧉ ┐    │ │   · more technical · examples│ │
│ │ RESULT: outline cards (DnD)      │ │ Learn more: ①src ②src      │   │
│ │   title · bullets · ⧉ ↻ 👍 👎     │ │ ┌ Refine your outline… 🎙 ➤┐│   │
│ │ Suggested topics      See all →  │ │ └──────────────────────────┘│   │
│ │ [ sticky: Generate slides ▶ ]    │ └─────────────────────────────┘   │
│ └──────────────────────────────────┘                                   │
└────────────────────────────────────────────────────────────────────────┘
```
- 1024 to 1279: same two columns at 3fr/2fr.
- Below 1024 (768, 390): one column. Outline first, refine panel below, refine input fixed to the viewport bottom with safe-area padding. "Generate slides" moves into the header as a compact pill.
- Dark mode: near-black `#07080c` background with blue glow, same cards.
- Streaming: with the current non-streamed endpoint, the card shows a typed-reveal of the returned outline as an honest "arriving" animation, not fake latency: text is revealed in about 300ms. Real token streaming arrives when the gateway adds `/generate/outline?stream=1` (Phase 0). The UI is built for the real stream from day one.
- Pause: pauses rendering of incoming tokens and buffers them. Once the gateway exists it also stops the server stream. Cancel aborts the request.
- Quick chips call the existing refine path (`/generate/outline` with an instruction appended to the topic). In Phase 0 they move to a dedicated `refine` gateway call.
- Keyboard: Tab through cards, Enter to edit, Esc to stop editing, Alt+↑/↓ to reorder, Ctrl+Enter for Generate slides, `/` to focus refine input.
- A11y: aria-labels on every icon button, visible 2px focus ring (white on blue), contrast ≥4.5:1 checked with `scripts/check_ui_contrast.py`, `aria-live="polite"` on the streaming card.
- Loading, empty and error states: skeleton cards, an empty state with suggested topics, and an error card with Retry. Same radius and spacing as the rest.
- Test widths: 1920, 1440, 1024, 768, 390. Playwright screenshots saved to `docs/after-partA/`.

## 4. Brand section screens (Part C chrome)

Same restyled chrome (gradient header, white rounded cards). Slide previews inside use the brand's own tokens.

| Route | Screen |
|---|---|
| `/brand` | Brand switcher (multi-brand), profile cards with status (draft / active / archived) |
| `/brand/new` | Ingestion wizard: 1 upload (PPTX, PDF, logos, fonts, templates), 2 website URL, 3 processing (job progress), 4 review |
| `/brand/:id/review` | Extracted profile review: colors, fonts, logo rules, layouts, headers/footers, charts, imagery, tone. Each rule shows a confidence badge, edit, accept/reject, and a source link (file + page). |
| `/brand/:id/locks` | Lock settings (toggle per element, required disclaimer text, approved layouts per slide purpose) |
| `/brand/:id/departments` | Department profiles: inherited value vs override, with override allowed only where the corporate lock permits |
| `/brand/:id/examples` | Approved-examples manager: approved / outdated / excluded |
| `/brand/:id/history` | Version history, diff view, rollback |
| Editor right rail | **Compliance** tab: score, categories, recommendations, "Fix all" with before/after + undo |
| Editor canvas | Lock icon on locked blocks with a tooltip explaining why ("Logo position locked by Brand: Acme. Ask a brand manager.") |

A slim left sidebar (Home, Presentations, Brand) is added **only** on `/create`, `/workspace` and `/brand/*` once the Brand section exists, because today's app has no global nav to replace.

## 5. Part A2 result (2026-11-21)

Built as planned, with these differences from §2:
- `PulseOrb` lives inside `GeneratingPanel.tsx`. `SuggestedTopics`, `SourceChips`, `RefineInput` and `StatCard` were not created as separate files: the example prompts come from the existing `PromptInput` (restyled), sources and the input live in `RefinePanel.tsx` (the input is the reused `editor/copilot/ChatInput`), and the stat card was skipped (no numeric outline data, see checklist #12).
- Virtualization of outline cards was not added: the page caps an outline at 15 slides.
- `ChatInput` gained an optional `ariaLabel` prop (default unchanged), so the refine field is announced as "Refine your outline".
- `WorkspacePage` pipeline modal: pulse orb + a Cancel pill. Cancel aborts the stream, and the stream's error path and catch now return early when aborted. Before this, an aborted stream would start the synchronous fallback generation.
- Tone moved from the describe form into the header chip (one control, visible at every width).

Verified in the browser (Vite dev, real backend):
- 1920, 1440, 1024, 768, 390: no horizontal overflow (`scrollWidth - clientWidth = 0`). Two columns at ≥1024, one column below with the refine input fixed to the viewport bottom.
- Drafting state: orb + Pause/Cancel + status card; Pause held the arrived outline, Resume showed it.
- Result state: cards, Alt+↓ reorder, sticky Generate slides, refine chip sends a request, Stop aborts it ("Refinement stopped.").
- Dark mode (`data-theme="dark"`): near-black variant.
- Workspace modal: orb renders; Cancel closes it with no fallback request.
- No console errors after reload.

Not verified: step 3 (slide generation) end to end in the browser. It needs a full generation, which runs on the broken free-model path today (D0 finding). Its markup reuses the same components and the existing stream handlers.

Tests: 5 new component tests pass (`components/outline/__tests__/outline.test.tsx`). The full vitest run has 8 failures, all outside this change: `App.test.jsx` expects the workspace at `/` (now the landing page), `EditorShell.test.tsx` targets the editor, and the create-flow test reaches the editor but can't find a title field in its newer view. `tsc` clean. ESLint: no errors in changed files; one existing `no-empty` error in `WorkspacePage.tsx` (an empty `catch {}` that was already there).

## 6. Part A v2: redesign after review (2026-11-21)

Your feedback on v1: "just adding colours", "the research pipeline part is same too", and the landing page doesn't scroll. You picked **direction C (document + live preview)** from three wireframes. v1's card components were deleted and replaced.

**Landing page (A1).** Same look and content. The hero used `vh` units inside an `overflow:hidden` frame, so on short windows it was squeezed and clipped with no way to scroll. Now: `min-height: max(100vh, 720px)`, vh offsets go through `--u = max(1vh, 7.2px)`, the nav is fixed (sticky), scrolling is smooth (off under reduced motion), and horizontal overflow is clipped. Measured at 1440×900: the wordmark sits at 12vh and the robot is 88vh tall, same as before, and the page is exactly one screen. At 1366×620 the page now scrolls (720 px of content).

**Outline page (`/create`).**
- Sticky top bar: back, title, a Describe / Outline / Slides stepper (hidden below 1360 px), Tone, Brand and Theme chips, the **Generate slides** button, bell, avatar.
- Describe step: a "What are you presenting?" brief paper and a Settings column with a live theme preview.
- Outline step, left: an **editable outline document**. Big deck-title heading, meta pills, one row per slide (number, wrapping title, key-point text, layout and visual tags). Hover actions float over the row: copy, regenerate, 👍, 👎, delete. Drag handle. Keyboard: Enter adds a slide, ↑/↓ move between slides, Alt+↑/↓ reorder, Ctrl+Enter generates, "/" focuses refine. "Learn more" source pills sit at the bottom.
- Outline step, right (sticky): a **live preview** of the selected slide in the chosen theme, with prev/next and a **visual layout picker** (mini wireframes; this replaces the dropdown). Below it, "Refine with AI" with quick chips and the reused `ChatInput`. The preview spec is now valid; the old one used `box`/`props` and rendered junk.
- Drafting and generating: a **vertical timeline** (Brief, Drafting, Review / Outline approved, Slides, Open) with a clock, a live log in the active step, Pause/Resume and Cancel, a "Your brief" summary card, and slide thumbnails as they arrive.
- Below 1100 px: one column, outline first, the preview and refine below, the refine input pinned to the bottom of the screen.

**Workspace research pipeline popup.** Replaced the old stage list with the same timeline (Research, Outline, Slides, Open the deck). It shows source pills as citations arrive, the planned slide titles, a progress bar, an elapsed clock, and a live log fed by the stream events (including the backend's `[PROGRESS: …]` text). Cancel still aborts without the fallback generation.

**Files.** New: `components/outline/{TopBar,OutlineDoc,PreviewPane,PipelineTimeline}.tsx`, `previewSpec.ts`, rewritten `outline.css`, `__tests__/outline.test.tsx` (6 tests). Deleted: `OutlineHeader`, `GeneratingPanel`, `OutlineList`, `RefinePanel`. Changed: `pages/CreatePresentation.jsx`, `pages/WorkspacePage.tsx`, `pages/landing.css`.

**Verified in the browser.** No horizontal overflow at 1920, 1440, 1024, 768 and 390. Drafting timeline and live log; outline arrives as the document; layout picker updates the preview and the row tag; dark mode; workspace timeline with live log; Cancel closes it. Not verified end to end: slide generation (step 3), because generation still runs on the broken free-model path (D0).

**Checks.** `tsc` clean. Outline tests 6/6. Full vitest: the same 8 failures outside this change. ESLint: no errors in changed code (the existing empty `catch {}` in WorkspacePage remains).

> **Revision (2026-11-21):** the user asked for the first screen ("Describe" step of `/create`) to stay exactly as it was. Step 1 is restored to its original markup; the redesign applies only from the outline page onward (drafting timeline, outline document + live preview, generation timeline, workspace pipeline popup).
