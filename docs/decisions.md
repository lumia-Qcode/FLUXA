# FLUXA — Architecture & Dependency Decisions

This log tracks architectural decisions and external package additions. Format: one line per decision (decision, reason) or dependency (name, why, licence).

## Decisions
- 2026-10-20: Root npm workspace structure managing `frontend` and root scripts; allows unified `npm run dev`, `test`, `lint`, and `typecheck` commands across Flask backend and Vite frontend.
- 2026-10-20: ESLint 9 flat configuration with `typescript-eslint` and React hooks plugin; modern standard for typed React development.
- 2026-10-20: Single Fullscreen API portal directly on `document.body`; resolves Defect 1 where transformed parent containers clip `position: fixed` modals.
- 2026-10-20: Neutral color token system (`#F2F2F3`, `#151517`, `#2352F5`); prevents chrome from clashing with diverse presentation slide themes.
- 2026-10-20: Use `xField` for ChartBlock dataset category column; avoids collision with `Box.x` stage pixel coordinate in JSON dictionaries.
- 2026-10-20: Immer inverse patches for linear undo/redo history; allows deterministic state rollbacks and redo stacks with bounded memory footprint (>= 100 steps).
- 2026-10-20: Gesture grouping (`beginGesture` / `commitGesture` / `cancelGesture`) during canvas drag and resize; groups continuous pointer micro-movements into a single atomic undo step.
- 2026-10-20: Pure command recipes (`commands.setDeckTitle`, `commands.addBlock`, etc.); separates state mutation logic from React component lifecycles.
- 2026-10-20: Non-blocking Undo toasts via `useToast()` on slide deletion; eliminates disruptive modal confirms per Section 5.7.
- 2026-10-20: Standard three-panel desktop editor shell (40px top bar, 200px slide rail, flex canvas, 300px inspector); replaces legacy 5-column layout and completely removes `styles.css`.
- 2026-10-20: First-slide live thumbnail rendering in deck cards using `<SlideStage mode="thumbnail">`; satisfies Section 6.5 workspace requirement without server-side rasterization.
- 2026-10-20: Whitelisted AST-based expression evaluation using `jsep`; eliminates `eval` and `Function` constructor while strictly safeguarding against prototype pollution (`__proto__`, `constructor`, `prototype`), unbounded loops, and unauthorized global access.
- 2026-10-20: BroadcastChannel presenter synchronization (`/presenter/:id`); provides zero-latency bidirectional state, build step, and timer synchronization across presentation and speaker-notes windows without server roundtrips.
- 2026-10-20: Sandboxed iframe architecture for HTML widgets with `sandbox="allow-scripts"` and strict CSP (`default-src 'none'`); isolates third-party code while exposing reactive deck variables through a controlled `postMessage` bridge (`fluxa.get/set/on`).
- 2026-10-20: Pre-flattened variable objects for widget runtime; unpacks `{ id, label, value }` variable metadata to raw key-value pairs before bridging to sandboxed iframes.
- 2026-10-20: Single animation runner with `prefers-reduced-motion` compliance; suppresses transition animations and auto-resolves KPI count-ups instantly when reduced motion is preferred.

## Dependencies Added
- `pydantic` (v2.13.4): Presentation specification validation and schema serialization on backend; MIT.
- `ruff` (v0.17.1): High-performance Python linter and formatter; MIT.
- `typescript` (v5.6.3): Strict static type checking for presentation spec, state stores, and UI; Apache-2.0.
- `eslint` (v9.15.0): JavaScript/TypeScript code analysis; MIT.
- `prettier` (v3.4.2): Deterministic code formatting across markdown, json, ts, and css; MIT.
- `@playwright/test` (v1.49.0): End-to-end testing, visual baselines, and cross-browser regression testing; Apache-2.0.
- `concurrently` (v9.1.0): Runs Flask backend and Vite frontend concurrently with unified logging; MIT.
- `@types/react` (v18.3.12) & `@types/react-dom` (v18.3.1): TypeScript definitions for React 18; MIT.
- `@types/node` (v22.10.1): TypeScript definitions for Node.js scripts; MIT.
- `globals` (v15.12.0): Global identifiers definition for ESLint 9; MIT.
- `eslint-plugin-react` (v7.37.2) & `eslint-plugin-react-hooks` (v5.0.0): ESLint rules for React best practices; MIT.
- `zod` (v3.23.8): TypeScript-first schema declaration and validation for presentation spec; MIT.
- `typescript-eslint` (v8.15.0): Tooling for ESLint to support TypeScript; MIT.
- `chart.js` (v4.4.7): Canvas-based reactive charts with native animated data tweens; MIT.
- `react-chartjs-2` (v5.3.0): React 18 component wrapper for Chart.js 4; MIT.
- `lucide-react` (v0.468.0): Geometric, consistent 16px vector icon suite; ISC.
- `immer` (v10.1.1): Immutable document state updates and inverse patch tracking for undo/redo history; MIT.
- `@tiptap/react` (v2.11.5): React renderer for Tiptap rich-text in-place editing; MIT.
- `@tiptap/starter-kit` (v2.11.5): Core rich-text formatting extensions for in-place text editing; MIT.
- `@tiptap/extension-underline` (v2.11.5): Underline text formatting support for Tiptap; MIT.
- `idb-keyval` (v6.2.1): Minimal promise-based IndexedDB key-value store for offline draft persistence; Apache-2.0.
- `jsep` (v1.6.0): JavaScript expression parser producing clean Abstract Syntax Trees without code execution; MIT.
