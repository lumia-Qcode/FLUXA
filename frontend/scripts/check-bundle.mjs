// Bundle budget check (D3). Run after `vite build`: `npm run build:check`.
// Reads dist/.vite/manifest.json, works out what each route downloads before it can render
// (its chunk plus every chunk it imports statically), gzips it and compares with the budgets
// in docs/PERFORMANCE.md. Exits 1 when a budget is exceeded.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(readFileSync(path.join(dist, ".vite", "manifest.json"), "utf8"));

const KB = 1024;
// Route entry (manifest key) -> gzip budget for everything it needs at first render.
const BUDGETS = [
  { name: "landing (/)", key: "index.html", budget: 250 * KB },
  { name: "workspace", key: "src/pages/WorkspacePage.tsx", budget: 250 * KB },
  { name: "create", key: "src/pages/CreatePresentation.jsx", budget: 250 * KB },
  { name: "share viewer", key: "src/pages/ShareViewer.tsx", budget: 250 * KB },
  { name: "editor", key: "src/editor/EditorRoute.tsx", chunk: "EditorRoute", budget: 600 * KB },
];

const gz = new Map();
const gzipSize = (file) => {
  if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(path.join(dist, file)), { level: 9 }).length);
  return gz.get(file);
};

function closure(key, seen = new Set()) {
  const entry = manifest[key];
  if (!entry || seen.has(key)) return seen;
  seen.add(key);
  for (const dep of entry.imports || []) closure(dep, seen);
  return seen;
}

const entryKeys = closure("index.html");
let failed = false;
const rows = [];
// A module shared by several pages lands in a chunk named after it ("_EditorRoute-xxxx.js")
// rather than under its source path, so a budget can also name the chunk.
const findKey = (key, chunk) =>
  manifest[key] ? key : Object.keys(manifest).find((k) => chunk && manifest[k].name === chunk && manifest[k].file.endsWith(".js"));

for (const { name, key: wanted, chunk, budget } of BUDGETS) {
  const key = findKey(wanted, chunk);
  if (!key) {
    rows.push({ route: name, "gzip KB": "-", "budget KB": budget / KB, ok: "missing" });
    failed = true;
    continue;
  }
  const keys = new Set([...entryKeys, ...closure(key)]);
  const files = [...keys].map((k) => manifest[k].file).filter((f) => f.endsWith(".js"));
  const css = [...keys].flatMap((k) => manifest[k].css || []);
  const total = [...new Set([...files, ...css])].reduce((sum, f) => sum + gzipSize(f), 0);
  const ok = total <= budget;
  failed ||= !ok;
  rows.push({ route: name, "gzip KB": +(total / KB).toFixed(1), "budget KB": budget / KB, ok: ok ? "yes" : "OVER" });
}
console.table(rows);
if (failed) {
  console.error("Bundle budget exceeded (see docs/PERFORMANCE.md, Budgets).");
  process.exit(1);
}
