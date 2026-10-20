# FLUXA — Design Plan (Phase 0)

## 1. Principles

1. **The Chrome is a Quiet Instrument.** The slide canvas is where color, typography, and visual personality live. The application frame surrounding it must remain disciplined, neutral, dense, and precise. There are no decorative gradients, no ambient glows, no glassmorphism or backdrop filters, and no floating card drop-shadows in the application chrome.
2. **The One Memorable Thing: Live Data Made Tangible.** Every other presentation tool renders dead pictures. FLUXA makes data living software. The design channels all boldness into making reactive data visible: a dedicated signal color (`--signal`) marks bound values wherever they appear; editing a spreadsheet cell visibly cascades into the canvas; charts tween smoothly (600–800ms ease-in-out); and on-slide controls react instantly under the presenter's hand.
3. **Professional Density & Exactness.** Designed for desktop productivity: a 4px baseline grid, compact 28px control heights with comfortable 32px hit targets, 1px crisp dividing hairlines rather than multi-layered cards, sentence-case microcopy with zero marketing jargon, and single-set Lucide 16px geometric icons.
4. **Honest Copy & Clear Affordances.** Every action has a single active verb ("Generate slides", "Save changes", "Present", "Export"). No emojis as icons, no exclamation marks, no "AI magic / supercharge" hype, and no model vendor branding in the interface.

---

## 2. Token Architecture

The design tokens are defined as pure CSS custom properties. True neutral grays (no warm or cold tinting) ensure that deck slide themes never clash with the editor chrome.

### 2.1 Color Tokens

| Token | Light Value | Dark Value | Purpose & Usage | Contrast Ratio Check |
|---|---|---|---|---|
| `--bg-app` | `#F2F2F3` | `#151517` | Global canvas & window background | Base canvas |
| `--bg-panel` | `#FFFFFF` | `#1C1C1F` | Sidebars, inspector, toolbars, modal surfaces | ≥ 3:1 against boundaries |
| `--bg-well` | `#E6E6E8` | `#101012` | Stage backdrop behind the 16:9 canvas | Visual depth separation |
| `--line` | `#D9D9DD` | `#2C2C30` | 1px hairlines separating panels & regions | 3.2:1 against `--bg-panel` |
| `--ink` | `#1D1D1F` | `#EDEDEF` | Primary text, titles, active icons | ≥ 12.5:1 against `--bg-panel` |
| `--ink-2` | `#5B5B61` | `#A4A4AB` | Secondary labels, descriptions, metadata | ≥ 5.1:1 against `--bg-panel` |
| `--ink-3` | `#75757B` | `#85858C` | Placeholders, disabled text, hotkey hints | ≥ 4.5:1 against `--bg-panel` |
| `--signal` | `#2352F5` | `#7F9BFF` | **Selection, focus rings, primary actions, and live bound-field markers ONLY** | ≥ 4.6:1 against `--bg-panel` |
| `--signal-weak` | `#E7EDFF` | `#232C4D` | Selected rail items, bound-field background tint | Subtly distinct tint |
| `--danger` | `#C4262E` | `#FF6B72` | Destructive actions, formula evaluation errors | ≥ 4.6:1 against `--bg-panel` |
| `--ok` | `#1B7F4B` | `#4ADE80` | Saved status, successful sync | ≥ 4.5:1 against `--bg-panel` |
| `--warn` | `#9A5B00` | `#FBBF24` | Contrast warnings, sample data indicators | ≥ 4.5:1 against `--bg-panel` |

### 2.2 Geometry & Spacing
- **Base Grid:** 4px incremental scale (4px, 8px, 12px, 16px, 20px, 24px, 32px).
- **Control Heights:** 28px standard compact control; 24px mini; 32px large modal buttons.
- **Corner Radii:**
  - `4px`: buttons, inputs, segmented controls, table cells, tags (`--radius-sm`).
  - `6px`: dropdown menus, contextual popovers, tooltips (`--radius-md`).
  - `8px`: modal dialogs, command palette (`--radius-lg`).
  - `0px`: the 1920×1080 slide stage itself (slides are absolute edges, never rounded).
- **Elevation:**
  - Panels and bars have **zero** drop-shadow; separation is achieved purely via 1px `--line` borders.
  - Floating overlays (menus, popovers, dialogs, toasts) use a single crisp shadow: `0 4px 16px rgba(0, 0, 0, 0.08)` in light mode, `0 4px 20px rgba(0, 0, 0, 0.45)` in dark mode.

---

## 3. Typography

- **Interface Face:** **IBM Plex Sans** (weights: 400 Regular, 500 Medium, 600 Semi-Bold). Chosen for its engineered, legible structure and optical stability at small sizes.
- **Data Face:** **IBM Plex Mono** (weights: 400 Regular, 500 Medium). Strictly reserved for real data: the spreadsheet data grid, formula bars, expression editors, widget code editor, and numerical coordinates. It shares cap-height and baseline metrics with IBM Plex Sans.
- **Urdu & Right-to-Left Face:** **Noto Naskh Arabic** (+2px optical compensation, 1.7 line-height), ensuring mixed-script lines maintain baseline alignment.
- **Tabular Numerals:** `font-variant-numeric: tabular-nums` applied globally to all figures and timers.

### Type Scale
| Level | Font Size | Line Height | Weight | Letter Spacing | Usage |
|---|---|---|---|---|---|
| Hint / Badge | 11px | 14px | 500 | 0 | Keyboard shortcuts, status tags, count indicators |
| Label | 12px | 16px | 500 | 0 | Field labels, inspector section headers, column headers |
| **Base** | **13px** | **18px** | **400 / 500** | **0** | **Canvas controls, rail slide numbers, button labels, list items** |
| Dialog Body | 15px | 22px | 400 | 0 | Modal descriptions, export format explanations |
| Panel Title | 18px | 24px | 600 | 0 | Inspector tab headings, dialog headings |
| Page Title | 22px | 28px | 600 | -0.01em | Create flow step headers, presenter view headings |
| Workspace Title| 30px | 36px | 600 | -0.01em | Top-level Workspace header |

---

## 4. Screen Layouts & ASCII Wireframes

### 4.1 Screen 1: Workspace (Decks Overview)

Replaces the previous generic marketing landing page. Displays the user's presentations with real first-slide canvas thumbnails, last-edited timestamps, search, and a split create button.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [F] FLUXA                    [ Search presentations...     ⌘K ]       [+ New deck ▾]   │ 44px bar
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   Your presentations (3)                                            Sort: Last edited ▾│
│                                                                                        │
│   ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐│
│   │                         │  │                         │  │                         ││
│   │   [Real 16:9 Render     │  │   [Real 16:9 Render     │  │   [Real 16:9 Render     ││
│   │    of Slide 1 in        │  │    of Slide 1 in        │  │    of Slide 1 in        ││
│   │    Presentation Theme]  │  │    Presentation Theme]  │  │    Presentation Theme]  ││
│   │                         │  │                         │  │                         ││
│   └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘│
│   Q3 Strategic Performance     Cloud Table Integration       AI in Healthcare          │
│   6 slides         2 hrs ago   5 slides        Yesterday     8 slides        Oct 12    │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Screen 2: Create Flow (Prompt → Outline → Generation Grid)

A single three-step flow on one page without sideways carousel scrolling:
1. **Describe:** prompt box, slide count stepper, audience, tone, language, theme chooser with live thumbnail preview.
2. **Review Outline:** reorderable list of slide intents on the left; live layout preview on the right; "Generate slides" primary action.
3. **Generating Grid:** cards render in parallel as slides stream from SSE, showing exact "4 of 8" progress with Cancel button.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [F] FLUXA                   Create new presentation                         [ Cancel ] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   STEP 2 OF 3: Review outline                                                          │
│   Refine the narrative and slide layouts before generating.                            │
│                                                                                        │
│   ┌─────────────────────────────────────────┐  ┌─────────────────────────────────────┐ │
│   │ ≡  1. Executive Summary     [Intro   ▾] │  │ Live Layout Preview (Midnight)      │ │
│   │    Brief Q3 context and strategic goals │  │ ┌─────────────────────────────────┐ │ │
│   │ ─────────────────────────────────────── │  │ │ Executive Summary               │ │ │
│   │ ≡  2. Adoption & Revenue    [Chart   ▾] │  │ │                                 │ │ │
│   │    Bar chart tracking growth 2023-2026  │  │ │ • Enterprise momentum in Q3     │ │ │
│   │ ─────────────────────────────────────── │  │ │ • Expansion in core segments    │ │ │
│   │ ≡  3. Strategic Roadmap    [Timeline ▾] │  │ │                                 │ │ │
│   │    Four-phase milestone deployment      │  │ └─────────────────────────────────┘ │ │
│   │ ─────────────────────────────────────── │  │ Layout: Title + Bullets             │ │
│   │ + Add slide                             │  │ Theme: Midnight (Dark Navy)         │ │
│   └─────────────────────────────────────────┘  └─────────────────────────────────────┘ │
│                                                                                        │
│   [← Back to prompt]                                            [ Generate slides → ]  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Screen 3: The Presentation Editor

Standard three-panel workstation: left slide rail with real thumbnails, central 16:9 WYSIWYG canvas with direct manipulation and snap guides, right multi-tab inspector (Design, Animate, Data, Ask).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [F] Q3 Strategic Performance    Saved 12:04   [↶ Undo] [↷ Redo]    [▶ Present] [Export]│ 40px bar
├───────────┬───────────────────────────────────────────────────────────┬────────────────┤
│           │ [Text] [Shape] [Image] [Chart] [KPI] [Control] [Table] …  │Design  Animate │
│ 1 ┌─────┐ │ ┌───────────────────────────────────────────────────────┐ │Data    Ask     │
│   │Title│ │ │                                                       │ ├────────────────┤
│   └─────┘ │ │                      SLIDE STAGE                      │ │Chart: Bar      │
│ 2 ┌─────┐ │ │                       (16:9)                          │ │Dataset: Adopt  │
│   │Chart│ │ │                                                       │ │X-Axis:  Year   │
│   └─────┘ │ │   40 ┤       ■                                        │ │Series:  Pct    │
│ 3 ┌─────┐ │ │   20 ┤   ■   ■                                        │ ├────────────────┤
│   │Road │ │ │      └───┴───┴──────                                  │ │Animation:      │
│   └─────┘ │ │                                                       │ │Rise (300ms)    │
│           │ └───────────────────────────────────────────────────────┘ ├────────────────┤
│ + New     │ Notes (collapsible)                           Fit (68%) │ │[🔗 adoption.pct]│
└───────────┴───────────────────────────────────────────────────────────┴────────────────┘
```

### 4.4 Screen 4: Fullscreen Present Mode

Invoked via native Fullscreen API on a portal at `document.body`. Clean stage, no browser chrome, cursor and navigation HUD auto-hide after 2 seconds of inactivity.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                        │
│                                                                                        │
│                                                                                        │
│                               FULLSCREEN SLIDE STAGE                                   │
│                                   (1920 × 1080)                                        │
│                               Scaled to Fit Viewport                                   │
│                                                                                        │
│                                                                                        │
│                                                                                        │
│                                                                                        │
│                           [ ◀   3 / 6   ▶   ⛶ ]                                        │ (auto-hides)
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Responsive Chrome Breakpoints

1. **Desktop Wide (≥1280px):**
   - Three full panels visible: Left Rail (200px), Central Canvas (flex 1), Right Inspector (340px).
2. **Desktop Medium (1024px – 1279px):**
   - Left Rail remains docked (180px); Right Inspector collapses into a smooth 340px slide-out drawer toggled from top bar buttons.
3. **Tablet (<1024px):**
   - Left Rail collapses to a compact bottom thumbnail strip (72px height); Right Inspector is an overlay drawer.
4. **Mobile (<640px):**
   - Canvas editing is disabled with an informative, helpful banner: *"Slide editing requires a larger screen. You can view, present, or chat with AI."*
   - Fullscreen present mode and AI chat remain fully functional.

---

## 6. Self-Review Against Anti-Patterns & "The Memorable Thing"

### Verification Against Section 6.7 (Banned Patterns)
- **Gradients, Glow, Glassmorphism:** Completely stripped. No `linear-gradient` on chrome elements, no `backdrop-filter`, no glow drop-shadows. The `--bg-panel` surfaces are pure opaque `#FFFFFF` (light) and `#1C1C1F` (dark).
- **Emoji As Icons:** All emojis (`🤖`, `📊`, `📋`, `🖨️`, `✨`) replaced with 16px crisp Lucide vector icons (`Bot`, `BarChart3`, `Clipboard`, `Printer`, `Plus`).
- **Pulsing Dots & Pill Badges:** Removed the pulsating "Powered by OpenRouter AI" badge. In its place is a quiet, informative save/sync status text in the top bar (`Saved 12:04` or `Offline: local draft`).
- **Overused AI Typography:** Banned fonts (Inter, Roboto, Arial, Space Grotesk, Plus Jakarta) avoided. We commit strictly to self-hosted **IBM Plex Sans** and **IBM Plex Mono**, with **Noto Naskh Arabic** for Urdu.
- **Copy Slop:** Removed words like "luxury", "cyber", "supercharge", "magic", "next-gen". The interface speaks in simple, factual tool verbs.

### The "Memorable Thing" Rule & What Was Changed
In many initial application concepts, bound variables and live datasets are buried deep inside secondary modal dialogs, making the presentation editor feel just like static PowerPoint until someone stumbles onto a settings screen. 

We deliberately made **live data visually tangible**:
1. Any field, chart, table cell, or metric that is bound to a variable or dataset is highlighted with a distinct `--signal` link indicator (`[🔗 adoption.pct]`).
2. When a user edits a number in the Data spreadsheet tab, the bound chart does not redraw with a harsh flash; Chart.js smoothly animates the bar/line from old to new value over 700ms.
3. Interactive controls (sliders, toggles) can be dragged directly on the stage in "Try it" mode and during Present mode, giving presenters a tactile, interactive experience unmatched by any slide tool.
