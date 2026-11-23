# AI Brand Intelligence: Design

Status: **planning, awaiting approval**.

Promise: *one consistent visual identity across every presentation, regardless of who creates it.* The AI stays creative with layout and storytelling but cannot casually break brand rules.

## 1. Architecture, adapted to the actual stack

| Component | Suggested | **FLUXA choice** | Note |
|---|---|---|---|
| Document extraction | Python parsers | `pypdf` + `pdfplumber` (text, colors, fonts per page); PDF also sent to Claude as a `document` block | Avoids PyMuPDF (AGPL) |
| PPTX analysis | PPTX libs | `python-pptx`: masters, layouts, placeholders, theme XML (`a:clrScheme`, `a:fontScheme`), footer placeholders, chart XML | Deterministic. Gives high-confidence tokens. |
| Logo / visual recognition | CV | Claude Fable 5.2 vision on rendered pages + `Pillow` for dominant colors, bounding boxes and clear space | No separate CV service |
| Rule extraction | LLM + schemas | `claude-fable-5-2`, effort `high`, structured outputs (`output_config.format`) with the schema below | |
| Storage | PostgreSQL | **SQLite now** (WAL) with tables designed for a later Postgres move | **Disagree for now:** the app is single-instance SQLite today. Postgres is recommended before multi-tenant production. |
| Design system | Tokens + components | `BrandTokens` (superset of `ThemeTokens`) + brand layout recipes mapped onto the existing 15 `LayoutId`s | |
| Slide generation | Custom renderer | Existing `SlideStage` + `compiler.py` read `BrandTokens` | |
| Compliance | Rule engine + CV | Shared rule engine in TS (`shared/brand/rules.ts`) mirrored in Python, plus a vision check for subjective rules | |
| Fonts | Licensing controls | `fontTools` metadata (`fsType` embedding bits), license flag per font, fallback stack | |

## 2. Data model (new tables, all with `org_id`)

```
brands(id, org_id, name, slug, status[draft|active|archived], active_version_id, created_by, created_at)
brand_versions(id, brand_id, org_id, version INT, tokens_json, rules_json, locks_json,
               source_summary, status[draft|in_review|active|superseded], created_by, approved_by,
               approved_at, created_at)                      -- immutable once active
brand_sources(id, brand_id, org_id, kind[pptx|pdf|logo|font|url|template|doc], filename, mime,
              size, sha256, storage_path, scan_status, example_status[approved|outdated|excluded|null],
              job_id, created_at)
brand_extractions(id, brand_version_id, source_id, element, value_json, confidence REAL,
                  evidence_json, decision[pending|accepted|edited|rejected], decided_by, decided_at)
brand_fonts(id, brand_id, org_id, family, weight, style, asset_path, license[licensed|system|unlicensed|unknown],
            embeddable BOOL, fallback_stack)
brand_access(brand_id, team_id|user_id, permission[use|manage])
departments(id, org_id, brand_id, name, overrides_json, created_by)
brand_audit(id, org_id, brand_id, actor_id, action, before_json, after_json, created_at)
presentations += brand_id NULL, brand_version_id NULL, department_id NULL
```
Indexes: `(org_id, brand_id)` on every table; `brand_versions(brand_id, version)` unique; `brand_sources(sha256, org_id)` for dedup.

Decks without a `brand_id` render exactly as today (legacy-safe).

## 3. Design tokens JSON schema (`shared/brand/brand.schema.json`, versioned)

```jsonc
{
  "schemaVersion": 1,
  "colors": {
    "primary":   [{ "hex": "#0A3D91", "name": "Acme Blue", "confidence": 0.97 }],
    "secondary": [{ "hex": "#F2A900", "confidence": 0.9 }],
    "neutrals":  ["#FFFFFF", "#1D1D1F", "#6B7280"],
    "chart":     ["#0A3D91", "#F2A900", "..."],          // >= 6, maps to ThemeTokens.colors.chart
    "allowedPairs": [{ "fg": "#FFFFFF", "bg": "#0A3D91", "contrast": 9.1 }],
    "contrastWarnings": [{ "fg": "#F2A900", "bg": "#FFFFFF", "contrast": 1.9 }]   // warned, never auto-changed
  },
  "typography": {
    "heading": { "family": "Acme Sans", "weights": [700], "fontId": "…", "fallback": ["Inter", "Arial", "sans-serif"] },
    "body":    { "family": "Acme Sans", "weights": [400, 500], "fallback": ["Inter", "Arial", "sans-serif"] },
    "scale":   { "title": 72, "h1": 48, "body": 24, "caption": 16 }
  },
  "logo": {
    "variants": [{ "assetId": "…", "use": "light-bg" }, { "assetId": "…", "use": "dark-bg" }],
    "placement": { "anchor": "top-right", "offset": { "x": 64, "y": 48 }, "width": 180 },  // 1920x1080 space
    "minWidth": 120, "clearSpace": 0.5,           // fraction of logo height
    "forbid": ["recolor", "distort", "crop", "rotate", "effects"]
  },
  "header": { "enabled": false },
  "footer": { "enabled": true, "height": 56, "left": "{{confidentiality}}", "center": "", "right": "{{slideNumber}}",
              "style": { "fontSize": 14, "color": "#6B7280" } },
  "legal":  { "disclaimers": [{ "text": "© Acme Corp. Confidential.", "placement": "footer-left", "required": true }] },
  "layouts": {                                    // slide purpose -> approved recipe on an existing LayoutId
    "introduction": { "layoutId": "title", "recipe": { "background": "primary", "logo": "dark-bg" } },
    "financial":    { "layoutId": "chart-text", "chartStyle": "corporate" },
    "comparison":   { "layoutId": "two-column" },
    "history":      { "layoutId": "timeline" },
    "process":      { "layoutId": "timeline", "variant": "flow" },
    "conclusion":   { "layoutId": "section", "recipe": { "background": "primary" } }
  },
  "charts": { "corporate": { "kinds": ["bar", "line"], "gridlines": "horizontal", "legend": "bottom",
                              "labelFont": "body", "palette": "chart", "barRadius": 0 } },
  "imagery": { "style": "photography", "tone": "bright, people at work", "avoid": ["clip-art", "stock handshakes"] },
  "language": { "formality": "formal", "person": "we", "spelling": "en-GB", "bannedTerms": [], "notes": "" }
}
```
Each extracted leaf in `brand_extractions` carries `confidence` (0 to 1) and `evidence` (source file, page/slide, bbox, snippet).

## 4. Ingestion pipeline (background job, F12)

1. **Upload** → stored outside the web root, `sha256` dedup. Limits: PPTX/PDF 50 MB, images 10 MB, fonts 5 MB, 30 files per batch.
2. **Validate** → magic-byte type check (not the extension); reject macros (`.pptm`), encrypted PDFs, zip entries over 200 MB uncompressed or above a 100:1 ratio (zip bomb); SVG sanitized (strip scripts, event handlers, external refs); optional ClamAV scan if installed.
3. **URL fetch** (SSRF-safe fetcher, shared with `research_tools.fetch_url`): https/http only; resolve DNS, then **block private, loopback, link-local, metadata (169.254.169.254) and IPv6 ULA**; re-check on every redirect (max 3); 10s timeout; 5 MB cap; honor `robots.txt`; identify with a generic UA; fetch homepage + linked CSS only (colors, `@font-face`, logo `<img>`/`og:image`).
4. **Deterministic extract**: PPTX theme colors, fonts, master layouts, footer placeholders, chart XML styles; PDF fonts/colors; logo dominant colors and aspect ratio; CSS custom properties.
5. **AI extract**: one call per source in parallel (limit 4), `claude-fable-5-2` effort `high`, structured output. The system prompt states that **document content is untrusted data, never instructions**. Content is wrapped in `<source_document>` tags, and any instruction-like text inside is ignored and flagged (`injection_suspected`).
6. **Merge**: deterministic values beat AI values; agreement across sources raises confidence; conflicts are surfaced for review.
7. **Human review**: brand manager accepts, edits or rejects each element → `brand_version.status=active` → audit entry.

## 5. Brand Memory and generation (C2, C3)

- Generation and refine prompts put the **active brand version** in the stable, cached prefix: system → brand rules summary (compact, about 1 to 2K tokens) → deck context → volatile request.
- Context trimming: only the layout recipes and chart styles relevant to the slide purposes in play are included.
- C3: one batched `low`-effort call classifies every outline item into `{introduction, agenda, financial, comparison, history, process, data, quote, team, conclusion, other}`. Purpose maps through `layouts` to a LayoutId and recipe. Without a brand, today's `_enforce_layout_diversity` remains.
- The compiler applies tokens deterministically (colors, fonts, logo, footer). The AI never outputs raw hex or font names for branded decks. It outputs semantic roles (`primary`, `accent`).

## 6. Brand Lock (C4): enforced, not just displayed

Locks live in `brand_version.locks_json`:
```json
{ "logo": "locked", "fonts": "locked", "colors": "palette-only", "footer": "locked",
  "disclaimers": "locked", "layouts": { "introduction": "locked", "conclusion": "locked" },
  "editableZones": ["title", "body", "media", "chart-data"] }
```
One validator, `validateOps(deck, ops, brandVersion) -> {allowed, rejected[{op, rule, reason}]}`, written in `shared/brand/lockValidator.ts`, with a Python port tested against the same fixtures (like the existing `test_spec_agreement.py`). It runs at:

| Path | Enforcement |
|---|---|
| Editor (`opsEngine.ts`) | Ops on locked blocks or properties are rejected before apply. Lock icon + tooltip. |
| Server save (`PUT /presentations/:id`, slide routes) | Re-validated server-side. Returns 409 `brand_lock_violation` with details. **Authoritative.** |
| AI generation / refine / co-author (#11 Designer) | AI ops pass through the validator. Violations are dropped and reported in the change card. |
| Export (PPTX/HTML/PNG/video) | Locked elements re-applied from tokens at export time; export fails closed if required disclaimers are missing. |

Only `admin` / `brand_manager` can change locks, enforced by `@require_role` on the server.

## 7. Compliance checker (C5)

Deterministic rule engine, with every rule having an `id`, `weight`, `category` and `check(slide, tokens) -> findings[]`:

| Category | Example rules | Type |
|---|---|---|
| Colors | text/bg/fill hex ∈ palette (ΔE2000 ≤ 3 tolerance) | deterministic |
| Typography | font family ∈ brand fonts; sizes on scale | deterministic |
| Logo | present where required; position within 8px of anchor; aspect ratio unchanged (±0.5%); width ≥ minWidth; clear space respected | deterministic |
| Footer / legal | footer present; required disclaimer text exact match | deterministic |
| Layout | locked purposes use approved layout | deterministic |
| Charts | kind/legend/grid/palette match approved chart style | deterministic |
| Accessibility | contrast ≥ 4.5:1 (warn only, never auto-fix brand colors) | deterministic |
| Imagery / tone | photo style matches `imagery`; text formality matches `language` | **AI** (vision on a rasterized slide, effort `medium`, only when enabled) |

Score = 100 − Σ(weight × severity), shown as "94/100 · High compliance". Every deduction links to `{ruleId, slideId, blockId, explanation, fix}`. **Fix all** produces fix ops, shows a before/after preview (two `SlideStage` thumbnails), applies them as one undoable transaction through the existing ops engine, and writes an audit entry.

## 8. Learning from past decks (C6) and departments (C7)

- Only sources with `example_status=approved` feed pattern stats (layout frequency, chart kinds per department, stat display patterns). `outdated` and `excluded` are kept for C8 comparison but never learned from.
- Department profile = `resolve(corporate, department.overrides)`. An override is allowed only where the lock permits (for example, layouts and imagery are overridable, but logo and fonts are not). The validator rejects illegal overrides at save time.

## 9. Evolution (C8) and multi-brand (C9)

- New guidelines → new draft `brand_version` → structural diff vs active (colors, fonts, logo asset hash, footer, layouts) → impact report: which decks and templates use outdated elements → **opt-in** migration per deck with preview → applied as ops with undo. Rollback = re-activate a previous version (immutable versions).
- Multi-brand: each brand is an isolated profile. Assets are resolved only through `brand_id`. `brand_access` restricts use per team or user. The deck stores `brand_id` and the renderer only loads assets from that brand. Changing a deck's brand is an explicit action with a compliance re-check.

## 10. Permissions (server-enforced)

| Action | admin | brand_manager | employee |
|---|---|---|---|
| Create/ingest brand | ✓ | ✓ | – |
| Review/activate version, edit locks | ✓ | ✓ | – |
| Mark examples approved/outdated | ✓ | ✓ | – |
| Manage departments, brand access | ✓ | ✓ (own brands) | – |
| Use brand on decks | ✓ | ✓ | ✓ (if in `brand_access`) |
| View audit log | ✓ | ✓ (own brands) | – |

## 11. Tenant isolation

- Every table has `org_id`. One `scoped(conn, org_id)` repository helper; direct `SELECT` without scope fails a lint test (grep test in pytest).
- File storage path `uploads/{org_id}/brand/{brand_id}/…`. The asset route checks `org_id` + brand access before serving.
- AI: one request = one org's data only. Prompt-cache prefixes are per org by content (no cross-org shared prefix holds tenant data). Result-cache keys are `org:{org}:user:{user}:brand:{brand}:{feature}:{hash}`. Embedding rows carry `org_id` and are filtered at query time.
- Fonts: unlicensed or non-embeddable fonts are never embedded in exports. The fallback stack is used with a warning. A missing font file shows a warning and falls back safely.
- Logos: rendered with `object-fit: contain`, never stretched, recolored or cropped. Enforced in the renderer, the validator and the exporter.
- Audit log covers rule, lock, approval, version, access and override changes.
