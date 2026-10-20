# FLUXA — Architecture & Dependency Decisions

This log tracks architectural decisions and external package additions. Format: one line per decision (decision, reason) or dependency (name, why, licence).

## Decisions
- 2026-10-20: Root npm workspace structure managing `frontend` and root scripts; allows unified `npm run dev`, `test`, `lint`, and `typecheck` commands across Flask backend and Vite frontend.
- 2026-10-20: ESLint 9 flat configuration with `typescript-eslint` and React hooks plugin; modern standard for typed React development.
- 2026-10-20: Single Fullscreen API portal directly on `document.body`; resolves Defect 1 where transformed parent containers clip `position: fixed` modals.
- 2026-10-20: Neutral color token system (`#F2F2F3`, `#151517`, `#2352F5`); prevents chrome from clashing with diverse presentation slide themes.
- 2026-10-20: Use `xField` for ChartBlock dataset category column; avoids collision with `Box.x` stage pixel coordinate in JSON dictionaries.

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
