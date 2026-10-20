# FLUXA — Presentation Specification Reference (v1)

## 1. Overview & Guiding Concept

In FLUXA, **slides are live software, not pictures**. Rather than rendering static text and baked graphics, a presentation is represented as a structured JSON document holding reactive datasets, interactive variables, and componentized blocks positioned on a fixed **1920×1080 stage**.

The specification is enforced strictly on the frontend via **Zod** (`shared/spec.ts`) and on the backend via **Pydantic v2** (`app/spec/models.py`), both governed by `shared/spec.schema.json`.

---

## 2. Core Specification Schema

### 2.1 The Deck (`DeckModel`)
The root document representing an entire presentation:

```json
{
  "schemaVersion": 1,
  "title": "Quarterly Performance Review",
  "themeId": "midnight",
  "themeOverrides": {},
  "datasets": {},
  "variables": {},
  "settings": {
    "transition": { "effect": "fade", "duration": 300 },
    "loop": false
  }
}
```

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1` | Schema version identifier for migrations (NFR-6) |
| `title` | `string` | Human-readable title of the presentation |
| `themeId` | `string` | Base theme identifier |
| `themeOverrides` | `ThemeTokens?` | Optional per-deck font and color overrides |
| `datasets` | `Record<string, Dataset>` | Deck-level tabular datasets |
| `variables` | `Record<string, Variable>` | Reactive state variables |
| `settings` | `DeckSettings` | Default transition and slideshow playback settings |

### 2.2 The Slide (`SlideModel`)
A single slide inside a deck:

```json
{
  "id": "slide-01",
  "order": 0,
  "layout": "chart-text",
  "background": { "color": "#0B1120" },
  "notes": "Speaker notes for executive briefing.",
  "hidden": false,
  "transition": { "effect": "fade", "duration": 300 },
  "blocks": []
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique slide identifier |
| `order` | `number` | 0-indexed slide sequence order |
| `layout` | `LayoutId?` | Layout identifier (`title`, `chart-text`, `bullets`, etc.) |
| `background` | `Fill?` | Slide canvas fill color and opacity |
| `notes` | `string` | Markdown speaker notes |
| `hidden` | `boolean?` | If true, skipped during presentation playback |
| `transition` | `Transition?` | Per-slide transition override |
| `blocks` | `Block[]` | Positioned elements; array order defines z-order |

### 2.3 Blocks & Geometry
Every block lives in stage pixels on a **1920×1080 canvas**:
- `x`: horizontal position (0–1920)
- `y`: vertical position (0–1080)
- `w`: width in pixels (> 0)
- `h`: height in pixels (> 0)
- `rotation`: degrees (-360 to 360)
- `role`: layout slot role (`title`, `subtitle`, `body`, `chart`, `kpi`, `media`, `aside`, `footer`)

### Supported Block Types:
1. `text`: ProseMirror/Tiptap document + `TextStyle`
2. `shape`: `rect`, `ellipse`, `line`, `arrow`, `triangle`
3. `image`: `assetId` referencing `/api/assets/<id>`
4. `icon`: Lucide icon name + color
5. `chart`: Chart.js reactive chart (`bar`, `column`, `line`, `area`, `pie`, `donut`, `scatter`, `radar`, `stacked`)
6. `kpi`: Large metric display with label, delta, and count-up animation
7. `table`: Tabular data grid connected to a dataset
8. `steps`: Horizontal or vertical sequential process flow
9. `timeline`: Milestone sequence with dates
10. `comparison`: Multi-column feature or "before vs. after" comparison
11. `quote`: Featured quote with attribution
12. `control`: On-slide interactive controls (`slider`, `toggle`, `select`, `segmented`, `button`)
13. `embed`: Sandboxed video or external URL
14. `html`: Sandboxed HTML/CSS/JS widget running inside a restricted iframe bridge
15. `tabs`: Multi-tab sub-canvas block

---

## 3. Worked Examples

### 3.1 Worked Example 1: The *55 → 74* Live Tween
A deck contains a dataset named `adoption`. A bar chart and a KPI block are bound to this dataset.

```json
{
  "datasets": {
    "adoption": {
      "id": "adoption",
      "name": "Platform Adoption",
      "source": "user",
      "columns": [
        { "key": "year", "label": "Year", "type": "text" },
        { "key": "pct", "label": "Adoption %", "type": "number" }
      ],
      "rows": [
        { "year": "2023", "pct": 28 },
        { "year": "2024", "pct": 42 },
        { "year": "2025", "pct": 55 }
      ]
    }
  }
}
```

**Bound Chart Block:**
```json
{
  "id": "block-chart-1",
  "type": "chart",
  "x": 100, "y": 200, "w": 1000, "h": 600,
  "kind": "bar",
  "dataset": "adoption",
  "x": "year",
  "series": [{ "field": "pct", "label": "Adoption", "color": "#2352F5" }],
  "options": { "unit": "%", "animateMs": 700 }
}
```

**Bound KPI Block:**
```json
{
  "id": "block-kpi-1",
  "type": "kpi",
  "x": 1200, "y": 250, "w": 500, "h": 220,
  "label": "Latest Adoption Rate",
  "value": { "$bind": "last(adoption.pct)" },
  "format": { "suffix": "%" },
  "countUp": true
}
```

**Live Behavior:**
When the presenter edits the 2025 row cell from `55` to `74`:
1. The reactive engine registers a state mutation on `adoption.rows[2].pct`.
2. The Chart.js bar animates smoothly from 55 to 74 over 700ms.
3. The KPI expression `last(adoption.pct)` re-evaluates to `74`.
4. The KPI number counts up smoothly from 55 to 74.

---

### 3.2 Worked Example 2: The *What-If* Growth Slider
A deck contains a variable `growth` controlled by an on-slide slider, driving a computed revenue forecast.

```json
{
  "variables": {
    "growth": {
      "id": "growth",
      "label": "Annual Growth Rate",
      "type": "number",
      "value": 12,
      "min": 0,
      "max": 40,
      "step": 1,
      "scope": "deck"
    }
  },
  "datasets": {
    "forecast": {
      "id": "forecast",
      "name": "Revenue Forecast",
      "source": "user",
      "columns": [
        { "key": "year", "label": "Year", "type": "text" },
        { "key": "base", "label": "Base Revenue", "type": "number" },
        { "key": "revenue", "label": "Forecasted Revenue", "type": "number", "expr": "base * pow(1 + growth / 100, _i)" }
      ],
      "rows": [
        { "year": "2025", "base": 100 },
        { "year": "2026", "base": 100 },
        { "year": "2027", "base": 100 },
        { "year": "2028", "base": 100 }
      ]
    }
  }
}
```

**On-Slide Control Block:**
```json
{
  "id": "block-ctrl-1",
  "type": "control",
  "x": 100, "y": 850, "w": 600, "h": 80,
  "control": "slider",
  "variable": "growth",
  "label": "Projected Growth (%)",
  "min": 0,
  "max": 40,
  "step": 1
}
```

**Live Behavior:**
In present mode or editor "Try-It" mode:
1. Dragging the slider from 12% to 25% updates variable `growth = 25`.
2. The dataset engine recomputes column `revenue` for each row using `_i` (index).
3. The revenue forecast chart recalculates and tweens to the higher trajectory.
4. The KPI displaying `round(last(forecast.revenue))` animates live.
