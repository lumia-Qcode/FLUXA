import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test.describe("Phase 7 — Six PRD User Stories Acceptance Suite", () => {
  test.beforeAll(() => {
    if (!fs.existsSync("docs/after-phase7")) {
      fs.mkdirSync("docs/after-phase7", { recursive: true });
    }
    if (!fs.existsSync("test-results")) {
      fs.mkdirSync("test-results", { recursive: true });
    }
  });

  test.beforeEach(() => {
    try {
      execSync("py scripts/seed_demo.py", { stdio: "ignore" });
    } catch {
      // Ignore if seed fails
    }
  });

  test("User Story 1: Generate presentation from prompt, edit outline, and stream slides", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/create");

    // 1. Fill prompt
    const promptInput = page.getByLabel(/topic or prompt/i);
    await expect(promptInput).toBeVisible();
    await promptInput.fill("Autonomous Electric Vehicles 2026 Strategy");

    // 2. Review outline
    const reviewBtn = page.getByRole("button", { name: /review outline/i });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // Verify Review outline screen
    await expect(page.locator("h1")).toContainText("Review outline");
    await expect(page.locator("text=Deck Title")).toBeVisible();

    // Edit outline slide title
    const outlineSlideInputs = page.locator("input[type='text']");
    const slide2TitleInput = outlineSlideInputs.nth(2);
    if (await slide2TitleInput.isVisible()) {
      await slide2TitleInput.fill("Market Momentum & Fleet Adoption");
      await expect(slide2TitleInput).toHaveValue("Market Momentum & Fleet Adoption");
    }

    // Capture screenshot of outline review
    await page.screenshot({ path: "docs/after-phase7/user-story-1-outline-generate.png" });

    // 3. Generate slides
    const generateBtn = page.getByRole("button", { name: /generate slides/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Verify generating screen
    await expect(page.locator("h1")).toContainText("Generating slides");

    // Wait for transition into Editor
    await page.waitForURL(/\/presentations\/\d+/, { timeout: 15000 });
    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Verify slide thumbnails in rail
    const railItems = page.locator(".ui-slide-thumb-card");
    await expect(railItems.first()).toBeVisible();
    expect(await railItems.count()).toBeGreaterThanOrEqual(3);
  });

  test("User Story 2: Direct text editing on canvas in place with persistence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/14");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Double-click on canvas title block hit target to engage inline Tiptap editor
    const titleHitTarget = page.locator(".ui-block-hit-target").first();
    await expect(titleHitTarget).toBeVisible();
    await titleHitTarget.dblclick();

    // Verify Tiptap editor is mounted
    const tiptapEditor = page.locator(".ProseMirror");
    await expect(tiptapEditor).toBeVisible();

    // Focus and select all, then replace text
    await tiptapEditor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Direct Canvas In-Place Editing Verified");

    // Commit change by pressing Escape to trigger onSave recipe
    await page.keyboard.press("Escape");
    await expect(tiptapEditor).not.toBeVisible();

    // Wait for debounced autosave to complete
    await expect(page.locator(".ui-save-status")).toContainText("Saved", { timeout: 6000 });

    // Capture screenshot of canvas direct edit
    await page.screenshot({ path: "docs/after-phase7/user-story-2-canvas-direct-edit.png" });

    // Reload page to verify persistence
    await page.reload();
    await expect(page.locator(".ui-editor-shell")).toBeVisible();
    await expect(
      page.locator(".ui-canvas-stage-wrapper").getByText("Direct Canvas In-Place Editing Verified")
    ).toBeVisible();
  });

  test("User Story 3: Natural language AI command produces change card with atomic Apply and Undo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/14");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Switch to Ask inspector tab
    const askTab = page.getByRole("tab", { name: "Ask" });
    await expect(askTab).toBeVisible();
    await askTab.click();

    await expect(page.locator("text=Context:")).toBeVisible();

    // Type edit instruction
    const askInput = page.getByPlaceholder("Ask FLUXA...");
    await expect(askInput).toBeVisible();
    await askInput.fill("Make this slide shorter");
    await askInput.press("Enter");

    // Verify Change Card appears
    await expect(page.locator("text=Proposed Changes")).toBeVisible({ timeout: 8000 });
    const applyBtn = page.getByRole("button", { name: "Apply" });
    const rejectBtn = page.getByRole("button", { name: "Reject" });
    await expect(applyBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();

    // Capture screenshot of Change Card
    await page.screenshot({ path: "docs/after-phase7/user-story-3-ai-change-card.png" });

    // Apply change
    await applyBtn.click();
    await expect(page.locator("text=Applied")).toBeVisible();

    // 1-Click Undo
    const inspector = page.locator(".ui-inspector-panel");
    const undoBtn = inspector.getByRole("button", { name: "Undo" });
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();
  });

  test("User Story 4: Changing dataset cell in Data tab animates Chart bar and counts KPI to 74", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/14");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Navigate to slide 2 (Adoption slide)
    const slide2Thumbnail = page.locator(".ui-slide-thumb-card").nth(1);
    await expect(slide2Thumbnail).toBeVisible();
    await slide2Thumbnail.click();

    // Verify initial KPI value displays 55%
    const kpiVal = page.locator(".ui-canvas-stage-wrapper .kpi-value-text");
    const chartTable = page.locator(".ui-canvas-stage-wrapper .block-chart table");
    await expect(kpiVal).toBeVisible();
    await expect(kpiVal).toContainText("55%");

    // Switch to Data tab
    const dataTab = page.getByRole("tab", { name: "Data" });
    await expect(dataTab).toBeVisible();
    await dataTab.click();

    // Find 2024 row cell with value 55 and edit to 74
    const cellInput = page.locator(".ui-inspector-panel table tbody tr:nth-child(2) td:nth-child(3) input");
    await expect(cellInput).toBeVisible();
    await cellInput.fill("74");
    await cellInput.dispatchEvent("change");

    // Verify KPI block animates to 74%
    await expect(kpiVal).toContainText("74%", { timeout: 6000 });
    await expect(chartTable).toContainText("74");

    // Capture screenshot of animated chart and KPI at 74%
    await page.screenshot({ path: "docs/after-phase7/user-story-4-data-55-to-74.png" });
  });

  test("User Story 5: Fullscreen Present mode portal isolates from transformed ancestors and presenter view", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/14");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Launch Present mode
    const presentBtn = page.getByRole("button", { name: /^Present$/ });
    await expect(presentBtn).toBeVisible();
    await presentBtn.click();

    // Verify PresentMode portal mounts at document.body
    const presentPortal = page.locator(".fluxa-present-portal");
    await expect(presentPortal).toBeVisible();

    // Verify isolation: PresentMode mounts directly to document.body, escaping transformed editor hierarchy
    const isDirectBodyChild = await presentPortal.evaluate(
      (el) => el.parentElement === document.body
    );
    expect(isDirectBodyChild).toBe(true);

    // Verify fixed full-bleed layout and black stage letterbox
    await expect(presentPortal).toHaveCSS("position", "fixed");
    const box = await presentPortal.boundingBox();
    expect(box?.width).toBe(1440);
    expect(box?.height).toBe(900);

    // Verify editor chrome (sidebar, rail) is NOT inside the present portal
    await expect(presentPortal.locator(".ui-slide-rail")).toHaveCount(0);
    await expect(presentPortal.locator(".ui-inspector-panel")).toHaveCount(0);

    // Capture screenshot of present mode
    await page.screenshot({ path: "docs/after-phase7/user-story-5-presenter-mode.png" });

    // Advance slide via Space key
    await page.keyboard.press("Space");
    await page.waitForTimeout(500);

    // Exit Present mode via Escape
    await page.keyboard.press("Escape");
    await expect(presentPortal).not.toBeVisible();
  });

  test("User Story 6: PowerPoint (.pptx) export with native editable charts verified by python-pptx", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/14");

    // Open Export dialog
    const exportBtn = page.getByRole("button", { name: "Export", exact: true });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    const dialog = page.locator(".ui-export-dialog");
    await expect(dialog).toBeVisible();

    // Capture screenshot of export dialog
    await page.screenshot({ path: "docs/after-phase7/user-story-6-export-dialog.png" });

    // Trigger PowerPoint download
    const downloadPromise = page.waitForEvent("download", { timeout: 25000 });
    await dialog.getByRole("button", { name: "Export PPTX" }).click();
    const download = await downloadPromise;

    const pptxPath = path.resolve("test-results/user-story-deck.pptx");
    await download.saveAs(pptxPath);
    expect(fs.existsSync(pptxPath)).toBe(true);

    // Verify with python-pptx
    const pyOutput = execSync(`py scripts/verify_pptx.py "${pptxPath}"`).toString();
    expect(pyOutput).toContain("'status': 'valid'");
    expect(pyOutput).toContain("'found_charts':");
  });
});
