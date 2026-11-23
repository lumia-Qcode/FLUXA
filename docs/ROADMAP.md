# FLUXA Roadmap: Presentation Intelligence Platform

Status: **planning, awaiting approval**. No code has been changed.

Vision: AI helps you **prepare** (before), acts as **copilot** (during), the **audience participates**, AI **analyzes and remembers** (after), and every deck follows the **company's identity**.

## 0. Ground rules

- Landing page frozen (no changes).
- **AI model:** every AI call goes through one gateway and uses **`claude-fable-5-2`** (Anthropic's most capable model) via the official `anthropic` Python SDK. Speed and cost are tuned with `output_config.effort` (`low` / `medium` / `high`), prompt caching and, for realtime features, `speed: "fast"`. Features are **not** routed to smaller models. Model IDs live in env config (`AI_MODEL_DEFAULT`, `AI_MODEL_REALTIME`) so they can change without code.
- Existing provider abstraction (`app/ai/factory.py`) stays. A new `AnthropicSDKProvider` replaces the hand-rolled `requests` calls. OpenRouter, OpenAI, Gemini and Mock remain as configured fallbacks for dev and tests.
- Every feature must pass the Part D budgets (PERFORMANCE.md) before it is marked done.

## 1. Current-state facts that shape the plan

| Area | Today | Gap |
|---|---|---|
| Auth / orgs / roles | **None** | Must be built first (Part C, #12, tenant isolation) |
| DB | SQLite, raw `sqlite3`, 9 tables | New tables, indexes, tenant column on everything |
| AI | OpenRouter → gpt-4o-mini, no usage tracking, no caching, no token streaming for outline | Gateway (D2) |
| Realtime | Live sessions via 2.5 to 3s **polling** | SSE fan-out layer |
| Uploads | PNG/JPG/WebP/SVG/MP4 only | PDF/PPTX/fonts/URL ingestion with scanning |
| Jobs | None (all work in request thread) | RQ + Redis queue |
| Export | PPTX (native charts), HTML, PNG, MD, client-side | Brand-aware export + lock enforcement |
| Embeddings | None (Anthropic has no embeddings API) | Voyage AI embeddings (third party, needs approval) + `sqlite-vec` |

## 2. Shared foundations (Phase 0)

| ID | Foundation | Needed by | Plan |
|---|---|---|---|
| F1 | **Auth, orgs, roles** (admin, brand_manager, employee), teams | Part C, #9, #12, all tenant data | Flask session cookies (HttpOnly, SameSite=Lax), `werkzeug.security` password hashing, `users`, `orgs`, `memberships`, `teams`. A `@require_role` decorator enforced server-side. Existing decks migrate into a default org. |
| F2 | **Tenant isolation** | Everything | `org_id` on every row, every query scoped through one repository helper, cache keys prefixed `org:{id}:user:{id}`, per-org embedding namespaces, audit log. |
| F3 | **AI gateway** | All AI | See PERFORMANCE.md §D2: one `gateway.call(feature, ...)`. Covers streaming, prompt caching, result cache, structured outputs, cancellation, timeouts/retries, refusal fallbacks, usage log. |
| F4 | **Prompt and AI role registry** | #1, #4, #11 | `app/prompts/registry.py`: versioned prompt templates (stable prefix first), role definitions (Researcher, Designer, Storyteller, Critic, Coach, Audience persona, Debate panel). |
| F5 | **Content index** | #1, #4, #7, #9, #11, #14 | Per-slide text extraction (blocks → plain text + chart/diagram descriptions), content hash per slide, embeddings only for changed slides, `slide_chunks` table + `sqlite-vec`. |
| F6 | **Design tokens + brand store** | Renderer, #6, #11, #12, #14, Part C | Extends `ThemeTokens` into `BrandTokens` (BRAND_INTELLIGENCE.md). A deck gets an optional `brandId`. No brand means today's behavior. |
| F7 | **Live session layer v2** | #3, #5, #7, #13, #15 | Keep the existing tables. Add an SSE channel `/api/live/sessions/:id/stream` (server→client) and keep POST for client→server. Redis pub/sub for multi-worker. Replaces polling. Join stays QR/link to `/v/:id?live=` (mobile-first audience pages). |
| F8 | **Audience page shell** | #3, #7, #10, #13 | Mobile-first `/join/:code` with tabs (Slides, Ask, Vote, Translate), RTL support via `dir="rtl"` plus logical CSS properties. |
| F9 | **Speech in** | #2, #10, #12, #15 | Browser Web Speech API for voice commands (free, low latency, Chrome/Edge/Safari; audio goes to the browser vendor). Server STT (Deepgram or OpenAI Whisper, approval needed) for continuous transcripts in #10/#15. |
| F10 | **Speech out (TTS)** | #6, #10 | Third-party TTS (ElevenLabs or OpenAI TTS, approval needed). Voice cloning only with recorded speaker consent. |
| F11 | **Session state sync + autosave v2** | #5, #15 | Server-side `presenter_state` (slide index, step, timer, notes position) with 1s debounced diffs. Today's 800ms whole-doc autosave becomes JSON-patch diffs. |
| F12 | **Background jobs** | Part C ingestion, #6, #10, #14 | RQ + Redis, `jobs` table for progress, SSE progress to the UI. |
| F13 | **File ingestion pipeline** | Part C, #9 | Type sniffing (magic bytes), size limits, zip-bomb guard, `pypdf`/`pdfplumber` (MIT/BSD; avoid AGPL PyMuPDF), `python-pptx`, font parsing via `fontTools`, sandboxed worker, SVG sanitizing, SSRF-safe URL fetcher. |
| F14 | **Data connectors** | #12 | Connector interface + CSV/Google Sheets/REST-JSON first. OAuth tokens encrypted at rest, scoped per org. Never sent to the model. |
| F15 | **Consent and privacy** | #7, #10, #15 | `consents` table (who, what, when, scope), retention jobs, audience notice on join, speaker consent gate for voice features. |
| F16 | **Perf baseline + budgets** | Everything | D0 (PERFORMANCE.md) before any heavy work. |

## 3. Feature analysis: Part B (all 15, all in scope)

Legend: Feasibility E/M/H, Effort S/M/L. Model is always `claude-fable-5-2`. The effort column is the per-call setting.

| # | Feature | Feas. | Builds on | New infra | Effort | Main risks | UI placement | Brand interaction | AI efficiency |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Audience Twin | M | `copilot_service`, `agent_loop` | F4 personas, F5 | M | Cost (N personas × deck), shallow questions | Editor → "Rehearse" panel | Questions reference brand tone rules; nothing visual | Effort `medium`; deck context cached once and shared by all personas; personas run in parallel (limit 4); structured output `{questions, confusing_slides, weak_args}` |
| 2 | Time Machine | M | Presenter view, `notes` | F9 voice intent, F11 | M | Bad cuts on key slides | Presenter view: "I have N min" button + voice | Generated conclusion slide uses the approved closing layout | Intent detection at `low` + fast mode; plan at `medium`; output is a slide-skip/order plan JSON, never deletes the deck |
| 3 | Audience-Controlled | M | `live_polls`, reorder route | F7, F8 | M | Vote spam, mid-talk reorder confusion | Presenter: "Let audience choose" / audience: Vote | Reordered agenda slide re-rendered with brand layout | Reordering is deterministic (no AI); AI only writes transition text at `low` |
| 4 | Debate Mode | M | Copilot chat, research agent | F4 Critic panel, F5 | M | Hallucinated "evidence" | Editor → "Stress test" panel | Respects brand language/formality | Effort `high`; structured `{claim, slide, challenge, counter, evidence_needed}`; research tool only for verification |
| 5 | Instant Recovery | E-M | Revision autosave, IndexedDB, live sync | F11, F7 | M | Conflicts between devices | Presenter view banner "Resume on another device" + QR | n/a | No AI |
| 6 | Slide-to-Video | H | PNG exporter, renderer | F10 TTS, F12, ffmpeg, headless Chromium render | L | Cost, render time, audio licensing | Editor → Export → "Video" with job progress | **Must** use brand colors, fonts, logo intro/outro, caption style from tokens | Narration script at `medium`, all slides parallel (limit 6); TTS + render in background job |
| 7 | Ask Anything | M | Share viewer, live sessions | F5 RAG, F7, F8, F15 | M | Prompt injection via questions, wrong answers, privacy | Audience page "Ask" tab; presenter sees question feed | Answers follow brand tone | Effort `low` + fast mode; retrieve top-k slide chunks only; deck summary cached; answers cite slide numbers; per-participant rate limit |
| 8 | Live Demo Generator | H | `HtmlBlockRenderer` sandboxed iframe (strict CSP already) | Sandbox hardening (`sandbox="allow-scripts"`, no same-origin, no network) | L | Unsafe or broken code, slow generation | Editor and presenter: "Demonstrate…" | Demo palette and fonts injected from brand tokens via CSS vars | Effort `high`; structured `{html, css, js, controls}`; validate + render test before insert |
| 9 | Presentation Memory | M | Workspace deck list | F5, F1 (per-user/org scope) | M | Cross-tenant leakage, stale reuse | Create flow "Related from your past decks" + editor suggestions | Reused diagrams re-themed to the active brand | Retrieval first, then `medium` synthesis; embeddings only for changed slides |
| 10 | Translation + Voice | H | `bilingual.py`, naskh-urdu theme | F9 server STT, F10, F7, F15 | L | Latency, mistranslation, voice consent, RTL layout | Audience page "Translate" (language picker), presenter consent toggle | Subtitles use brand font with script fallbacks (Noto Naskh/Nastaliq) | Streaming STT → sentence chunking → translate at `low` + fast mode (target <2s caption lag); voice-preserving only with stored speaker consent |
| 11 | Co-Author roles | M | Copilot panel, ops engine, change cards | F4 roles, F5 | M | Roles conflicting, Designer breaking brand | Editor copilot: role picker / "assign role" | **Designer obeys Brand Lock**: its ops pass through the lock validator, and rejected ops are reported | Researcher `high` with web tools; Designer `medium`; Storyteller/Critic/Coach `medium`; shared cached deck context |
| 12 | Live Data Injection | M-H | Datasets + reactive engine (already binds charts to data) | F14 connectors, F9 voice, F1 auth | M | Wrong data, unauthorized access | Presenter/editor: "Update data" + voice | Updated charts keep approved chart styles | Intent `low` + fast mode; mapping connector fields → dataset columns at `medium` once, then deterministic refresh |
| 13 | Decision Rooms | M | Polls + variables/expressions engine | F7, F8 | M | Over-trusting AI projections | Presenter "Decision room" block / audience Vote | Result charts in brand chart style | Consequence model at `high`, run once per option before the session (precomputed); live part is deterministic from user-supplied assumptions |
| 14 | Visual Memory | M | Outline/research dossier, Chart.js | F5, F12 | M | Messy maps for big decks | Post-session page `/p/:id/map` + share | Map nodes use brand palette and fonts | One `high` structured call `{concepts, edges, stats, diagrams}`; rendered as SVG (no new graph lib unless approved) |
| 15 | Autopilot | H | Presenter view, notes, live comments | F9 server STT, F11, F7, F15 | L | Wrong advance, latency, trust | Presenter view "Autopilot" toggle with manual override always on | Visuals shown come from brand-approved assets | Speech-to-slide alignment by embeddings + keyword match locally (no LLM per sentence); LLM at `low` + fast mode only for ambiguous moments; target <700ms decision |

### Privacy flags
- **#7**: audience questions are stored per session, with retention of 30 days by default (configurable per org). A notice shows on join. Questions are treated as data, never instructions.
- **#10**: speaker audio is processed by STT. **Voice-preserving translation requires explicit, recorded speaker consent** (who, when, which languages), revocable, and the voice model is deleted on revoke. Audience members see that subtitles are machine translated.
- **#15**: continuous mic capture only while Autopilot is on, with a visible indicator. Transcripts are kept only if the presenter opts in.
- Fable 5.2 requires 30-day data retention on Anthropic's side (no zero-data-retention mode). This needs disclosure in the privacy policy.

## 4. Feature analysis: Part C (Brand Intelligence)

Detailed design: BRAND_INTELLIGENCE.md.

| ID | Sub-feature | Feas. | Builds on | New infra | Effort | Main risks | UI placement | AI efficiency |
|---|---|---|---|---|---|---|---|---|
| C1 | Brand DNA extraction | M-H | `themes.json`, ThemeTokens | F13, F12, F6, vision | L | Wrong extraction, malicious files, font licensing | `/brand/new` wizard + review | Effort `high`, per-file parallel extraction (limit 4), PDFs sent as document blocks, structured JSON schema with confidence |
| C2 | Brand Memory | E-M | Generation routes, compiler | F6 | S | Prompt bloat | Brand chip on outline page | Brand rules in the cached system prefix; only rules relevant to the slide purpose are included |
| C4 | Brand Lock | M | `locked` flag on blocks (unused today), ops engine | Lock validator (shared TS + Python) | M | Bypass via API/export | Editor lock icons, `/brand/:id/locks` | No AI. Deterministic validator on every write path |
| C3 | Intelligent layouts | M | 15 layout IDs, `agent_loop._enforce_layout_diversity` | Purpose classifier, brand layout map | M | Monotony or wrong layout | Invisible (generation); override in Slide inspector | Purpose classification at `low`, batched for all slides in one call |
| C5 | Compliance checker | M | Spec schema | Rule engine, rasterized slide check for subjective rules | M | False positives | Editor Compliance tab | Deterministic first; vision check at `medium` only on flagged slides |
| C6 | Learn from past decks | M-H | C1 pipeline | Example status, pattern stats | M | Learning from outdated decks | `/brand/:id/examples` | Only `approved` decks; stats computed deterministically, AI summarizes patterns at `medium` |
| C7 | Department profiles | M | C1 store | Inheritance resolver | S-M | Overrides violating locks | `/brand/:id/departments` | No AI except optional style suggestion |
| C9 | Multi-brand | M | F1 teams, F6 | Brand ACL | S-M | Mixing assets | Brand switcher + outline chip | Cache keys include `brand_id` |
| C8 | Brand evolution | M-H | C1, C5, versioned profiles | Diff engine, migration previews | M | Silent changes to old decks | `/brand/:id/history` | Diff deterministic; AI only maps old→new elements at `medium` |

## 5. Build order (by dependency and risk)

| Phase | Contents |
|---|---|
| **D0** | Performance baseline (no behavior change) |
| **A** | Outline page restyle (A2). Landing page excluded. |
| **0: Foundations** | F16 → F1/F2 auth+tenancy → F3 AI gateway (+ outline token streaming) → F4 prompt registry → F6 tokens/brand store → F12 jobs → F13 ingestion → F15 consent |
| **D1/D3** | 3D viewer optimization, bundle splitting, general perf |
| **C: Brand** | C1 → C2 → C4 → C3 → C5 → C6 → C7 → C9 → C8 |
| **1: Prepare** | F5 content index → #9 Memory → #11 Co-Author → #4 Debate → #1 Audience Twin → #8 Live Demo |
| **2: Live** | F7 live v2 + F8 audience shell + F11 sync → #5 Recovery → #3 Audience-Controlled → #13 Decision Rooms → #7 Ask Anything → F9 voice → #2 Time Machine → #12 Live Data (F14) |
| **3: After** | #14 Visual Memory |
| **4: Advanced media** | F10 TTS → #6 Slide-to-Video → #10 Translation → #15 Autopilot |

### Dependency table

| Item | Depends on | Unlocks |
|---|---|---|
| F1/F2 Auth + tenancy | — | Part C, #9, #12, every tenant-scoped table |
| F3 Gateway | F1 (usage per user/org) | All AI features |
| F6 Brand store | F1 | C1 to C9, #6, #11, #12, #14 |
| F13 Ingestion | F1, F12 | C1, C6, C8, #9 |
| F5 Content index | F3 | #1, #4, #7, #9, #11, #14, #15 |
| F7 Live v2 | F1 | #3, #5, #7, #13, #15 |
| F9 Speech in | — (browser) / F12 (server) | #2, #10, #12, #15 |
| F10 TTS | F12 | #6, #10 |
| C4 Lock | C1, F6 | #11 Designer, C5, export |
| C5 Compliance | C4 | C8, "finalize" flow |
| #5 Recovery | F7, F11 | #15 |
| #15 Autopilot | F9, F11, F5, #5 | — |

## 6. Status checklist

| Item | Status |
|---|---|
| D0 baseline | **done** 2026-11-21 (see PERFORMANCE.md) |
| A1 landing scroll | **done** 2026-11-21: scrolls on short windows, sticky nav, smooth scroll; look unchanged |
| A2 outline restyle | **Done, approved** 2026-11-21 (direction C: document + live preview, timeline pipeline; describe step kept as original). See UI_PLAN.md §6 |
| F1/F2 auth, orgs, roles, tenant isolation | **done** 2026-11-22, awaiting review (see "F1/F2" section below) |
| F3 AI gateway (free-model version) | **done** 2026-11-22 (see "F3" section below) |
| F4 prompt and AI-role registry | **done** 2026-11-22 (see "F4" section below) |
| F6 design tokens + brand store | **done** 2026-11-22 (see "F6" section below) |
| F12 background jobs | **done** 2026-11-22 (see "F12" section below) |
| F13 file ingestion | **done** 2026-11-22 (see "F13" section below) |
| F15 consent and privacy | **done** 2026-11-22 (see "F15" section below) |
| D1/D3 performance (first pass) | **done** 2026-11-22; results in PERFORMANCE.md "Results log". Mobile follow-ups paused |
| F5, F7 to F11, F14, F16 foundations | not started |
| D1 3D optimization | not started |
| D2 AI gateway | not started |
| D3 web perf | not started |
| C1 Brand DNA | not started |
| C2 Brand Memory | not started |
| C3 Layout selection | not started |
| C4 Brand Lock | not started |
| C5 Compliance | not started |
| C6 Learn from decks | not started |
| C7 Departments | not started |
| C8 Evolution | not started |
| C9 Multi-brand | not started |
| #1 to #15 | **done** 2026-11-22: a working version of each (see the Part B sections below) |
| Slide typography pairings | **done** 2026-11-22 (see "Slide typography" below) |

## Model decision (2026-11-21, supersedes "all tiers on claude-fable-5-2")

The user does not want to pay for the Anthropic API or OpenRouter credits. FLUXA uses **free OpenRouter models**: main `nvidia/nemotron-3-ultra-550b-a55b:free`, then `baidu/ernie-5.5-flash-preview:free`, `nvidia/nemotron-3.5-super-vl:free`, `google/gemma-4-31b-it:free`, and `openrouter/free` as the last resort. Picked by a live outline benchmark (best titles, valid JSON, about 14 s). All three top models make tool calls correctly.

Fixes made with the switch (`app/ai/openrouter_provider.py`): reasoning-token headroom (+4096) so the JSON answer isn't cut off, the reasoning trace is no longer parsed as the answer, a 90 s timeout per request, and a log line for each model that fails.

Found while checking research (still open):
- Live web search is broken. `research_tools.web_search` scrapes DuckDuckGo HTML and gets 0 results, so research falls back to the model's memory or to hard-coded domain facts. Citations are Google Scholar *search* links, not real sources, and the numbers in outlines are not verified.
- The "MCP-compatible" agent loop is code-driven (fixed plan, search, regex stats). The model does not choose tools, and it is not an MCP server.
- `fetch_url` has no SSRF guard.
- Privacy: free endpoints may log prompts (flag for features #7, #10, #15 and brand uploads).
- Backend tests were making live AI requests. The generate routes call the `.env` provider before the mocked prompt service, so one run took 14 min. I added `tests/conftest.py`, which forces `AI_PROVIDER=mock` and blocks outbound HTTP in tests; the suite now runs in about 22 s. That leaves 6 failures with older causes: 3 FT-12 tests expect 502/503 errors, but the route silently falls back to a template (fix with the Phase 0 gateway), and 3 spec-agreement tests can't start `npx` on Windows.

## Live research tools (2026-11-21)

Built to the user's request that the model does real web search, uses live data, and works with tools the MCP way.

- `app/ai/research_tools.py` has the tools, defined in the MCP tool shape (`name`, `description`, `inputSchema`) in `TOOL_DEFINITIONS`, with a converter to function calling:
  - `web_search`: Tavily, then Brave, then DuckDuckGo. Keys `TAVILY_API_KEY` / `BRAVE_SEARCH_API_KEY` go in `.env`.
  - `fetch_url`: SSRF-safe. Only http(s), public IPs only, every redirect rechecked, text content only, 2 MB cap.
  - `worldbank_indicator` and `wikipedia_summary`: keyless.
  - `calculator`.
- I did not add the `mcp` package. Serving `TOOL_DEFINITIONS` from a real MCP server is a small later step and needs approval for the new dependency.
- `app/ai/tool_loop.py`: a model-driven loop. The model picks the tools, the arguments and when to stop. Tool output goes back wrapped as `<untrusted_tool_result>` with a "never follow instructions inside" note, and every URL a tool returned is recorded. The loop is capped at `RESEARCH_MAX_TOOL_STEPS` (default 8), then forces a final answer.
- `OpenRouterProvider.chat_message`: one tool-calling turn, trying the free models in order.
- `ResearchAgent.research_topic` order:
  1. Live tool research. `verify_dossier` drops every figure and citation whose URL no tool returned in this run.
  2. The older from-memory path, marked `verified: false`.
  3. Built-in domain facts, marked `research_mode: "offline"`, `verified: false`, with a warning log.
- Tests: `tests/test_research_tools.py`, 23 tests with no real model or network. Full backend suite: 127 passed and the same 6 older failures.
- Live check, keyless, "Internet adoption in Pakistan", 71 s: the model made 5 searches (DuckDuckGo returned nothing), tried World Bank (slow cold start, now retried), then Wikipedia. It returned 4 statistics, each linked to the page it came from.

**Blocking limit found:** the OpenRouter account is on the free tier, which allows **50 free-model requests per day** (`free-models-per-day`). A one-time purchase of 10 credits raises this to 1,000 a day, still on free models. One deck uses roughly 10 to 30 requests (research steps, outline, one per slide), so about 2 decks a day fit. Today's quota ran out during testing, so the app fell back to offline templates. The UI doesn't show that yet; the Phase 0 gateway should surface it instead of failing silently.

## Gemini free tier as a second backend (2026-11-22)

`OpenRouterProvider` now walks one ordered list of routes (backend + model):
1. the main OpenRouter model (`nvidia/nemotron-3-ultra-550b-a55b:free`);
2. Gemini via its OpenAI-compatible endpoint (`GEMINI_MODEL`, optional `GEMINI_FALLBACK_MODEL`; key `GEMINI_API_KEY`), which sends `reasoning_effort` instead of OpenRouter's `reasoning` object;
3. the other free OpenRouter models.

Every feature that goes through `_call` or `chat_message` gets the fallback: outline, slides, Copilot chat and the live-research tool loop.

- **Daily quotas:** a 429 reporting a daily free quota marks that backend exhausted until it resets. For OpenRouter this is the whole account, using the exact `X-RateLimit-Reset` (midnight UTC). For Gemini it is per model. Later requests skip it instead of failing on every model, and when everything is spent the error says so.
- **Invalid JSON:** a reply that isn't valid JSON gets one retry on the next route.
- **Tests:** `tests/test_free_ai_routes.py`, 10 tests. Full suite: 137 passed and the same 6 older failures.
- **Not yet verified live:** no `GEMINI_API_KEY` is set. Once one is added, benchmark the Gemini free models (outline quality, tool calls, speed) and order the routes by the results. The OpenRouter daily limit (50) was still used up at 22:36 UTC on 2026-11-21 and resets at 00:00 UTC.
- **Outcome (2026-11-22):** Google rejected the user's key with "The Gemini API free tier is not available for this project". Eligibility is per Google Cloud project, and a new key in the same project doesn't help; only paid billing does. The user chose **OpenRouter models only**, so `GEMINI_API_KEY` is blank in `.env`. The Gemini code path stays as a dormant option. If a Gemini key is ever set on an ineligible project, the 403 now makes the app skip Gemini for 24 h instead of failing on each request (11 routing tests).

## F1/F2: Sign-in, organisations, roles, tenant isolation (2026-11-22)

**Backend** (`app/auth.py`, wired in `app/__init__.py` and `app/database.py`):
- **Tables:** `users`, `orgs`, `memberships` (role `admin` / `brand_manager` / `employee`), `teams`, `team_members`, `invites`, `audit_log`. `presentations` gains `org_id` and `owner_id`. Migration is in place, with no data loss.
- **Sessions:** a signed cookie (HttpOnly, SameSite=Lax, 14 days), with a new session id on every sign-in.
  - `SECRET_KEY` comes from `.env`. Without it, a random key is generated once into `instance/secret_key` (git-ignored).
  - Set `SESSION_COOKIE_SECURE=True` behind HTTPS.
- **Passwords:** werkzeug hashes, 8 characters minimum, and a lockout of 15 minutes after 5 wrong attempts per email and address.
- **Who owns what:**
  - The first account becomes admin of the "Default organisation" and owns every existing deck.
  - Later sign-ups get their own organisation, unless they come through an admin's invite link (single use, 7 days, optionally tied to one email).
- **Request guard** (`guard_request`, before every `/api` request):
  - Everything needs sign-in except health, auth, public share links, the audience side of live sessions, and images of shared or live decks.
  - Any deck, asset, live session or poll named in the URL must belong to the user's organisation; otherwise the answer is 404.
  - State-changing requests from foreign origins are refused. `TRUSTED_ORIGINS` covers the Vite dev proxy, which rewrites Host but not Origin.
- **Org scoping:**
  - The deck list, create, duplicate and AI-generated decks are scoped to the organisation (the owner is captured before the streamed generation starts).
  - Starting a live session checks the deck's organisation.
  - Deleting a deck requires its owner or an admin.
- **Org API** (`/api/org`): members list, invites (admin), role change and removal (admin, never the last admin), and teams (admin).

**Frontend:**
- `AuthProvider`, `RequireAuth` and `safeNext` (no open redirects) live in `src/auth/AuthContext.tsx`.
- `/login` (`SignInPage.tsx` + `signin.css`, in the landing page's theme by request) offers sign in, create account, and invite links.
- App routes (workspace, create, editor, presenter, print) need sign-in. Landing and shared viewer links stay public, and the deck list loads only when someone is signed in.
- `api.js` sends people to `/login?next=…` on a 401.
- The workspace header has a "Sign out" button.

**Tests:**
- Backend: `tests/test_auth.py` (11). `tests/conftest.py` signs older tests in automatically. Suite: 149 passed, with the same 6 older failures.
- Frontend: `src/test/SignIn.test.jsx` (6), and `mockApi` defaults to a signed-in account. Suite: 65 passed, with the same 8 older failures.
- Browser-checked: redirect to sign-in, a real wrong-password error, mobile at 375 px, and the landing page making no private calls.

**Not done:**
- No account was created in the real database, because the first sign-up claims all existing decks and that should be the owner.
- No admin UI for members, invites or teams yet (API only).
- `brand_manager` permissions take effect with Part C.
- Raw `fetch` calls in the editor don't redirect on 401 mid-session (the route guard covers page loads).

## F3: AI gateway, free-model version (2026-11-22)

`app/ai/gateway.py` is a thin layer over the free-model router, adapted from PERFORMANCE.md D2 to OpenRouter free models.
- **Sessions:** every AI feature runs in `gateway.session(feature, org, user, db)`. JSON routes use `@gateway.feature("…")` (outline, Copilot chat, slide enhance). Streamed deck generation opens its session inside the generator.
- **Effort per feature:** the provider sends `reasoning.effort` from `FEATURE_EFFORT`: high for outline/deck, medium for research/slides, low for Copilot chat and enhance. Quick edits no longer spend reasoning tokens.
- **Usage log:** every model attempt goes into `ai_usage` (org, user, feature, route, effort, tokens, ms, status). `GET /api/org/ai-usage?days=N` (admin) summarises it per feature. No admin UI, by request.
- **Honest fallbacks:**
  - `mark_fallback(reason)` is called wherever template content replaces model output: provider outline/slide/chat fallbacks, designer templates, research from memory or offline, and the agent-loop placeholder.
  - JSON responses carry `"ai": {"mode": "live"}` or `{"mode": "fallback", "reasons": [...]}`, and streamed generation adds it to the `done` event.
  - `/create` shows a notice when the outline is a template.
  - `/api/ai/status` reports quotas that are used up and when they reset.
- **Cache:** outlines are cached per organisation for 24 h (`ai_cache`, key `org:feature:sha256(inputs)`). Template results are never cached, and nothing is shared across organisations. This also saves free daily quota.
- **Tests:** `tests/test_gateway.py`, 9 tests. Backend suite: 158 passed and the same 6 older failures. Frontend: 65 passed and the same 8.
- **Checks:**
  - Live, with the quota used up: the outline returned in about 1 s, clearly labelled as a template, with the one rate-limited call logged.
  - Browser, on a throwaway database: sign up → /create → outline shows the notice.

**Not in this step:**
- Server-side cancellation of a running generation.
- Real token streaming for the outline.
- Per-org rate limits.
- Structured outputs: OpenRouter free models don't support them reliably, so `extract_json` stays.

## F4: Prompt and AI-role registry (2026-11-22)

`app/prompts/registry.py` holds the live prompts:
- **Roles:** `researcher`, `designer`, `slide_designer`, `strategist`, `copilot`, plus `storyteller`, `critic`, `coach`, `audience_persona` and `debate_panel` for the Part B features.
- **Prompts** (each `Prompt(id, version, role, rules, user, untrusted, max_tokens)`): `research.tools`, `research.memory`, `designer.outline`, `designer.slide`, `agent.plan_queries`, `agent.structure_outline`, `copilot.ops`.
- **Rendering:** `render(id, **values)` returns (system, user).
  - The system part is the role persona, then the fixed rules and output schema, then the untrusted-data note. It contains no request values, so it's identical across requests (stable cache prefix).
  - The user part is a `string.Template` of the request values. Values that can carry outside text (web research summaries and stats, agent-loop findings, slide content in Copilot) are wrapped in `<untrusted_data>` with closing tags neutralised.
  - Before this, web research text was pasted straight into the instructions, which was a prompt-injection path.
- **Calling:** `call_prompt(provider, id, **values)` renders, calls `provider._call` with the prompt's `max_tokens`, and tags the gateway session.
  - `ai_usage.prompt` now records `id@vN` for every model call.
  - Bump `version` whenever prompt text changes.
- **Migrated, rules text kept word for word:** the designer outline and slide prompts, research (live tools and from memory), agent-loop query planning and outline structuring, and Copilot chat ops. Only the per-request data lines moved into the user part, and the schema's inline title and citations became references to them. The legacy fallback services (`app/prompts/outline.py` etc. via `prompt_service`) are unchanged.
- **Tests:** `tests/test_prompt_registry.py` (7). Every prompt renders, the system part is stable, missing values fail, untrusted data is wrapped and can't close its block, duplicates and unknown roles are rejected, `call_prompt` logs the version, and the designer outline goes through the registry. Backend suite: 165 passed and the same 6 older failures.
- **Not yet verified live:** the free quota was still used up at 23:36 UTC (resets 00:00 UTC). Next step: run one live outline and Copilot edit to confirm output quality with the reorganised prompts.

## F6: Design tokens and brand store (2026-11-22)

- **Token schema:** `app/brand/tokens.py` (`BrandTokens`, schema version 1). The generated JSON Schema is `shared/brand/brand.schema.json`; regenerate it with `python -m app.brand.tokens`, and a test fails if it drifts.
  - Colours and typography are typed strictly: hex colours, at least 6 chart colours (or none), and plain font names only, because they end up in CSS.
  - `logo`, `header`, `footer`, `legal`, `layouts`, `charts`, `imagery` and `language` are accepted as objects for now and get full types with Part C.
  - Size cap 64 KB. Unknown keys are rejected.
  - Superset note: `colors.accent` was added next to primary and secondary.
- **Mapping to the theme:** `to_theme_overrides(tokens)` maps primary, secondary and accent, then `neutrals[0..2]` to bg, text and muted, plus the chart colours, the heading and body fonts, and `scale.title`. Only keys the brand sets are sent; everything else keeps the deck theme's value.
- **Tables** (`app/brand/store.py`, every query takes `org_id`):
  - `brands`, `brand_versions` (immutable once active), `brand_audit`.
  - `presentations` gains `brand_id` and `brand_version_id`.
  - Sources, extractions, fonts, access and departments arrive with C1, C7 and C9.
- **API** (`app/brand/routes.py`):
  - `/api/brands`: list (any member) and create.
  - `/api/brands/<id>`: get, rename, archive.
  - `/api/brands/<id>/versions`: new draft version.
  - `/api/brands/<id>/versions/<vid>`: edit tokens, drafts only (409 once active).
  - `/api/brands/<id>/versions/<vid>/activate`: activate. Rollback means activating an older version.
  - `PUT /api/presentations/<id>/brand {brand_id | null}`: apply or remove a brand on a deck.
  - Only admins and brand managers can create, edit, activate or archive. Employees can list brands and apply an active one; `brand_access` limits come with C9.
  - Another organisation's brand answers 404 everywhere.
- **Decks:**
  - Applying a brand pins its current active version, so a later version never silently changes a deck (opt-in migration is C8).
  - Archived brands can't be newly applied, but decks already using one keep rendering.
  - Duplicates keep the brand.
  - The deck, update and public share responses carry `presentation.brand = {id, name, versionId, version, tokens, themeOverrides}`, or `null`.
- **Renderer:**
  - `resolveDeckTheme(themeId, brand)` in `rendering/themes.ts` is used by the editor, presenter, print, share viewer and the PPTX/HTML exporters.
  - No brand returns exactly `getTheme(themeId)`.
  - A branded theme carries `brandId`, so `SlideStage` paints the brand background (dark or light detected by luminance) instead of the built-in dark canvas, which ignored the theme background before. Unbranded decks are unchanged.
  - `getThemeCssVariables` now merges overrides one level deep, so a partial `colors` keeps the chart colours. No caller passed overrides before.
- **Tests:**
  - `tests/test_brand_store.py` (18): schema, mapping, rejections, lifecycle and pinning, immutability, roles, cross-org 404s, share, audit.
  - `src/rendering/themes.test.ts` (7).
  - Backend: 183 passed and the same 6 older failures. Frontend: 72 passed and the same 8. Typecheck and build are clean. Lint has no new issues; the 4 `prefer-const` errors in `SlideStage.tsx` (`rawX`..`rawH`) were already there.
- **Browser check** on a throwaway database: a brand with a cream background and Georgia headings rendered on the editor slide; removing it brought back the original dark slide.

**Not in this step:** a brand UI (the `/brand` pages come with C1), brand fonts as files (the font must be installed or it falls back), logo, footer and lock rendering (C4/C5), and generation using the brand (C2).

## F12: Background jobs (2026-11-22)

**Change from the plan: SQLite queue instead of RQ + Redis.**
- Redis isn't installed, and RQ's worker needs `fork()`, which Windows doesn't have.
- The queue is a `jobs` table plus worker threads, with no new dependencies.
- Features only use `job_handler`, `enqueue` and the job context, so a Redis/RQ backend can replace `app/jobs/queue.py` before a multi-server deployment without touching features.

- **Writing a job** (`app/jobs`):
  - `@job_handler("kind", max_attempts=1, timeout_s=900)` registers `fn(ctx, payload) -> result`.
  - `enqueue(db_path, kind, payload, org_id=, user_id=, idempotency_key=)` queues it. Payloads are capped at 256 KB (store files and pass ids) and results at 1 MB.
  - Inside a handler, `ctx.progress(fraction, stage, message)` reports progress and doubles as the cancel/time-limit checkpoint.
  - Each job runs inside an AI-gateway session (`job.<kind>`), so model usage is logged against the job's org and user.
- **Worker** (`app/jobs/worker.py`):
  - Starts inside the web process: `JOBS_WORKER=1`, `JOBS_CONCURRENCY=2`. Under the debug reloader, only the serving child process runs it.
  - Claiming is one atomic `UPDATE … RETURNING`, so several threads or processes can share the table.
  - Unexpected errors are retried with a delay up to `max_attempts`, and the user sees a generic message (no internals). `JobError("…")` messages are shown as written.
  - Cancellation and time limits are cooperative, because threads can't be killed.
  - A janitor requeues jobs whose worker died (no heartbeat for 2 min), or fails them once out of attempts. Finished jobs are deleted after 30 days.
  - The database now runs in WAL mode, so progress readers and workers don't block each other.
- **API** (`app/jobs/routes.py`):
  - `GET /api/jobs` lists jobs (`?all=1` for admins, `?kind=`).
  - `GET /api/jobs/<id>` returns one job.
  - `GET /api/jobs/<id>/events` is an SSE stream: `progress` on each change, then `done`, a keep-alive every 15 s, and `timeout` after 15 min.
  - `POST /api/jobs/<id>/cancel` cancels.
  - Members see their own jobs and admins see the org's; anything else answers 404. Payloads are never returned. There is no endpoint for creating arbitrary jobs; features enqueue their own.
- **Frontend:** `useJob(jobId)` in `src/jobs/useJob.ts` follows the SSE stream, falls back to polling, and offers `cancel()`. `api.getJob` and `api.cancelJob` were added. There's no UI yet; each feature places its own progress display.
- **Tests:**
  - `tests/test_jobs.py` (16): run and result, retries, safe errors, time limit, cancel (queued and running), dead-worker recovery, no double claims with 4 concurrent claimers, the thread pool draining the queue, AI usage attribution, purge, API visibility across roles and orgs, sign-in, and the SSE stream.
  - `src/jobs/useJob.test.ts` (4).
  - Backend: 199 passed and the same 6 older failures. Frontend: 76 passed and the same 8. Typecheck and build are clean, and lint has no new issues.
- **Live check** (throwaway database, app started with its own workers): a 5-step demo job streamed queued → running 0 / 0.4 / 0.8 → succeeded with its result in 2 s.

**Not in this step:** no feature uses jobs yet (first is F13 ingestion), there's no admin jobs page, and jobs can't be scheduled or repeated.

## F13: File and URL ingestion (2026-11-22)

**Supported:** PPTX, PDF, DOCX, PNG/JPEG/GIF/WebP, SVG, TTF/OTF/WOFF/WOFF2, and public website URLs.

**Pipeline** (`app/ingest`):

1. **Upload:** `POST /api/uploads` (multipart `files`, at most 30, with `area` = `general` | `brand`). Each file is streamed to `instance/uploads/{org}/tmp/` and hashed. Requests are capped at 300 MB (`MAX_CONTENT_LENGTH`) and files at 50 MB.
2. **Type from bytes** (`sniff.py`): magic bytes; Office files are recognised by their zip parts. Macro files (`.pptm`/`.docm`), old binary `.ppt`/`.doc`, plain zips and anything unknown are refused at upload with a clear message. The browser's MIME type and the file extension are ignored.
3. **Per-type size limits:** PPTX, PDF and DOCX 50 MB; images 10 MB; fonts 5 MB; SVG 2 MB. Identical files already accepted in the same org and area are reused, not re-processed.
4. **Background job** `ingest.file` (F12) runs the checks and extraction in a **separate process** (`sandbox.py`):
   - It's killed after 90 s and gets a stripped environment, so it can't see API keys.
   - It never imports the Flask app or reads `.env`.
   - A parser crash or hang can't take the server down.
5. **Guards** (`guards.py`):
   - Zip-bomb checks: entry count, total unpacked size, and compression ratio per entry over 100:1.
   - Office files with unsafe or absolute internal paths are refused.
   - Encrypted PDFs and encrypted zip entries are refused.
   - Image pixel limit of 60 MP (decompression bombs).
   - Fonts must parse.
   - **SVGs are rebuilt with defusedxml:** no DTDs or entities, an allowlist of drawing elements, and no scripts, `on*` handlers, `foreignObject`, external `href`s or CSS `url()`. The cleaned file is what gets stored.
6. **Extraction** (`extract.py`, deterministic, no AI):
   - PPTX: theme colours and fonts, colour and font usage, layouts, slide size, footer text, slide text and notes.
   - PDF: page count, title, fonts, text from the first 60 pages.
   - DOCX: text, style fonts and colours.
   - Images: size, alpha, dominant colours.
   - SVG: colours, size, text.
   - Fonts: family, weight, licence text and URL, and `fsType` embedding rights (installable, editable, preview/print, restricted). Non-embeddable fonts are marked.
   - Everything uses one result shape with `colors`, `fonts`, `text` and `meta`.
7. **Untrusted text:** extracted text is data only. Anything that later sends it to a model must use `wrap_untrusted`. Text that reads like instructions to an AI sets `injection_suspected` on the upload so the review screen can flag it.
8. **Stored** at `instance/uploads/{org}/{area}/{sha[:2]}/{sha}.ext`, outside the web root. `GET /api/uploads/<id>/file` serves only ready files, with `nosniff` and a sandboxing CSP; non-images download as attachments.

**Websites** (`web.py`, job `ingest.url`, `POST /api/uploads/url`):
- Uses the SSRF-safe fetcher now shared with the research tools (`research_tools.safe_get`): every redirect hop is checked against private, loopback, link-local, metadata and non-http addresses.
- Honours robots.txt, uses a generic user agent, 10 s timeouts, a 5 MB page cap and at most 3 stylesheets of 1 MB each, and never runs scripts.
- Reads the title, description, `theme-color`, CSS custom-property colours, colour frequency, `@font-face` and `font-family` declarations, the `og:image` URL, icons and logo-image candidates (URLs only, not downloaded), and visible text.

**Access:**
- The `brand` area is for admins and brand managers.
- Members see their own uploads; admins see the org's, and brand managers see the brand area.
- Anything else answers 404, including the file route and delete.

**Libraries** now pinned in `requirements.txt`: python-pptx, pypdf, Pillow, fonttools and defusedxml (all MIT, BSD or PSF, and already installed). **pdfplumber is not used:** it isn't installed, and pypdf covers text and fonts. PDF colour extraction is left to C1 (vision on rendered pages). PyMuPDF stays excluded (AGPL).

**Frontend:** `api.uploadFiles`, `ingestUrl`, `listUploads`, `getUpload` and `deleteUpload`; follow progress with `useJob(upload.jobId)`. The upload wizard UI is C1.

**Tests:**
- `tests/test_ingest.py` (21), using generated PPTX, PDF, PNG, TTF and SVG files plus hostile ones: zip bomb, path traversal, macro deck, encrypted PDF, an EXE named `.pdf`, an XXE SVG, a scripted SVG, and injection text. Also covered: the sandbox gets no secrets, a hung parser is stopped, robots.txt, private addresses, and API visibility, duplicates, rejection and URL jobs.
- `src/test/uploadsApi.test.js` (2).
- Backend: 220 passed and the same 6 older failures. Frontend: 78 passed and the same 8. Typecheck, build and lint are clean.

**Live check** through the running app on a throwaway database:
- A PNG logo gave `#0A3D91` and `#F2A900`.
- An SVG with `onload` and `<script>` was stored without them.
- An EXE named `guide.pdf` was refused at upload.
- `https://example.com/` was read (title "Example Domain", colours `#EEEEEE` and `#222222`).
- `http://169.254.169.254/…` was refused.

**Not in this step:**
- An OS-level memory cap on the parser process: Windows has none in the standard library, so the size, pixel and zip guards bound memory instead.
- A virus scanner: ClamAV isn't installed; it can be added as one more guard.
- Downloading logo images found on websites.
- The C1 wizard and AI extraction.

## F15: Consent and privacy (2026-11-22)

- **Consent records** (`app/privacy/store.py`, table `consents`):
  - Each record holds who (user or live participant, by id only, never a name), purpose, scope (for example `{"languages": ["ur"]}`), session, notice version, `granted_at` and `revoked_at`.
  - Append-only: withdrawing stamps `revoked_at`, and granting again keeps the old row as history.
  - Purposes: `audience_participation` (attendees), plus the speaker purposes `voice_translation`, `voice_clone`, `transcript_storage` and `mic_capture` for #10 and #15.
- **Audience notice on join:**
  - The existing join dialog in `ShareViewer` now shows the notice: what is shared, the retention period, and how to delete. It comes from `GET /api/privacy/notice?session_id=` (public, versioned).
  - `POST /api/live/sessions/<id>/join` now requires `accept_notice: true` with the current `notice_version` (400 `notice_required` otherwise) and records the consent. Names are capped at 60 characters.
- **Attendee self-erase:**
  - A Privacy button in the live bar opens a panel with the notice and **Delete my data**.
  - `POST /api/privacy/participant/erase` (public; needs both the participant id and the session id) deletes the attendee's name, votes and comments and withdraws their consent.
  - The panel then offers "Join again" instead of reopening the join dialog.
- **Speaker consent gate:**
  - `@consent_required(purpose, needs=...)` refuses a feature route with 403 `consent_required` unless the signed-in user has an active consent covering the scope (for example the language being translated).
  - API: `GET/POST /api/privacy/consents` (`confirm: true` required; voice purposes must list languages) and `DELETE /api/privacy/consents/<purpose>`.
  - Withdrawing runs cleanup hooks registered with `@on_revoke(purpose)`, so #10 deletes the voice model there.
  - Grants and withdrawals go to `audit_log`.
- **Retention:**
  - `org_privacy` stores each org's `audience_retention_days` (default 30, range 1 to 365) and `store_transcripts` (default off). `GET/PUT /api/privacy/settings` (PUT is admin-only). No admin UI, by request.
  - A daily job (`privacy.retention`) deletes audience votes, comments and participants older than each org's period. It uses a new periodic-job hook in F12 (`register_periodic`, queued by the worker's janitor once per interval). System jobs run under org id 0, so no one sees them through the jobs API.
- **Tests:**
  - `tests/test_privacy.py` (9): notice required and recorded, org retention in the notice, self-erase with session match, consent scope, replace and withdraw, cleanup hooks, the gate with language scope, per-person isolation, admin-only validated settings, and the retention job.
  - `src/test/ShareViewerPrivacy.test.jsx` (2): the join sends the notice version; delete clears the data and offers "Join again".
  - One older test updated for the new join rule.
  - Backend: 229 passed and the same 6 older failures. Frontend: 80 passed and the same 8. Typecheck and build are clean, and lint has no new issues.
- **Browser check** (throwaway database):
  - The join dialog showed the notice with the org's 14-day period.
  - Joining recorded the consent.
  - Privacy → Delete my data removed the attendee and withdrew the consent, then offered "Join again".

**Not in this step:**
- Consent screens for voice and transcripts, which come with #10 and #15 and use the gate.
- A privacy policy page.
- Admin settings UI.
- Retention for uploads and AI usage logs.

## Topic-matched 3D models (2026-11-22)

The 12 built-in procedural scenes (globe, DNA, city…) were picked by keyword lists, so a heart slide could only get the generic "medical" scene.

- `app/ai/model_library.py` searches **Sketchfab's public library** (no API key needed for search and embedding). Results are ranked by how well the model name and tags match the query, then by likes. Age-restricted and very heavy models are skipped, and results are cached for 6 h.
- **Generation** (`compiler.py`): on media slides within the 3D budget (2 to 3 per deck, never consecutive), the query is the deck topic plus the slide's subject, then the topic alone. Each slide in a deck gets a different model. The block stores `sketchfab = {uid, name, author, license, thumbnail, viewerUrl, query}`. If there's no match or no network, the built-in scenes are used as before.
- **Rendering** (`SketchfabEmbed.tsx`): Sketchfab's own viewer in an iframe (drag to rotate, scroll to zoom) with the author and licence credit. Thumbnails, print and export show the model's still image instead of a live viewer.
- **Editor:** "Find a 3D model" in the image block inspector searches the library and applies a pick (`GET /api/ai/models3d/search?q=`). There's also "Remove 3D model".
- **Needs internet** while presenting (the viewer streams from Sketchfab).
- **Tests:** `tests/test_model_library.py` (5). Checked in the browser: searched "human heart" in the editor, picked "Realistic Human Heart", and the slide showed the rotatable model with its credit.

## Copilot fixes (2026-11-22)

"Copilot only does part of what I ask" had several causes, the biggest outside Copilot itself:

1. **Edits to AI-generated decks never saved.**
   - The generator wrote dataset columns as `{name, type: "string"}`, but the schema needs `{label, type: "text"}`. It also kept research notes inside `datasets` and `variables`. So every deck save returned 422.
   - Generated slides failed the strict slide schema: missing `order`, `background` without a colour, `citation` blocks, newer layout names, text KPI deltas. So every slide save returned 422 too.
   - Autosave ignored these errors, so changes showed in the editor and vanished on reload.
   - Fixed:
     - The generator now writes valid columns (`compiler.py`).
     - The deck save repairs old datasets (`normalize_datasets`) and validates only real datasets and variables.
     - The slide save keeps the strict check but falls back to a structural one (`check_slide_spec`): an id and a renderable type on each block, numeric sizes, positive width and height.
2. **Text edits were invisible.** Copilot set `text`, but text blocks show bullets, then rich text (`doc`), then `content`. `applyTextChange` in `opsEngine.ts` now writes the displayed field and rebuilds `doc` (the server requires it).
3. **Copilot couldn't see the slide.**
   - Before: it got only block `props`.
   - Now (`summarize_block`): each block's visible text, chart labels and values (from its dataset when the chart is bound), position and size.
   - Also a deck outline with every slide's id and text blocks, so it can edit other slides and add slides.
4. **Prompt v2** (`copilot.ops@v2`): split the request into every change and return an op for each, in order. The message lists the changes as numbered lines and says plainly what couldn't be done. Adds resize/move, editing another slide, and adding a slide. `max_tokens` raised from 1,400 to 3,000.

**Live checks (real model):**
- A 4-part request (title, 3 bullets, donut chart, notes) returned 4 correctly targeted ops.
- A cross-slide request (rename slide 5, enlarge chart, add a final slide) returned all 3.
- In the editor on a copy of the DB: a 3-part request, then Apply, then reload; title, subtitle and notes all persisted.

**Panel look:** the Copilot panel now uses the landing page palette on a light surface: white panel, light grey assistant bubbles, the robot's pink for user messages, the send button, the avatar and accents (deeper `#B4456C` for text on white), and periwinkle `#AEBFFF` on change cards. Font is IBM Plex Sans; the runtime Google Fonts import is removed. Also removed: the vendor badge ("OPENROUTER") and a hardcoded "Slide 3 updated" label.

**Tests:** `tests/test_generated_deck_saves.py` (4) and `src/editor/store/__tests__/opsEngineText.test.ts` (4).


## Part B: #1 Audience Twin and #4 Debate Mode (2026-11-22)

- **Editor:** a new **Rehearse** tab (`RehearseInspector.tsx`) with "Audience questions" (editable personas, up to 4) and "Stress test" modes. Results link to their slides.
- **Backend:** `app/ai/deck_features.py` (`features_bp`), routes `POST /api/presentations/<id>/ai/rehearse` and `/ai/stress-test`.
  - One model call per use, using a compact deck digest.
  - If the AI is unavailable or the quota is used up, the route returns 503 `ai_unavailable` with a plain reason. No template content.
- **Prompts:** `app/prompts/features.py` registers `rehearse.audience@v1` and `rehearse.debate@v2`. v2 forbids invented studies or numbers in counter-arguments.
- **Live-checked on deck 99:** specific persona questions, and challenges tied to slides.
- **Not yet:** automated tests and a browser click-through.
- **Next:** #11 Co-Author roles (role picker in Copilot; the role passes as a prompt rule), then #2, #8, #13, #14, #7.

## Part B batch 1 complete (2026-11-22): #1, #2, #4, #7, #8, #11, #13, #14

All features use one model call per use through the prompt registry (`app/prompts/features.py`) and the routes in `app/ai/deck_features.py`. When the AI is unavailable they return 503 `ai_unavailable` (no template content).

| # | Feature | Where | How |
|---|---|---|---|
| 1 | Audience Twin | Editor → Rehearse → Audience | Up to 4 personas; questions, confusing slides, weak arguments, each linked to its slide |
| 4 | Debate Mode | Rehearse → Stress test | Challenges ranked by risk with counter and evidence needed; v2 prompt forbids invented studies or numbers |
| 2 | Time Machine | Rehearse → Time Machine | "I have N minutes" plan (keep or skip, minutes, a line per slide, a bridge line); always keeps the first and last slide; **Hide skipped slides** / **Show all slides again**. Present mode now skips hidden slides |
| 11 | Co-Author roles | Copilot role chips | Researcher, Designer, Storyteller, Critic, Coach; the role is a rule in `copilot.ops@v3` |
| 8 | Live Demo Generator | Insert → Demo | AI writes HTML/CSS/JS on a new slide in the existing sandbox (no network, CSP). Server strips fetch/storage/remote scripts. The sandbox now receives the slide's theme colours |
| 13 | Decision Rooms | Insert → Decision | Question plus 2 to 4 options; each option's consequences and risk are projected once; adds a comparison slide; vote with a live poll |
| 14 | Visual Memory | Rehearse → "Open visual recap", `/map/:id` | Concept map (SVG), numbers to remember, takeaways; cached per deck version |
| 7 | Ask Anything | Share/live viewer → "Ask about this deck" | Public on shared decks only; answers only from the deck with slide links; rate-limited (1 question per 5 s per person, 60 per deck per hour) |

**Fixes found along the way:**
- **New slides were never saved:** autosave only updated existing slides. It now creates new slides, deletes removed ones and saves the order.
- **Drag-to-reorder called a route that doesn't exist** (`PUT /reorder`).
- **A save queued during another save sent a stale revision,** causing false "conflicting changes" prompts.

**Tests:** `tests/test_deck_features.py` (10). Backend: 248 passed and the same 6 older failures. Frontend: 85 passed and the same 7.

**Browser check** (copy of the DB):
- A decision room was added and the new slide reached the server.
- A demo (ROI payback calculator) rendered in the sandbox and saved with no conflict prompt.
- The recap page rendered 10 concepts, 6 numbers and 3 takeaways.
- Ask Anything answered from the deck with slide links.
- The Rehearse tab shows all three modes.
- The Time Machine and Audience flows were live-tested through the API, not clicked through.

**Remaining:** #3 Audience-Controlled, #5 Instant Recovery, #9 Presentation Memory, #12 Live Data Injection, #6 Slide-to-Video, #10 Translation + Voice, #15 Autopilot.

## Part B batch 2 complete (2026-11-22): #3, #5, #9, #12 (no AI calls)

| # | Feature | Where | How |
|---|---|---|---|
| 3 | Audience-Controlled | Present mode while live → **Let the audience choose** | Live poll "What should we cover next?" with the next 4 slides; live tally; **Go to the winner** closes the poll and jumps there. Deterministic, no AI (`AudienceChoice.tsx`) |
| 5 | Instant Recovery | Present mode → **Other device** | QR code and link to `/presentations/:id?view=edit&present=1&slide=…`, which opens present mode on the same slide on any signed-in device; edits are already autosaved (`ResumeElsewhere.tsx`) |
| 9 | Presentation Memory | Insert → **Reuse** | Ranked keyword search (TF-IDF) over slides of the org's other decks (`GET /related-slides`); picking one copies it in with fresh ids and its chart datasets (renamed on clash); the deck's theme applies. Org-scoped, never cross-tenant |
| 12 | Live Data Injection | Data tab → **Live data source** | Public CSV/JSON link fetched through the SSRF-safe fetcher (`POST /datasets/live-refresh`, 1 MB, 500 rows); columns matched by key or label; numbers parsed ("1,200", "55%"); charts bound to the dataset update. The link is remembered (`liveSource`) for one-click refresh |

**Tests:** 2 more in `tests/test_deck_features.py` (related slides with org isolation; live data with CSV, JSON, no-match and blocked address). Backend: 250 passed and the same 6 older failures. Frontend: 85 passed and the same 7.

**Browser check** (copy of the DB):
- Reuse on the smog deck found smog slides from other decks, and the copied slide saved.
- Live vote showed the next-slide poll to the audience, and "Go to the winner" jumped from 2 to 3.
- "Other device" showed the QR code, and the resume link opened present mode on slide 3.

**Not in this pass:**
- Voice commands for #12. Connectors needing sign-in (Google Sheets OAuth etc., F14). Live data refreshes on click, not automatically during a talk.

**Remaining heavy features:**
- #6 Slide-to-Video (needs TTS plus headless rendering and ffmpeg).
- #10 Translation + Voice (needs server speech-to-text and TTS).
- #15 Autopilot (speech alignment).

## Part B heavy three + voice commands (2026-11-22): #6, #10, #15 (browser-native, no new installs)

Decisions (user): browser-only video; AI (OpenRouter) for caption translation.

- **Speech engine** (`presenter/speech.ts`):
  - Chrome/Edge Web Speech API, continuous, restarts itself after pauses.
  - Starts only after the presenter's F15 `mic_capture` consent. The prompt says that Chrome processes audio with Google's speech service.
  - A visible "Listening" state and a "Heard: …" line.
- **Voice commands in present mode** (`presenter/voiceCommands.ts`, `PresenterVoice.tsx`). This answers the "ask the AI while presenting" request:
  - "next slide" / "go back" / "go to slide 5" / "last slide": local, instant.
  - "I have 5 minutes left": the Time Machine plan; skipped slides are hidden **for this talk only** (the deck is untouched); the bridge line is shown.
  - "show (me) a 3D model of a heart" / "show the jet engine in 3D": Sketchfab search, full-screen live model overlay.
  - "demonstrate a compound interest calculator": the AI demo in a full-screen sandboxed overlay.
  - "back to the slides" or Esc closes the overlay. Ordinary talk is ignored (tested).
- **#15 Autopilot:** a toggle while listening. It advances when the rolling transcript contains enough of the next slide's distinctive keywords (title, text, notes; 2 or 3 hits), with a 4 s cooldown. Arrow keys always override. No AI per sentence.
- **#10 Live captions + translation:**
  - The presenter's **Captions** toggle (live sessions) sends finished sentences with the host token (`POST /api/presentations/live/<session>/captions`). They are kept **in memory only** (last 60 lines), never stored.
  - The audience picks a language in the viewer (Urdu, Arabic, Hindi, Spanish, French, German, Chinese, Turkish, or English original) (`GET …/captions?lang=`, public).
  - New lines are translated in one batched AI call per language, at most every 2 s, and cached per line and language, so many viewers cost the same as one.
  - Urdu and Arabic are right-to-left, with Naskh fonts. "Machine-translated" label. Optional **Read aloud** with the browser voice.
  - Voice-preserving translation is not built (needs a paid voice service and recorded consent).
- **#6 Slide-to-Video** (`/watch/:id`, linked from Rehearse):
  - One AI call writes 2 to 4 spoken sentences per slide (`narration.script`, cached per deck version).
  - **Narrated playback:** the browser voice reads it sentence by sentence, with captions and auto-advance; the voice can be chosen.
  - **Download captioned video:** each slide is captured (html-to-image) and recorded with MediaRecorder as VP9 WebM, narration burned in as subtitles. Browsers can't record their own speech output, so **the file is silent**. A narrated MP4 would need edge-tts and ffmpeg (declined for now).
- **Fix:** feature results now use the editor's slide ids (`slide-<db id>`), so Rehearse slide links and Time Machine skips match generated decks too.
- **Tests:**
  - 2 more backend tests (captions host-only, translated once and cached, bad language; narration fallback and cache).
  - `presenter/voiceCommands.test.ts` (5).
  - Two route-splitting test waits lengthened.
  - Backend: 252 passed and the same 6 older failures. Frontend: 90 passed and the same 7.
- **Browser check:**
  - Narrated playback spoke the AI script with captions.
  - VP9 recording and slide capture are supported.
  - Live captions arrived in Urdu, right-to-left and labelled.
  - The Voice and Other device buttons are present in present mode.
  - **Not tested here:** live microphone recognition and Autopilot. The browser pane has no microphone and needs the consent click, so test in Chrome with a mic.

**All 15 Part B features now have a working version.**

## Slide content check (2026-11-22, live)

A real 6-slide deck ("Electric vehicle batteries: cost and recycling") was generated through the app pipeline.

- **AI outline:** topic-specific and good ("Battery pack prices plunge 14% to $139/kWh…"). It was labelled unverified because live web research found nothing: DuckDuckGo returns no results from this machine and no Tavily/Brave key is set.
- **The free OpenRouter quota then ran out mid-test.** The slides fell back to templates and reproduced the "hardcoded" look:
  - generic jargon titles ("Annual Implementation Progression & Scale Velocity");
  - the same three bullets on three slides;
  - another topic's words ("Clinical Deployments"; a smog comparison with AQI and crop fires in every deck);
  - bullets cut with "…".

**Fixes:**
1. **Generation now uses the outline the user reviewed.** It used to re-run the research agent and replace the reviewed outline, and when the AI was unavailable the replacement was the generic template, which is why outlines looked "the same on any topic". The extra run also wasted AI requests (`generation_routes.py`).
2. **Template outline titles and purposes are rewritten in plain, topic-based language** (`plain_template_titles`): "How electric vehicle batteries have changed, year by year", the chart's real title, "… today vs. where it's heading", "… in practice", "… strengths and risks", "Next steps for …".
3. **Fallback slides:**
   - Facts rotate by slide, so bullets don't repeat.
   - Text is cut at word boundaries within the 90-character limit (no "…").
   - The comparison is built from the research facts instead of smog-specific lines.
   - The topic-specific template title is removed.

**Tests:** `tests/test_generation_respects_outline.py` (2). Backend: 252 passed and the same 6 older failures (before the new file).

**Still true:**
- AI-written slides need quota: one deck uses about 8 to 12 requests on the free 50/day.
- Live sources need a search key in `.env` (`TAVILY_API_KEY` or `BRAVE_SEARCH_API_KEY`, both have free tiers).
- The AI-written slide path could not be re-checked tonight because the quota was exhausted (resets 00:00 UTC).



## Slide typography (2026-11-22)

- 11 font pairings (`frontend/src/rendering/typography.ts`), chosen per deck independently of the colour theme: Editorial, Classic serif, Geometric, Bold poster, Elegant, Friendly, Condensed impact, Tech, Humanist, Accessible, Urdu/Arabic.
- Stored as `theme.fontPairing`. Order: theme, then pairing, then brand fonts (the brand wins). Changing the colour theme keeps the pairing.
- **Picker:** Design tab → Typography, each option previewed in its own font, plus "Theme default".
- **Auto-pick:** generated decks get a pairing from their topic (`app/ai/typography.py`, keyword rules; Arabic script → Urdu/Arabic; default Geometric). A pairing sent by the client is kept.
- **Font files:** 18 open-licence `@fontsource/*` packages (400/600/700), imported in `rendering/fonts.ts` from `main.jsx`. Bundled, so they work offline; the browser downloads a file only when a slide uses it.
- **HTML export** embeds the deck's two families (regular and bold, Latin or Arabic subset, about 100 KB) as base64, so the file shows the same fonts on any computer. Titles (36 px and up) use the heading font.
- **Not done:** PPTX stores font names only, so PowerPoint shows them only where the fonts are installed. The narrated video's burned-in captions use IBM Plex Sans.

## Microphone and voice in present mode (2026-11-22)

- **In-page consent** dialog (the browser `confirm()` dropped the presenter out of fullscreen). Asked once; stored as the `mic_capture` consent.
- **Microphone check first** (`getUserMedia`): clear messages for no microphone, blocked permission, or another app using it. A five-bar **level meter** on the Voice button shows the mic is hearing you.
- **Recognition errors** are explained (no internet, blocked, unsupported language). After a browser pause it restarts in about 0.1 s. On repeated failures it backs off (1, 2, 4, 8 s) instead of looping.
- **Instant navigation:** "next slide", "go back" and "back to the slides" run on the unfinished phrase, once per phrase. Numbered jumps, time plans, 3D models and demos wait for the full sentence.
- **Spoken language** picker (English US/UK/India/Pakistan, Urdu, Hindi, Arabic), remembered per browser. Commands are English; Autopilot and captions follow the chosen language.
- **"?"** lists what you can say. **V** turns the mic on or off. The transcript line hides after 4 s of quiet.
- **Tests:** `presenter/PresenterVoice.test.tsx` (5) drives a fake SpeechRecognition: instant "next" fires once, "go to slide 3" waits for the full phrase, in-page consent, no-mic message, restart and offline backoff.
- **Not tested here:** a real microphone (the browser pane has none). Try it in Chrome or Edge with internet before presenting.
