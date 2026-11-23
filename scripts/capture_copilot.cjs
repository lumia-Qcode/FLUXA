const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\kingm\\.gemini\\antigravity\\brain\\c97360e6-7ca9-4d89-ab90-6dd5507b20ad';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("Navigating to generation overview (presentation 96)...");
  await page.goto('http://localhost:5173/presentations/96?view=overview', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Capture full screen overview
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'generation_overview_screen.png') });

  // Capture specifically the left copilot sidebar
  const aside = page.locator('aside');
  if (await aside.count() > 0) {
    console.log("Capturing overview copilot sidebar...");
    await aside.screenshot({ path: path.join(ARTIFACTS_DIR, 'overview_copilot_sidebar.png') });
  }

  await browser.close();
  console.log("Overview screenshots captured successfully!");
})();
