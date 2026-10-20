import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test.describe("Phase 4 — The Dynamic Engine Suite", () => {
  test.beforeEach(() => {
    try {
      execSync("py scripts/seed_phase4_deck.py", { stdio: "ignore" });
    } catch {
      // Ignore if python call fails in test runner
    }
  });

  test("1. The 55 -> 74 worked example: editing table cell animates Chart bar and counts KPI to 74", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Wait for editor to load
    await expect(page.locator(".ui-editor-shell")).toBeVisible();
    await expect(page.locator(".deck-title")).toHaveValue("Phase 4 Dynamic Engine Verification");

    // 2. Open the Data Tab in the right inspector
    const dataTabButton = page.getByRole("tab", { name: "Data" });
    await expect(dataTabButton).toBeVisible();
    await dataTabButton.click();

    // Verify Data Tab spreadsheet table is mounted
    await expect(page.locator("text=Datasets (2)")).toBeVisible();

    // 3. Find the cell for 2024 pct in the Data table
    const cellInput = page.locator(".ui-inspector-panel table tbody tr:nth-child(2) td:nth-child(3) input");
    const kpiVal = page.locator(".ui-canvas-stage-wrapper .kpi-value-text");
    const chartTable = page.locator(".ui-canvas-stage-wrapper .block-chart table");

    // Ensure cell starts at 55
    const currentVal = await cellInput.inputValue();
    if (currentVal !== "55") {
      await cellInput.fill("55");
      await cellInput.dispatchEvent("change");
      await page.waitForTimeout(300);
    }

    // Verify initial state on canvas: KPI value is 55%
    await expect(kpiVal).toContainText("55%");
    await expect(chartTable).toContainText("55");

    // Now perform the worked example edit: 55 -> 74
    await cellInput.fill("74");
    await cellInput.dispatchEvent("change");

    // 4. Verification: KPI counts up to 74%
    await expect(kpiVal).toContainText("74%", { timeout: 4000 });

    // Verify chart accessible table reflects 74
    await expect(chartTable).toContainText("74");

    // Capture screenshot of the 55 -> 74 result
    await page.screenshot({ path: "docs/after-phase4/example-55-to-74.png" });
  });

  test("2. What-if forecast slider: Try-it mode live interaction drives chart and KPI", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Select Slide 2 (What-if forecast slide)
    const slide2Thumbnail = page.locator(".ui-slide-thumb-card").nth(1);
    await slide2Thumbnail.click();

    // Verify Slide 2 is loaded on canvas
    await expect(page.locator(".ui-canvas-stage-wrapper").getByText("Interactive Revenue Forecast")).toBeVisible();

    // Find the Try-it button in Insert toolbar
    const tryItButton = page.getByRole("button", { name: /Try it/i });
    await expect(tryItButton).toBeVisible();
    await tryItButton.click();

    // "Try it: ON" indicator
    await expect(tryItButton).toContainText("Try it: ON");

    // Find the growth slider input on canvas
    const slider = page.locator(".ui-canvas-stage-wrapper .block-control input[type='range']");
    await expect(slider).toBeVisible();

    // Canvas KPI shows initial total projected revenue
    const kpiVal = page.locator(".ui-canvas-stage-wrapper .kpi-value-text");
    await expect(kpiVal).toBeVisible();

    // Interact with slider: change value from 1.2 to 1.6
    await slider.fill("1.6");
    await slider.dispatchEvent("input");
    await slider.dispatchEvent("change");

    // The slider number display updates to 1.6
    await expect(
      page.locator(".ui-canvas-stage-wrapper .block-control span").filter({ hasText: "1.6" })
    ).toBeVisible();

    // KPI animates to updated total projected revenue
    // Base sum = 100 + 150 + 220 + 300 = 770. At 1.6x, total = 1232
    await expect(kpiVal).toContainText("1232", { timeout: 4000 });

    await page.screenshot({ path: "docs/after-phase4/example-what-if-slider.png" });
  });

  test("3. Sandboxed HTML widget: strict CSP, sandbox security isolation, and postMessage bridge", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Navigate to Slide 3 (HTML widget)
    const slide3Thumbnail = page.locator(".ui-slide-thumb-card").nth(2);
    await slide3Thumbnail.click();

    // Enable Try-it mode so widget is interactive on canvas
    const tryItButton = page.getByRole("button", { name: /Try it/i });
    await expect(tryItButton).toBeVisible();
    await tryItButton.click();

    // Locate the canvas iframe
    const widgetFrame = page.frameLocator(".ui-canvas-stage-wrapper iframe[title^='Widget']");
    await expect(widgetFrame.locator("#widget-heading")).toContainText("Secure Sandboxed Widget");

    // Verify sandbox attribute on iframe element
    const iframeElement = page.locator(".ui-canvas-stage-wrapper iframe[title^='Widget']");
    await expect(iframeElement).toHaveAttribute("sandbox", "allow-scripts");

    // Test Security Isolation inside the iframe
    const securityCheck = await widgetFrame.locator("#widget-heading").evaluate(() => {
      let parentAccessBlocked = false;
      let localStorageBlocked = false;

      // 1. window.parent.document access must fail
      try {
        const _ = window.parent.document;
      } catch {
        parentAccessBlocked = true;
      }

      // 2. localStorage access must fail
      try {
        localStorage.setItem("test", "fail");
      } catch {
        localStorageBlocked = true;
      }

      return { parentAccessBlocked, localStorageBlocked };
    });

    expect(securityCheck.parentAccessBlocked).toBe(true);
    expect(securityCheck.localStorageBlocked).toBe(true);

    // Test the Fluxa postMessage bridge
    // Clicking "Boost Growth to 1.8x" inside widget invokes window.fluxa.set("growth", 1.8)
    const boostBtn = widgetFrame.locator("#btn-boost");
    await boostBtn.click();

    // Wait a brief moment for postMessage to dispatch
    await page.waitForTimeout(400);

    // Verify that the widget receives the updated variable back
    await expect(widgetFrame.locator("#current-growth")).toContainText("1.8");
  });

  test("4. Hostile and invalid expressions show inline error badges and never blank the slide", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Navigate to Slide 4 (Hostile expressions)
    const slide4Thumbnail = page.locator(".ui-slide-thumb-card").nth(3);
    await slide4Thumbnail.click();

    // Verify that the slide renders successfully without crashing
    const canvasStage = page.locator(".ui-canvas-stage-wrapper .slide-stage-canvas");
    await expect(canvasStage).toBeVisible();

    // Confirm that the KPI blocks show "Formula error" badges on canvas
    const errorBadges = canvasStage.locator("text=Formula error");
    await expect(errorBadges.first()).toBeVisible();
    await expect(errorBadges).toHaveCount(2);

    // Confirm KPI values display "Error" instead of blanking or executing harmful code
    const kpiTexts = canvasStage.locator(".kpi-value-text");
    await expect(kpiTexts.first()).toContainText("Error");
    await expect(kpiTexts.nth(1)).toContainText("Error");

    await page.screenshot({ path: "docs/after-phase4/hostile-expression-safe.png" });
  });

  test("5. Presenter view: bidirectional sync via BroadcastChannel, speaker notes, and timer", async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // 1. Launch Present Mode from top bar
    const presentButton = page.locator(".ui-editor-topbar").getByRole("button", { name: "Present" });
    await presentButton.click();

    // Wait for Present portal
    const presentHud = page.locator(".present-controls-hud");
    await expect(presentHud).toBeVisible();
    await expect(presentHud).toContainText("1 / 5");

    // 2. Open Presenter View in second tab
    const presenterPage = await context.newPage();
    await presenterPage.setViewportSize({ width: 1200, height: 800 });
    await presenterPage.goto("/presenter/7");

    // Verify Presenter View mounted
    await expect(presenterPage.locator("text=Presenter View")).toBeVisible();
    await expect(presenterPage.locator("text=Slide 1 of 5")).toBeVisible();

    // Verify speaker notes are visible and readable
    await expect(presenterPage.locator("text=Slide 1 Speaker Notes")).toBeVisible();

    // Verify timer is running (formatted as m:ss)
    const timerText = presenterPage.locator("span").filter({ hasText: /^\d+:\d{2}$/ });
    await expect(timerText).toBeVisible();

    // 3. Test Navigation from Presenter View -> controls main window
    const nextButton = presenterPage.getByRole("button", { name: "Next ▶" });
    await nextButton.click();

    // Verify presenter view updated to Slide 2
    await expect(presenterPage.locator("text=Slide 2 of 5")).toBeVisible();
    await expect(presenterPage.locator("text=Slide 2 Speaker Notes")).toBeVisible();

    // Verify main window synced and now displays Slide 2
    await expect(presentHud).toContainText("2 / 5");

    // 4. Test Navigation from Main Window -> controls Presenter View
    // Press ArrowRight on main window to advance to Slide 3
    await page.keyboard.press("ArrowRight");

    // Verify main window is on Slide 3
    await expect(presentHud).toContainText("3 / 5");

    // Verify presenter view synced to Slide 3
    await expect(presenterPage.locator("text=Slide 3 of 5")).toBeVisible();
    await expect(presenterPage.locator("text=Slide 3 Speaker Notes")).toBeVisible();

    await presenterPage.screenshot({ path: "docs/after-phase4/presenter-view-sync.png" });

    await presenterPage.close();
  });
});
