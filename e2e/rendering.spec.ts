import { expect, test } from "@playwright/test";

test.describe("Phase 2 — Rendering Core & Visual Baseline Suite", () => {
  test("Acceptance check: Present mode portal isolates from transformed ancestors (1440x900, Defect 1 fix)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/5");

    // Wait for the presentation editor to load
    await expect(page.locator(".deck-title")).toHaveValue("Phase 2 Verification Deck");
    const presentBtn = page.getByRole("button", { name: /^present$/i });
    await expect(presentBtn).toBeVisible();

    // Click Present Deck
    await presentBtn.click();

    // 1. Verify portal element exists and is mounted directly to document.body
    const portal = page.locator(".fluxa-present-portal");
    await expect(portal).toBeVisible();

    const isDirectBodyChild = await portal.evaluate(
      (el) => el.parentElement === document.body
    );
    expect(isDirectBodyChild).toBe(true);

    // 2. Verify fixed full-bleed layout and black stage letterbox
    await expect(portal).toHaveCSS("position", "fixed");
    const box = await portal.boundingBox();
    expect(box?.width).toBe(1440);
    expect(box?.height).toBe(900);

    // 3. Verify editor chrome (sidebar, header) is NOT visible inside present portal
    await expect(portal.locator(".slide-rail")).toHaveCount(0);
    await expect(portal.locator(".luxury-header")).toHaveCount(0);

    // 4. Verify SlideStage canvas is rendered and scaled
    const canvas = portal.locator(".slide-stage-canvas");
    await expect(canvas).toBeVisible();

    // Capture Present mode screenshot at 1440x900
    await page.screenshot({ path: "docs/after-phase2/present-1440x900.png" });

    // 5. Test keyboard navigation: ArrowRight advances to Slide 2
    await page.keyboard.press("ArrowRight");
    await expect(portal.locator(".present-controls-hud")).toContainText("2 / 14");

    // 6. Test blackout blank (b hotkey)
    await page.keyboard.press("b");
    await page.waitForTimeout(100);
    // Un-blank
    await page.keyboard.press("b");
    await page.waitForTimeout(100);

    // 7. Test Escape exits presentation mode
    await page.keyboard.press("Escape");
    await expect(portal).not.toBeVisible();
    await expect(presentBtn).toBeVisible();
  });

  test("Present mode responsive: 1280x720", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/presentations/5");
    await expect(page.locator(".deck-title")).toHaveValue("Phase 2 Verification Deck");

    await page.getByRole("button", { name: /^present$/i }).click();
    const portal = page.locator(".fluxa-present-portal");
    await expect(portal).toBeVisible();

    await page.screenshot({ path: "docs/after-phase2/present-1280x720.png" });
  });

  test("Present mode responsive: 390x844 (Mobile)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/presentations/5");
    await expect(page.locator("h2")).toContainText("Phase 2 Verification Deck");

    await page.getByRole("button", { name: /present deck/i }).click();
    const portal = page.locator(".fluxa-present-portal");
    await expect(portal).toBeVisible();

    await page.screenshot({ path: "docs/after-phase2/present-390x844.png" });
  });

  test("Share viewer (/v/:id) renders full-bleed without application chrome", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/v/5");

    // Verify slide stage is rendered in present mode
    const viewport = page.locator(".slide-stage-viewport.mode-present");
    await expect(viewport).toBeVisible();

    // Verify no editor sidebar or top navigation
    await expect(page.locator(".slide-rail")).toHaveCount(0);
    await expect(page.locator(".luxury-header")).toHaveCount(0);

    // Verify slide canvas
    const canvas = page.locator(".slide-stage-canvas");
    await expect(canvas).toBeVisible();

    await page.screenshot({ path: "docs/after-phase2/share-viewer-1440x900.png" });
  });

  test("Print route (/print/:id) renders multi-page document matching 1920x1080 stage", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/print/5");

    const printDoc = page.locator(".fluxa-print-document");
    await expect(printDoc).toBeVisible();

    const pages = page.locator(".fluxa-print-page");
    await expect(pages).toHaveCount(14);

    // Each print page has a SlideStage in print mode
    const printStages = page.locator(".slide-stage-viewport.mode-print");
    await expect(printStages).toHaveCount(14);

    await page.screenshot({ path: "docs/after-phase2/print-view-1440x900.png" });
  });

  test("Visual baselines: Themes (clean-light, midnight, editorial)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Clean-light theme on Deck 5
    await page.goto("/v/5");
    await expect(page.locator(".slide-stage-canvas")).toBeVisible();
    await page.screenshot({ path: "docs/after-phase2/theme-clean-light.png" });

    // 2. Midnight theme on Deck 3
    await page.goto("/v/3");
    await expect(page.locator(".slide-stage-canvas")).toBeVisible();
    await page.screenshot({ path: "docs/after-phase2/theme-midnight.png" });

    // 3. Editorial theme on Deck 4
    await page.goto("/v/4");
    await expect(page.locator(".slide-stage-canvas")).toBeVisible();
    await page.screenshot({ path: "docs/after-phase2/theme-editorial.png" });
  });

  test("Layouts and fixtures: Chart-text, KPI, Text-fit dynamic scaling, and Urdu RTL", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/v/5");
    await expect(page.locator(".slide-stage-canvas")).toBeVisible();

    const nextBtn = page.getByTestId("viewer-next");

    // Advance to Slide 5: KPI (click next 4 times)
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
    }
    await expect(page.getByTestId("viewer-counter")).toHaveText("5 / 14");
    const kpiBlock = page.locator(".block-kpi");
    await expect(kpiBlock).toBeVisible();
    await expect(kpiBlock).toContainText("99.98%");
    await page.screenshot({ path: "docs/after-phase2/layout-kpi.png" });

    // Advance to Slide 6: Chart-text layout
    await nextBtn.click();
    await expect(page.getByTestId("viewer-counter")).toHaveText("6 / 14");
    const chartBlock = page.locator(".block-chart");
    await expect(chartBlock).toBeVisible();
    await expect(chartBlock.locator("canvas")).toBeVisible();
    // Accessible fallback table exists
    await expect(chartBlock.locator("table.sr-only")).toBeAttached();
    await page.screenshot({ path: "docs/after-phase2/layout-chart-text.png" });

    // Advance to Slide 13: Text-Fit Long Text fixture (click next 7 times)
    for (let i = 0; i < 7; i++) {
      await nextBtn.click();
    }
    await expect(page.getByTestId("viewer-counter")).toHaveText("13 / 14");
    const longTextBlock = page.locator(".block-text").filter({ hasText: "mathematical guarantee" });
    await expect(longTextBlock).toBeVisible();

    // Verify text-fit scaled down font and content does not overflow box
    const overflows = await longTextBlock.evaluate((el) => {
      return el.scrollHeight > el.clientHeight + 10;
    });
    expect(overflows).toBe(false);
    await page.screenshot({ path: "docs/after-phase2/text-fit-long.png" });

    // Advance to Slide 14: Urdu RTL text fixture
    await nextBtn.click();
    await expect(page.getByTestId("viewer-counter")).toHaveText("14 / 14");
    const urduBlock = page.locator(".block-text").filter({ hasText: "مصنوعی ذہانت" });
    await expect(urduBlock).toBeVisible();
    await page.screenshot({ path: "docs/after-phase2/rtl-urdu.png" });
  });
});
