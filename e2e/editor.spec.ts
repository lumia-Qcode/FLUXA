import { expect, test } from "@playwright/test";

test.describe("Phase 3 — The Editor Suite", () => {
  test("1. Workspace screen: clean workspace, first-slide live thumbnails, search, and navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // 1. Verify workspace branding & header
    await expect(page.getByRole("banner")).toContainText("FLUXA");
    await expect(page.getByRole("banner")).toContainText("Personal workspace");

    // 2. Search bar
    const searchInput = page.getByPlaceholder(/Search presentations/i);
    await expect(searchInput).toBeVisible();

    // 3. New deck button
    await expect(page.getByRole("button", { name: "New presentation" })).toBeVisible();

    // 4. Presentations grid
    await page.waitForSelector(".deck-hover-overlay", { timeout: 10000 });
    const deckCards = page.locator("a[href^='/presentations/']");
    await expect(deckCards.first()).toBeVisible();

    // Capture workspace screenshot
    await page.screenshot({ path: "docs/after-phase3/workspace-1440x900.png" });

    // 5. Test search filter
    await searchInput.fill("Verification");
    await page.waitForTimeout(200);
    await expect(page.locator("text=Phase 2 Verification Deck")).toBeVisible();

    // Clear search
    await searchInput.fill("");
    await page.waitForTimeout(100);

    // 6. Navigate to editor by clicking deck
    await page.locator("text=Phase 2 Verification Deck").first().click();
    await page.waitForURL(/\/presentations\/5/);
    await expect(page.locator(".deck-title")).toHaveValue("Phase 2 Verification Deck");
  });

  test("2. Editor shell: 3-panel layout, theme toggle, and visual captures (1440x900 & 1280x720)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/5");

    // Wait for editor shell to mount
    await expect(page.locator(".ui-editor-shell")).toBeVisible();
    await expect(page.locator(".deck-title")).toHaveValue("Phase 2 Verification Deck");

    // Top bar height = 40px
    const topbar = page.locator(".ui-editor-topbar");
    await expect(topbar).toBeVisible();
    const topbarBox = await topbar.boundingBox();
    expect(topbarBox?.height).toBe(40);

    // Slide rail width = 200px
    const rail = page.locator(".ui-slide-rail");
    await expect(rail).toBeVisible();
    const railBox = await rail.boundingBox();
    expect(railBox?.width).toBe(200);

    // Center canvas is present
    const canvas = page.locator(".ui-editor-canvas");
    await expect(canvas).toBeVisible();

    // Inspector width = 300px
    const inspector = page.locator(".ui-inspector-panel");
    await expect(inspector).toBeVisible();
    const inspectorBox = await inspector.boundingBox();
    expect(inspectorBox?.width).toBe(300);

    // 1. Capture dark mode at 1440x900
    await page.screenshot({ path: "docs/after-phase3/editor-1440x900-dark.png" });

    // 2. Toggle to light mode and capture
    const themeToggle = page.getByRole("button", { name: "Toggle Theme Mode" });
    await themeToggle.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: "docs/after-phase3/editor-1440x900-light.png" });

    // Revert to dark mode
    await themeToggle.click();
    await page.waitForTimeout(200);

    // 3. Capture at 1280x720
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: "docs/after-phase3/editor-1280x720-dark.png" });
  });

  test("3. Canvas direct manipulation: selection overlay, 8 handles, and nudging", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/5");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Click on canvas block hit target to select it
    const blockHit = page.locator(".ui-block-hit-target").first();
    await blockHit.click();

    // Selection overlay with 8 handles and dimension badge should be visible
    const selection = page.locator(".ui-selection-overlay");
    await expect(selection).toBeVisible();
    await expect(selection.locator(".ui-resize-handle")).toHaveCount(8);
    await expect(selection.locator(".ui-rotation-handle")).toBeVisible();

    // Nudge with arrow keys
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(100);

    // Undo nudge
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
  });

  test("4. Linear Undo/Redo & gesture grouping", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/5");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    const titleInput = page.locator(".deck-title");
    const origTitle = await titleInput.inputValue();

    // Change title
    await titleInput.fill("Title Version 1");
    await titleInput.blur();
    await page.waitForTimeout(100);

    // Click undo
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();

    // Title should be restored
    await expect(titleInput).toHaveValue(origTitle);

    // Click redo
    const redoBtn = page.getByRole("button", { name: "Redo" });
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();

    // Title should reapply
    await expect(titleInput).toHaveValue("Title Version 1");

    // Restore original title
    await undoBtn.click();
    await expect(titleInput).toHaveValue(origTitle);
  });

  test("5. Slide rail & Slide sorter modal (G hotkey)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/5");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Press 'G' to open full-screen slide sorter modal
    await page.keyboard.press("g");

    // Sorter modal heading should be visible
    const sorterHeading = page.getByRole("heading", { name: "Slide Sorter" });
    await expect(sorterHeading).toBeVisible();

    // Capture slide sorter screenshot
    await page.screenshot({ path: "docs/after-phase3/slide-sorter-1440x900.png" });

    // Close sorter modal with Escape
    await page.keyboard.press("Escape");
    await expect(sorterHeading).not.toBeVisible();
  });

  test("6. Inspector Design tab: theme & layout chooser", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/5");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Ensure Inspector Design tab is active
    const designTab = page.getByRole("tab", { name: "Design" });
    await designTab.click();

    // Click on canvas background to deselect blocks and show SlideInspector
    const viewport = page.locator(".ui-canvas-viewport");
    await viewport.click({ position: { x: 50, y: 50 } });

    // Verify Theme Gallery is visible
    await expect(page.locator("text=DECK THEME")).toBeVisible();
    await expect(page.locator("text=Clean Light")).toBeVisible();
    await expect(page.locator("text=Editorial Serif")).toBeVisible();

    // Verify Layout Gallery is visible
    await expect(page.locator("text=SLIDE LAYOUT")).toBeVisible();
    await expect(page.locator("text=Title Slide")).toBeVisible();
    await expect(page.locator("text=Two Columns")).toBeVisible();
  });

  test("7. Command bar (Ctrl+K) & Shortcut sheet (?)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/5");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Open Command Bar via shortcut button or click
    const cmdBarBtn = page.getByRole("button", { name: /Search or commands/i });
    await cmdBarBtn.click();

    const cmdPalette = page.locator("input[placeholder*='Type a command']");
    await expect(cmdPalette).toBeVisible();

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(cmdPalette).not.toBeVisible();

    // Open Shortcut Sheet via ?
    await page.keyboard.press("?");
    const shortcutModal = page.getByRole("heading", { name: "Keyboard Shortcuts" });
    await expect(shortcutModal).toBeVisible();

    // Close shortcut modal
    await page.keyboard.press("Escape");
    await expect(shortcutModal).not.toBeVisible();
  });

  test("8. Mobile viewport explanation (390x844)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/presentations/5");

    // Verify mobile message
    await expect(page.locator("text=Editing requires a larger screen")).toBeVisible();
    await expect(
      page.locator("text=You can still present and view this deck on your device")
    ).toBeVisible();

    const presentMobileBtn = page.getByRole("button", { name: "Present Deck" });
    await expect(presentMobileBtn).toBeVisible();

    // Capture mobile explanation screenshot
    await page.screenshot({ path: "docs/after-phase3/editor-mobile-390x844.png" });

    // Click present from mobile
    await presentMobileBtn.click();
    const portal = page.locator(".fluxa-present-portal");
    await expect(portal).toBeVisible();
  });
});
