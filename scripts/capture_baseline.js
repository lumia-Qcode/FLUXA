import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "docs", "before");

fs.mkdirSync(outDir, { recursive: true });

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 200) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function killProc(proc) {
  if (!proc || !proc.pid) return;
  try {
    spawn("taskkill", ["/pid", proc.pid.toString(), "/f", "/t"]);
  } catch {}
}

async function main() {
  console.log("Starting backend...");
  const backend = spawn("python", ["run.py"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });

  console.log("Starting frontend...");
  const frontend = spawn("npm", ["run", "dev", "--prefix", "frontend"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });

  const cleanup = () => {
    console.log("Cleaning up servers...");
    killProc(backend);
    killProc(frontend);
  };

  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    console.log("Waiting for backend on :5000...");
    await waitForServer("http://127.0.0.1:5000/api/presentations");
    console.log("Backend ready!");

    console.log("Waiting for frontend on :5173...");
    await waitForServer("http://127.0.0.1:5173/");
    console.log("Frontend ready!");

    const browser = await chromium.launch({ headless: true });

    const viewports = [
      { name: "1440x900", width: 1440, height: 900 },
      { name: "1280x720", width: 1280, height: 720 },
      { name: "390x844", width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      console.log(`\n--- Capturing viewport ${vp.name} ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      // 1. Home Page
      console.log("Navigating to Home...");
      await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(outDir, `home-${vp.name}.png`),
      });

      // 2. Create Page
      console.log("Navigating to Create...");
      await page.goto("http://127.0.0.1:5173/create", { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(outDir, `create-${vp.name}.png`),
      });

      // 3. Editor Page - Slide 1 (bullets / intro)
      console.log("Navigating to Editor (Slide 1)...");
      await page.goto("http://127.0.0.1:5173/presentations/3", { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(outDir, `editor-slide1-${vp.name}.png`),
      });

      // 4. Editor Page - Slide 6 (with chart)
      console.log("Selecting Slide 6 with chart...");
      const thumbs = page.locator(".slide-rail button.thumb");
      const count = await thumbs.count();
      console.log(`Found ${count} slide thumbs in rail.`);
      if (count >= 6) {
        await thumbs.nth(5).click();
      } else if (count > 0) {
        await thumbs.last().click();
      }
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: path.join(outDir, `editor-chart-${vp.name}.png`),
      });

      // 5. Present Mode on the chart slide
      console.log("Clicking Present...");
      const presentBtn = page.locator("button.btn-present, [title*='Present']").first();
      if (await presentBtn.isVisible()) {
        await presentBtn.click();
        await page.waitForTimeout(1200);
        await page.screenshot({
          path: path.join(outDir, `present-${vp.name}.png`),
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      } else {
        console.warn("Present button not found");
      }

      await context.close();
    }

    await browser.close();
    console.log("All screenshots captured successfully!");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("Error in capture_baseline:", err);
  process.exit(1);
});
