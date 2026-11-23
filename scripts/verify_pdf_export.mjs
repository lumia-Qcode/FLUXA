// Export a deck through the print route with headless Chromium and check the PDF.
//
//   node scripts/verify_pdf_export.mjs <presentationId> <outDir>
//
// Needs the dev servers running (Vite on 5173, Flask on 5000) and FLUXA_TEST_EMAIL /
// FLUXA_TEST_PASSWORD for a local account. Writes deck-<id>.pdf plus one PNG per printed page
// (rendered with print media), and prints page count, page size and any block whose content
// overflows its box or the page.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [, , id, outDir = "."] = process.argv;
const base = process.env.FLUXA_URL || "http://localhost:5173";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const login = await context.request.post(`${base}/api/auth/login`, {
  data: { email: process.env.FLUXA_TEST_EMAIL, password: process.env.FLUXA_TEST_PASSWORD },
  headers: { Origin: base },
});
if (!login.ok()) throw new Error(`login failed: ${login.status()}`);

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
const t0 = Date.now();
await page.goto(`${base}/print/${id}`);
await page.waitForSelector('[data-print-ready="true"]', { timeout: 60000 });
const readyMs = Date.now() - t0;
await page.emulateMedia({ media: "print" });

const audit = await page.evaluate(() => {
  const pages = [...document.querySelectorAll(".fluxa-print-page")];
  return pages.map((p, i) => {
    const pr = p.getBoundingClientRect();
    const issues = [];
    p.querySelectorAll(".stage-block").forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.left < pr.left - 1 || r.top < pr.top - 1 || r.right > pr.right + 1 || r.bottom > pr.bottom + 1)
        issues.push("outside page: " + b.innerText.slice(0, 40));
      [b, ...b.querySelectorAll(".block-text, .slide-sources, .block-chart")].forEach((el) => {
        if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== "visible")
          issues.push(`overflow ${el.scrollHeight}>${el.clientHeight}: ` + el.innerText.slice(0, 40));
      });
    });
    const imgs = [...p.querySelectorAll("img")];
    return {
      page: i + 1,
      size: [Math.round(pr.width), Math.round(pr.height)],
      images: imgs.length,
      imagesLoaded: imgs.filter((im) => im.complete && im.naturalWidth > 0).length,
      missingImageBoxes: p.querySelectorAll("[data-image-state]").length,
      charts: p.querySelectorAll(".block-chart").length,
      sources: p.querySelectorAll(".slide-sources").length,
      issues,
    };
  });
});

const pdfPath = path.join(outDir, `deck-${id}.pdf`);
await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
const handles = await page.$$(".fluxa-print-page");
for (let i = 0; i < handles.length; i++) {
  await handles[i].screenshot({ path: path.join(outDir, `deck-${id}-page-${String(i + 1).padStart(2, "0")}.png`) });
}
console.log(JSON.stringify({ id, readyMs, pdfPath, pages: audit, consoleErrors: consoleErrors.slice(0, 5) }, null, 1));
await browser.close();
