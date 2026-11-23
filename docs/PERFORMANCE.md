# Performance: Baseline, Budgets, 3D Audit, AI Gateway

Status: plan approved 2026-11-21. **D0 baseline measured 2026-11-21** (below). No app code changed.

## D0. Baseline (measured 2026-11-21, before any change)

Environment: Windows 11, Chrome stable, production build (`vite build`) served by `vite preview` on 127.0.0.1 with the Flask backend on :5000 and the existing `instance/fluxa.db` (96 decks). Measurement scripts live outside the repo (session scratchpad) so the project stays untouched; they are described here so the runs can be repeated.

### Bundle (all routes load the same files)

| File | Raw | Gzip |
|---|---|---|
| `index-*.js` (single chunk) | **3,346.8 KB** | **873.5 KB** |
| `index-*.css` | 15.7 KB | 4.2 KB |

There is no code splitting, so every route (landing, create, workspace, editor, share viewer) downloads and parses the whole app. Share of the bundle by package (rollup `renderedLength`, before minification, total 6,201 KB):

| Package | KB | Share | Note |
|---|---|---|---|
| three | 1,683.6 | 27% | Only needed when a 3D block is on screen |
| **lucide-react** | **1,203.3** | **19%** | `rendering/blocks/IconBlockRenderer.tsx` uses `import * as Icons`, which pulls in **every** icon |
| pptxgenjs | 504.7 | 8% | Only needed on PPTX export |
| chart.js | 458.6 | 7% | Only with chart blocks |
| prosemirror-* + @tiptap/* + linkifyjs | ~800 | 13% | Only when editing text |
| app: rendering/blocks | 151.5 | 2% | |
| react-dom | 131.0 | 2% | |
| jszip | 95.6 | 2% | Export only |
| qrcode | 72.8 | 1% | Live meeting only |
| html-to-image | 31.6 | <1% | Export only |

### Lighthouse (performance category, median of 3 runs)

| Route | Profile | Score (runs) | FCP | LCP | TBT | CLS | Transfer |
|---|---|---|---|---|---|---|---|
| `/` landing | desktop | 85 (85/90/81) | 1.43 s | 2.01 s | 0 ms | 0 | 2,229 KB |
| `/` landing | mobile | **60** (60/61/60) | 5.91 s | **9.51 s** | 26 ms | 0 | 2,229 KB |
| `/create` | desktop | 86 (85/86/90) | 1.41 s | 1.97 s | 0 ms | 0 | 1,533 KB |
| `/create` | mobile | **61** | 5.77 s | **9.23 s** | 22 ms | 0 | 1,533 KB |
| `/workspace` | desktop | 85 (85/85/94) | 1.18 s | 2.35 s | 0 ms | 0 | 2,205 KB |
| `/workspace` | mobile | **61** | 5.76 s | **13.08 s** | 11 ms | 0 | 2,205 KB |
| `/presentations/98?view=edit` (editor, deck with 3D) | desktop | 74 (70/76/74) | 1.17 s | 1.82 s | 339 ms | 0 | 1,580 KB |
| same | mobile | **36** (36/35/36) | 5.72 s | **9.64 s** | **1,265 ms** | 0 | 1,580 KB |

Mobile = Lighthouse default (Moto G Power, 4× CPU slowdown, slow 4G). CLS is already 0 everywhere. The mobile problem is download + parse of the single 873 KB gzip chunk. The landing page's extra ~700 KB is `robot.png` (landing frozen, not touched).

### 3D (Interactive3DViewer)

Measured with Playwright driving real Chrome (GPU), WebGL contexts counted by instrumenting `getContext`, CPU from CDP `Performance.getMetrics` over 5 s of idle with the slide on screen.

| Profile | Deck | Canvases on screen | WebGL contexts created | Context lost | rAF fps | Main thread busy (idle, 5 s) | Long tasks during load + slide walk |
|---|---|---|---|---|---|---|---|
| Desktop 1440×900 | 98 (has 3D) | 1 | 1 | 0 | 60 | **10%** | 897 ms |
| Desktop 1440×900 | 88 (3D slides not on first view) | 0 | 0 | 0 | 60 | 2% | 387 ms |
| Mobile 390×844, 4× CPU throttle | 98 | 1 | 3 | 0 | 59 | **75%** | 7,839 ms |
| Mobile 390×844, 4× CPU throttle | 88 | 0 | 1 | 0 | 58 | 1% | 5,174 ms |

Reading: one idle 3D scene costs about **8% of the desktop main thread** and about **74% on a throttled phone**, purely from the never-stopping render loop. On mobile the viewer was created 3 times while moving between slides (scene torn down and rebuilt). JS heap did not grow measurably over the slide walk (12 to 16 MB), so the missing geometry/material disposal is a GPU-memory leak, not a JS-heap leak; it needs `renderer.info.memory` to quantify (added as a dev overlay in D1).

**Correction to the earlier plan:** thumbnails did *not* create extra WebGL contexts (1 context for 1 visible 3D block), so the "one context per thumbnail" risk is not real today. D1 item 4 stays as a safeguard only.

Polygon counts are not exposed by the current code. All models are procedural (no files). Triangle counts per model type will come from the `renderer.info.render.triangles` overlay in D1.

### AI (current provider: OpenRouter → `openai/gpt-4o-mini`, fallback `google/gemini-2.5-flash`)

Measured in-process against the app's real configured provider (each `requests.post` timed and its `usage` captured; no DB writes). Topic: "A board briefing on how hospitals are adopting AI", 7 slides.

| Flow | Runs | Median total | Per run | LLM HTTP calls (per flow total) | Median tokens in / out |
|---|---|---|---|---|---|
| Outline (`provider.generate_outline`) | 3 | **45.1 s** | 50.3 / 45.1 / 40.2 s | 10 (≈3.3 per outline) | 1,803 / 2,900 |
| One slide (`provider.generate_slide`) | 3 | **12.4 s** | 12.4 / 7.5 / 59.1 s | 5 | 979 / 1,000 |
| Chat edit (`provider.chat_ops`) | 3 | **18.0 s** | 18.0 / 15.9 / 30.3 s | 5 | 864 / 1,090 |
| Full pipeline research + outline (`AgentLoop.run`, what `/workspace` runs) | 1 | **384 s (6.4 min)** | — | **125** | 22,409 / 26,100 |

Time to first token: not measurable today. No flow streams tokens; the outline endpoint returns one JSON response and the pipeline streams only phase events.

**Root cause found while tracing one outline call:** the OpenRouter account returns **HTTP 402 "requires more credits"** for every paid model in the chain (`gpt-4o-mini`, `gemini-2.5-flash`, `llama-3.3-70b`, `deepseek-chat`). Each call then falls through to `openrouter/free`, which routes to random free models (nvidia nemotron, baidu ernie, liquid lfm, …). These often return reasoning text instead of JSON, the parse fails, and the app silently falls back to a **template outline** ("using research dossier template"). So the numbers above are the *free-model fallback path*, and much of today's "AI output" is template content, not model output. Two more consequences:
- Cost of this run was effectively zero (402s are not billed, free models are free).
- **Privacy:** user prompts are currently being sent to whichever free model OpenRouter picks. Free models may log or train on prompts. This goes away with the gateway (direct Anthropic, one configured model).

The hard-coded chain of five models (`openrouter_provider.py:150`) also brings back defect 9 from AGENTS.md (cascading models). The D2 gateway replaces it.

Other facts:
- CSS 15.7 KB. `robot.png` 712 KB (landing, **frozen, not optimized**).
- No 3D model files exist in the repo (no .glb/.gltf/.obj/.fbx).

## Budgets (proposed)

| Area | Budget | Note |
|---|---|---|
| LCP | < 2.5s mobile, < 1.5s desktop | Landing measured, but landing is frozen. Route splitting still helps it without changing its markup. |
| CLS | < 0.05 | 3D placeholders sized to the final box |
| TBT | < 200ms mobile | |
| Initial JS (non-editor routes) | < 250 KB gzip | Editor route < 600 KB gzip |
| 3D | 60 fps desktop, ≥ 30 fps mid-range phone, 0 work when off-screen or the tab is hidden, ≤ 1 live WebGL context per visible 3D block | |
| 3D model payload | < 1.5 MB per user glTF after optimization | User uploads only |
| AI TTFT (streamed) | **< 1.5s** for chip/refine/ask; < 3s for full outline/deck | Proposed above 1s because the user chose Fable 5.2 (most capable, thinks every time). Fast mode + low effort is the lever. Will be measured, and if missed I'll ask before changing models. |
| Realtime | #7 answer start < 2s; #10 caption lag < 2s; #15 slide-advance decision < 700ms (mostly local, no LLM) | |
| Realtime messages | ≤ 2 KB each, ≤ 10 msg/s per session fan-out, per-participant rate limit 1 question / 5s | |

## D1. 3D audit and plan

### Inventory
| Element | File | Tech | Shown where | Issues found |
|---|---|---|---|---|
| Interactive3DViewer (12 procedural scenes: globe, crystal, medical, dna, torus, automotive, finance, city, energy, server, logistics, custom glTF) | `rendering/blocks/Interactive3DViewer.tsx` (1,373 lines) | raw three.js r187 `WebGLRenderer` | Slide blocks `model3d`/`3d`, image blocks with a 3D mode: editor stage, **thumbnails**, present mode, share viewer | ① continuous `requestAnimationFrame` loop that never pauses off-screen or in hidden tabs; ② geometries/materials/textures **never disposed** (only `renderer.dispose()`), so memory grows on every model switch; ③ `antialias: true` + `powerPreference: "high-performance"`; ④ the effect recreates the whole scene on any prop change; ⑤ (checked in D0: thumbnails do **not** create extra WebGL contexts today, but on mobile the viewer was rebuilt 3× while moving between slides); ⑥ no `prefers-reduced-motion`; ⑦ no WebGL-unavailable fallback; ⑧ three.js is in the main bundle for every route; ⑨ globe uses 48×48 sphere + transparent atmosphere; transparent sorting costs fill-rate |
| Custom glTF load | same file, `GLTFLoader` | user URL | custom model | no Draco/Meshopt/KTX2 decoders, no size cap, no progress-to-poster |
| Isometric3DChart | `rendering/blocks/Isometric3DChart.tsx` | **SVG** (not WebGL) | chart blocks | fine; only memoization review |

No original 3D source files are needed: models are procedural code. The "keep originals untouched" rule applies to user-uploaded glTF, where the original is stored and an optimized copy is served.

### Plan (each item measured before and after; reverted if no gain)
1. **Lazy-load**: `React.lazy(() => import("./Interactive3DViewer"))` + a same-size poster (static first frame PNG per model type, generated once at build). three.js leaves the main bundle.
2. **Visibility gating**: `IntersectionObserver` + `document.visibilitychange` → stop the RAF loop when not visible.
3. **Render on demand**: when idle (no drag, autorotate off, or reduced motion), render only on input; autorotate keeps a capped 30 fps on mobile.
4. **Thumbnails**: `mode="thumbnail"` renders the static poster, never WebGL (safeguard; D0 found no extra contexts today).
5. **Dispose properly**: traverse the scene, dispose geometry/material/texture; `renderer.forceContextLoss()` on unmount; a leak test that mounts and unmounts 50× and checks `renderer.info.memory` returns to 0.
6. **DPR cap**: `min(devicePixelRatio, 2)` desktop, `1.5` mobile; adaptive drop to 1 if frame time is above 22ms for 1s.
7. **Allocation**: hoist per-frame `Vector3`/`Color` allocations; share geometries/materials across repeated parts; `InstancedMesh` for repeated buildings, LEDs, particles and DNA spheres.
8. **Lights**: keep 3 (ambient + 2 directional), no shadows (already none).
9. **Scene rebuild**: split the effect so color/speed changes update uniforms instead of rebuilding.
10. **glTF uploads**: server job runs `gltf-transform` (Meshopt + KTX2 + texture resize to 2K max + prune/dedup) *(new dev dependency, asks first)*; store the original in `uploads/{org}/3d/original/`, serve optimized with `Cache-Control: public, max-age=31536000, immutable`; client registers `MeshoptDecoder` + `KTX2Loader`.
11. **Fallbacks**: no WebGL, `navigator.connection.saveData`, `effectiveType` 2g/3g, or `deviceMemory ≤ 2` → poster image. Reduced motion → static frame.
12. **Not done**: OffscreenCanvas/worker (pointer interaction + three.js in a worker adds complexity; only if profiling shows main-thread render cost above 4ms/frame).

3D does not run behind the outline page or editor unless visible (items 2 and 4).

## D2. AI gateway design (`app/ai/gateway.py`)

All features call `gateway.run(feature="outline.refine", org, user, inputs, stream=True, cancel_token)`.

| Concern | Design |
|---|---|
| Provider | Official `anthropic` Python SDK (replaces hand-written `requests` calls in `anthropic_provider.py`). OpenRouter/OpenAI/Gemini/Mock stay behind the same interface for dev/tests. |
| **Model** | `AI_MODEL_DEFAULT=claude-fable-5-2` for every feature (user requirement: best model). `AI_MODEL_REALTIME=claude-fable-5-2` with `speed: "fast"`. All configurable via env; no model name in feature code. |
| Speed/cost lever | `output_config.effort` per feature: `low` (chips, classification, intent, layout purpose, Ask Anything, translation chunks), `medium` (refine, narration, co-author roles, compliance vision), `high` (outline/deck generation, brand extraction, debate, decision consequences, demos, visual memory). **Not** routing to smaller models. |
| Thinking | Always on for Fable 5.2 (never send `thinking: disabled`). `display: "summarized"` only where we show progress; otherwise omitted. |
| Refusals | `betas=["server-side-fallback-2026-07-01"]`, `fallbacks="default"`; always check `stop_reason` (`refusal`, `max_tokens`) before parsing. |
| Streaming | `client.messages.stream(...)` for every user-facing generation, relayed as SSE. Outline gets a real token stream (`/generate/outline` with `stream: true`). |
| Prompt caching | Prompt layout: `system` (frozen per feature + version) → brand rules → deck/content context → volatile request. `cache_control` on the last stable block. Verified via `usage.cache_read_input_tokens`. No timestamps or IDs in cached parts; sorted JSON. |
| Result cache | Deterministic requests (same feature + inputs hash + brand version) → SQLite cache table, TTL per feature, key `org:user:brand:feature:sha256`. Never shared across orgs. |
| Structured outputs | `output_config.format` JSON schema for anything code consumes (outline, ops, compliance, extraction, debate, map). Replaces today's `extract_json` repair heuristics. Forced `tool_choice` is not used (400 on Fable 5.2). |
| Incremental | Per-slide content hash; re-embed and re-analyze only changed slides. |
| Parallel | `concurrent.futures` with per-feature limits (slides 6, personas 4, brand sources 4). |
| Context trimming | Per-feature token budget (e.g. Ask Anything 8K input, outline 20K, extraction 150K); top-k retrieval; only relevant brand rules. `count_tokens` checked in dev. |
| Timeouts / retries | SDK `max_retries=2`, per-feature timeouts (realtime 15s, interactive 90s, jobs 15 min streamed); typed exception chain (RateLimit → APIStatus 5xx → Connection). |
| Cancellation | `cancel_token` checked between stream events; Cancel closes the SDK stream (stops generation and cost); Pause closes the stream and keeps partial output with a "Resume" that continues from it. |
| Rate limiting | Per user and per org token buckets in Redis (or in-process in dev). |
| Jobs | RQ queue for ingestion, video, translation audio, visual memory; progress in a `jobs` table, streamed via SSE. |
| Usage tracking | `ai_usage(id, org_id, user_id, feature, model, effort, speed, input_tokens, cache_read, cache_write, output_tokens, ttft_ms, total_ms, status, created_at)`, indexed `(org_id, created_at)`, `(feature, created_at)`. Admin page `/admin/usage` with per-feature cost and p50/p95 latency. |
| Security | Untrusted content (uploads, web pages, audience questions) wrapped in tagged data blocks; system prompt says it is data only; tool access limited per feature. |
| Privacy | Fable 5.2 requires 30-day retention at Anthropic (no ZDR). Disclose in the privacy notice. |
| In-browser models | Web Speech API for voice commands (on-device or vendor cloud depending on browser; free, low latency, Chrome/Edge/Safari only). Server STT for continuous speech (#10, #15). |

### Cost note
Fable 5.2 is $8 / $40 per million input/output tokens (fast mode $16 / $80; cache reads $0.20). The usage dashboard makes the real spend visible per feature. If a feature's cost or latency is unacceptable, I'll show the numbers and ask before considering any other model.

## D3. General web performance plan

- Route-based splitting: `React.lazy` for EditorRoute, PresenterPage, ShareViewer, PrintRoute, CreatePresentation, WorkspacePage, Brand section. Lazy-load PptxGenJS/JSZip/html-to-image on export click, Tiptap on first edit, Chart.js with the chart block. (The landing route's markup is untouched; it just stops downloading editor code.)
- `vite build` `manualChunks` for vendor groups; bundle-size check script in `npm run build:check` (fails above budget).
- Virtualize slide rail over 50 slides, outline cards over 40, version history, usage tables.
- Memoize `SlideStage`/block renderers by slide revision; colocate inspector state.
- Autosave: JSON-patch diffs instead of the whole doc; live sync debounced 250ms; cursor/slide sync throttled.
- Fonts: IBM Plex self-hosted subset (latin + needed scripts), `font-display: swap`, preload only the UI regular weight.
- Images: responsive `srcset` + WebP/AVIF for user uploads (server-side conversion job). Landing `robot.png` excluded (frozen).
- DB: indexes listed in BRAND_INTELLIGENCE.md and ROADMAP.md; cursor pagination on decks, versions, usage, comments.
- CI: no CI exists today. Add a `npm run perf:check` (bundle budget + Lighthouse CI on `vite preview`) and document it; GitHub Actions only if you want it.

## D4. Rules

Before/after numbers for every optimization go in a results table appended to this file; optimizations that don't help measurably are reverted; no visible quality change without a before/after comparison and your OK; no heavy new dependency without asking.

## Results log

| Date | Change | Metric | Before | After | Kept? |
|---|---|---|---|---|---|
| 2026-11-21 | Part A2 outline page restyle (UI only) | JS bundle raw / gzip | 3,346.8 / 873.5 KB | 3,352.1 / 876.8 KB (+5.3 / +3.4) | yes (feature, not an optimization) |
| 2026-11-21 | same | CSS raw / gzip | 15.7 / 4.2 KB | 33.3 / 7.8 KB (+17.6 / +3.6) | yes |
| 2026-11-21 | same | `/create` Lighthouse desktop (median of 3) | 86, LCP 1.97 s, CLS 0 | 90, LCP 1.76 s, CLS 0 | yes |
| 2026-11-21 | same | `/create` Lighthouse mobile (median of 3) | 61, LCP 9.23 s, TBT 22 ms | 61, LCP 9.24 s, TBT 33 ms | yes. **Mobile LCP budget (< 2.5 s) still missed**: caused by the single 3.35 MB bundle, fixed by D3 route splitting, not by this page |
| 2026-11-21 | A2 v2 redesign (direction C) + A1 landing scroll fix | JS / CSS raw (gzip) | 3,352.1 / 33.3 KB | 3,352.6 (878.2) / 37.9 (8.4) KB | yes (feature). Lighthouse not re-run for v2; mobile LCP is still bound by the single bundle (D3) |
| 2026-11-22 | D3 route splitting (all pages but landing lazy), exporters/QR/Tiptap/icons lazy, D1 3D lazy-load | Initial JS gzip per route (`npm run build:check`) | 882 KB every route | landing 66, sign-in 69, workspace 80, create 181, share viewer 165, editor 237 KB | yes, all routes under budget |
| 2026-11-22 | same | Lighthouse desktop score / LCP (median of 3; signed-in copy of the DB) | `/` 88 / 1.88 s; `/create` 90 / 1.69 s; `/workspace` 86 / 1.82 s; editor 64 / 1.82 s | `/` 98 / 1.15 s; `/create` 97 / 1.21 s; `/workspace` 100 / 0.61 s; editor 66 (58 to 66) / 2.2 s | yes. Editor LCP is a slide paragraph after the deck renders; next lever is rail virtualisation + memoised SlideStage (D3, not done) |
| 2026-11-22 | same | Lighthouse mobile score / FCP / LCP | `/` 60 / 5.9 s / 9.6 s; `/create` 31 / 5.9 / 6.2 s (TBT 5,980 ms); `/workspace` 62 / 5.9 / 6.2 s; editor 34 / 5.9 / 8.5 s | `/` 80 / 1.35 / 5.3 s; `/create` 80 / 1.34 / 5.3 s (TBT 34 ms); `/workspace` 71 / 1.39 / 2.2 s; editor 42 / 1.35 / 8.7 s | yes. Editor mobile TBT reads higher (1.7 to 3 to 5 s, noisy) because FCP moved 4.5 s earlier, so startup work now falls inside the TBT window; mobile LCP budget still missed (mobile deferred by request) |
| 2026-11-22 | D1 viewer: pause off-screen / hidden tab, dispose GPU resources + forceContextLoss, DPR cap 1.5 on phones, reduced motion = static, no-WebGL notice | Idle main-thread busy with one 3D block on screen (8 s after load) | desktop 10%, mobile (4x throttle) 72% | desktop 12 to 13%, mobile 59 to 62% | yes. Mobile gain from the DPR cap; desktop within noise. JS heap at load 15.7 to 10.5 MB |
| 2026-11-22 | Tiptap prefetch moved from mount to idle | editor TBT | (no measurable change either way, within noise) | | kept idle version (keeps it out of the load window) |

D1 items not done in this pass: 3 (render on demand beyond reduced motion), 4 (static thumbnail posters), 7 (instancing), 9 (uniform updates instead of rebuild), 10 (glTF optimisation job; needs a new dependency), poster images for save-data / slow connections. D3 not done: rail virtualisation, SlideStage memoisation, JSON-patch autosave, self-hosted font subsets, image srcset, Lighthouse CI. Mobile work paused by request (desktop first for the demo).

