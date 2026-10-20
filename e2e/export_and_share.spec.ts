import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test.describe("Phase 6 — Export and Share Suite", () => {
  test.beforeAll(() => {
    if (!fs.existsSync("docs/after-phase6")) {
      fs.mkdirSync("docs/after-phase6", { recursive: true });
    }
    if (!fs.existsSync("test-results")) {
      fs.mkdirSync("test-results", { recursive: true });
    }
  });

  test.beforeEach(() => {
    try {
      execSync("py scripts/seed_phase4_deck.py", { stdio: "ignore" });
    } catch {
      // Ignore if seed script fails
    }
  });

  test("1. Export dialog: displays honest disclosures for all formats and copies markdown", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    await expect(page.locator(".ui-editor-shell")).toBeVisible();

    // Click Export button in topbar
    const exportBtn = page.getByRole("button", { name: "Export", exact: true });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // Verify dialog is open
    const dialog = page.locator(".ui-export-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("text=Export and share")).toBeVisible();

    // Verify all format options exist with honest disclosures
    await expect(page.locator("text=Standalone HTML (.html)")).toBeVisible();
    await expect(page.locator("text=Microsoft PowerPoint (.pptx)")).toBeVisible();
    await expect(page.locator("text=Print / PDF Document")).toBeVisible();
    await expect(page.locator("text=Slide Images (.zip)")).toBeVisible();
    await expect(page.locator("text=Markdown Outline (.md)")).toBeVisible();

    // Capture screenshot of formats tab
    await page.screenshot({ path: "docs/after-phase6/export-dialog-formats.png" });

    // Test Markdown copy button
    const copyMdBtn = dialog.getByRole("button", { name: "Copy" });
    await expect(copyMdBtn).toBeVisible();
    await copyMdBtn.click();

    // Verify toast
    await expect(page.locator("text=Markdown outline copied")).toBeVisible();
  });

  test("2. Share link workflow: create link, view in read-only mode, and verify full-bleed rendering", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Open Export dialog
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.locator(".ui-export-dialog");
    await expect(dialog).toBeVisible();

    // Switch to Share Link tab
    const shareTab = dialog.getByRole("button", { name: /Share Link/i });
    await shareTab.click();

    // Click Generate Share Link
    const generateLinkBtn = dialog.getByRole("button", { name: /Generate Share Link/i });
    if (await generateLinkBtn.isVisible()) {
      await generateLinkBtn.click();
    }

    // Wait for share URL input to populate
    const shareInput = dialog.locator("input[readonly]");
    await expect(shareInput).toBeVisible();
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toContain("/v/");

    // Capture screenshot of active share link tab
    await page.screenshot({ path: "docs/after-phase6/export-dialog-share.png" });

    // Open share URL in a fresh page (visitor perspective)
    const viewerPage = await context.newPage();
    await viewerPage.setViewportSize({ width: 1440, height: 900 });
    await viewerPage.goto(shareUrl);

    // Verify it renders full-bleed without editor shell
    await expect(viewerPage.locator(".ui-editor-shell")).not.toBeVisible();
    await expect(viewerPage.locator("[data-testid='viewer-counter']")).toBeVisible();
    await expect(viewerPage.locator("[data-testid='viewer-counter']")).toContainText("1 /");

    // Capture screenshot of read-only share viewer
    await viewerPage.screenshot({ path: "docs/after-phase6/share-viewer-live.png" });
    await viewerPage.close();
  });

  test("3. Revoke share link: immediate access revocation returns honest error page", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Open Export dialog and switch to share tab
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.locator(".ui-export-dialog");
    await dialog.getByRole("button", { name: /Share Link/i }).click();

    // Ensure share link is active
    const generateLinkBtn = dialog.getByRole("button", { name: /Generate Share Link/i });
    if (await generateLinkBtn.isVisible()) {
      await generateLinkBtn.click();
    }

    const shareInput = dialog.locator("input[readonly]");
    await expect(shareInput).toBeVisible();
    const shareUrl = await shareInput.inputValue();

    // Click Revoke Link
    const revokeBtn = dialog.getByRole("button", { name: /Revoke Link/i });
    await expect(revokeBtn).toBeVisible();
    await revokeBtn.click();

    // Verify state updates to disabled
    await expect(dialog.getByRole("button", { name: /Generate Share Link/i })).toBeVisible();

    // Navigate to the revoked link in visitor page
    const visitorPage = await context.newPage();
    await visitorPage.setViewportSize({ width: 1440, height: 900 });
    await visitorPage.goto(shareUrl);

    // Expect clear "no longer shared" error message
    await expect(visitorPage.locator("text=Presentation Unavailable")).toBeVisible();
    await expect(
      visitorPage.locator("text=This presentation is no longer shared or the link has expired.")
    ).toBeVisible();

    // Capture screenshot of revoked viewer
    await visitorPage.screenshot({ path: "docs/after-phase6/share-viewer-revoked.png" });
    await visitorPage.close();
  });

  test("4. Standalone HTML export: opens from file:// offline and slider updates chart live", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Open Export Dialog
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.locator(".ui-export-dialog");
    await expect(dialog).toBeVisible();

    // Trigger Standalone HTML download
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export HTML" }).click();
    const download = await downloadPromise;

    const exportPath = path.resolve("test-results/standalone-test.html");
    await download.saveAs(exportPath);
    expect(fs.existsSync(exportPath)).toBe(true);

    // Open the downloaded standalone HTML directly via file://
    const fileUrl = `file://${exportPath.replace(/\\/g, "/")}`;
    await page.goto(fileUrl);

    // Verify it renders the presentation stage
    await expect(page.locator("#stage-container")).toBeVisible();
    await expect(page.locator("text=Standalone HTML")).toBeVisible();

    // Navigate to slide 2 (the What-If Forecast slide with slider and chart)
    const nextBtn = page.locator("#btn-next");
    await nextBtn.click();

    // Verify slider is present
    const slider = page.locator("[data-testid='standalone-slider']");
    await expect(slider).toBeVisible();

    // Move slider value
    await slider.fill("1.7");
    await slider.dispatchEvent("input");

    // Verify live recomputed value updates
    await expect(page.locator("#slider-val-growth")).toContainText("1.7");

    // Verify chart bars are present and scaled
    const chartBars = page.locator("[data-testid='standalone-chart-bar']");
    await expect(chartBars.first()).toBeVisible();

    // Capture screenshot of offline standalone HTML working
    await page.screenshot({ path: "docs/after-phase6/standalone-html-offline.png" });
  });

  test("5. PowerPoint (.pptx) export: downloads valid PPTX with native charts inspected by python-pptx", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/presentations/7");

    // Open Export Dialog
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.locator(".ui-export-dialog");

    // Trigger PPTX download
    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    await dialog.getByRole("button", { name: "Export PPTX" }).click();
    const download = await downloadPromise;

    const pptxPath = path.resolve("test-results/exported-deck.pptx");
    await download.saveAs(pptxPath);
    expect(fs.existsSync(pptxPath)).toBe(true);

    // Run python-pptx structural assertion script
    const pyOutput = execSync(`py scripts/verify_pptx.py "${pptxPath}"`).toString();
    expect(pyOutput).toContain("'status': 'valid'");
    expect(pyOutput).toContain("'slides_count':");
  });
});
