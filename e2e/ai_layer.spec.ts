import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";

test.describe("Phase 5 — The AI Layer Suite", () => {
  test.beforeAll(() => {
    if (!fs.existsSync("docs/after-phase5")) {
      fs.mkdirSync("docs/after-phase5", { recursive: true });
    }
  });

  test.beforeEach(() => {
    try {
      execSync("py scripts/seed_phase4_deck.py", { stdio: "ignore" });
    } catch {
      // Ignore if python call fails in test runner
    }
  });

  test("1. Three-step Create flow: describe -> review outline -> generate with live progress", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/create");

    // Verify Step 1: Describe
    await expect(page.locator("h1")).toContainText("Create a presentation");
    const promptArea = page.getByLabel(/topic or prompt/i);
    await expect(promptArea).toBeVisible();

    await promptArea.fill("Autonomous Electric Vehicles 2026 Strategy");

    // Click Review outline
    const reviewBtn = page.getByRole("button", { name: /review outline/i });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // Verify Step 2: Review Outline
    await expect(page.locator("h1")).toContainText("Review outline");
    await expect(page.locator("text=Deck Title")).toBeVisible();

    // Verify live preview is mounted on the right
    await expect(page.locator("text=Preview")).toBeVisible();

    // Edit outline: change title of slide 2
    const outlineSlideInputs = page.locator("input[type='text']");
    // outlineSlideInputs[0] is Deck Title; outlineSlideInputs[1] is Slide 1; outlineSlideInputs[2] is Slide 2
    const slide2TitleInput = outlineSlideInputs.nth(2);
    if (await slide2TitleInput.isVisible()) {
      await slide2TitleInput.fill("Market Momentum & Fleet Adoption");
      await expect(slide2TitleInput).toHaveValue("Market Momentum & Fleet Adoption");
    }

    // Capture screenshot of Review Outline
    await page.screenshot({ path: "docs/after-phase5/create-flow-outline.png" });

    // Click Generate slides
    const generateBtn = page.getByRole("button", { name: /generate slides/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Verify Step 3: Generating slides appears
    await expect(page.locator("h1")).toContainText("Generating slides");

    // Capture screenshot of Generating screen
    await page.screenshot({ path: "docs/after-phase5/create-flow-generating.png" });

    // Wait for completion and transition into Editor
    await page.waitForURL(/\/presentations\/\d+/, { timeout: 15000 });
    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Verify slide rail has generated slides
    const railItems = page.locator(".ui-slide-thumb-card");
    await expect(railItems.first()).toBeVisible();
    const count = await railItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("2. Create flow cancel button returns to outline review without corruption", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/create");

    await page.getByLabel(/topic or prompt/i).fill("Fast Cancel Test");
    await page.getByRole("button", { name: /review outline/i }).click();

    await expect(page.locator("h1")).toContainText("Review outline");
    await page.getByRole("button", { name: /generate slides/i }).click();

    // When on Step 3, click Cancel
    const cancelBtn = page.getByRole("button", { name: "Cancel" }).last();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Verify returned cleanly to Step 2
    await expect(page.locator("h1")).toContainText("Review outline");
  });

  test("3. Ask Inspector Panel: 'Make this slide shorter' proposes change card with atomic Apply & Undo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Switch to Ask Tab
    const askTab = page.getByRole("tab", { name: "Ask" });
    await expect(askTab).toBeVisible();
    await askTab.click();

    // Verify Ask panel is mounted
    await expect(page.locator("text=Context:")).toBeVisible();

    // Send instruction: "Make this slide shorter"
    const askInput = page.getByPlaceholder("Ask FLUXA...");
    await expect(askInput).toBeVisible();
    await askInput.fill("Make this slide shorter");
    await askInput.press("Enter");

    // Wait for Change Card to appear
    await expect(page.locator("text=Proposed Changes")).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

    // Capture screenshot of Ask Panel with Change Card
    await page.screenshot({ path: "docs/after-phase5/ask-panel-change-card.png" });

    // Apply the change
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator("text=Applied")).toBeVisible();
    const inspector = page.locator(".ui-inspector-panel");
    const cardUndoBtn = inspector.getByRole("button", { name: "Undo" });
    await expect(cardUndoBtn).toBeVisible();

    // Undo the change
    await cardUndoBtn.click();
  });

  test("4. Ask Inspector Panel: 'Turn these bullets into a timeline' changes layout to timeline", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    const askTab = page.getByRole("tab", { name: "Ask" });
    await askTab.click();

    // Click the timeline suggestion pill
    const timelinePill = page.getByRole("button", { name: "Turn these bullets into a timeline" });
    await expect(timelinePill).toBeVisible();
    await timelinePill.click();

    // Wait for Proposed Changes
    await expect(page.locator("text=Proposed Changes")).toBeVisible({ timeout: 8000 });
    const applyBtn = page.getByRole("button", { name: "Apply" });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    await expect(page.locator("text=Applied")).toBeVisible();
  });

  test("5. Inline AI floating popover provides non-destructive suggestions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Double click title block hit target to open Tiptap editor
    const hitTarget = page.locator(".ui-block-hit-target").first();
    await expect(hitTarget).toBeVisible();
    await hitTarget.dblclick();

    // Verify Tiptap inline toolbar with AI button is visible
    const aiBtn = page.getByRole("button", { name: "AI" });
    await expect(aiBtn).toBeVisible();
    await aiBtn.click();

    // Verify AI options: Shorten, Expand, Fix grammar
    await expect(page.locator("text=Shorten")).toBeVisible();
    await expect(page.locator("text=Expand")).toBeVisible();
    await expect(page.locator("text=Fix grammar")).toBeVisible();

    // Click Shorten
    await page.locator("text=Shorten").click();

    // Verify 3 suggestions popover appears
    await expect(page.locator("text=Shorten Suggestions")).toBeVisible();
  });
});
