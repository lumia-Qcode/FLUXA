const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\kingm\\.gemini\\antigravity\\brain\\7deccdc1-48ea-48de-9508-c995b9816242';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("Capturing Screen 1: Brand Landing Page...");
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screen1_brand_landing.png') });

  console.log("Capturing Screen 2: Workspace Prompt Page...");
  await page.goto('http://localhost:5173/workspace', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screen2_workspace_prompt.png') });

  console.log("Capturing Screen 3: Generation Overview Split View...");
  await page.goto('http://localhost:5173/presentations/29?view=overview', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screen3_generation_overview.png') });

  console.log("Capturing Screen 4: Single Slide Editor...");
  await page.goto('http://localhost:5173/presentations/29?view=edit', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Click on slide 3 thumbnail in slide rail to make sure Slide 3 is selected
  try {
    const slide3 = page.locator('.ui-slide-rail-item, [data-slide-index="2"]').nth(2);
    if (await slide3.count() > 0) {
      await slide3.click();
      await page.waitForTimeout(800);
    }
  } catch (e) {
    console.log("Slide click note:", e.message);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screen4_slide_editor.png') });

  await browser.close();
  console.log("All screenshots captured successfully!");
})();
