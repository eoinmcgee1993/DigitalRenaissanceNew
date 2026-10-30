import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Exercise the reliable CSS-reel fallback in CI instead of depending on
  // GPU/WebGL availability or a third-party 3D renderer.
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return originalGetContext.call(this, type, ...args);
    };
  });

  await page.goto("/money-machine/");
  await expect(page.locator("#stage")).toHaveClass(/is-2d/);
});

test("loads the Money Machine and its core controls", async ({ page }) => {
  await expect(page).toHaveTitle(/Money Machine \| Digital Renaissance/);
  await expect(page.getByRole("heading", { name: "Digital Renaissance Money Machine" })).toBeAttached();
  await expect(page.locator("#spin")).toBeVisible();
  await expect(page.locator("#modes .mode")).toHaveCount(7);
  await expect(page.locator("#modes .mode[aria-pressed='true']")).toHaveCount(1);
  await expect(page.locator("#reels2d")).toBeVisible();
  await expect(page.locator("#vault")).toBeVisible();
});

test("spins an idea and renders its Reality Scorecard", async ({ page }) => {
  await page.locator("#spin").click();

  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#idea-name")).not.toBeEmpty();
  await expect(page.locator("#pitch")).not.toBeEmpty();
  await expect(page.locator("#f-customer")).not.toBeEmpty();
  await expect(page.locator("#f-offer")).not.toBeEmpty();
  await expect(page.locator("#scores .score-row")).toHaveCount(5);
  await expect(page.locator("#total")).toHaveText(/\d+/);
  await expect(page.locator("#spin")).toBeEnabled();
});

test("builds the complete 12-part execution blueprint", async ({ page }) => {
  await page.locator("#spin").click();
  await page.locator("#make-real").click();

  await expect(page.locator("#blueprint")).toBeVisible();
  await expect(page.locator("#bp-sections details")).toHaveCount(12);
  await expect(page.locator("#bp-title")).toContainText("BUILD THIS");
  await expect(page.locator("#bp-name")).not.toBeEmpty();
});

test("vaulted ideas persist after a page reload", async ({ page }) => {
  await page.locator("#spin").click();
  const ideaName = (await page.locator("#idea-name").textContent())?.trim();

  await page.locator("#vault-it").click();
  await expect(page.locator("#vault-list li")).toHaveCount(1);
  await expect(page.locator("#vault-list .nm")).toHaveText(ideaName || "");

  await page.reload();
  await expect(page.locator("#vault-list li")).toHaveCount(1);
  await expect(page.locator("#vault-list .nm")).toHaveText(ideaName || "");
});

test("mode selection updates the active state", async ({ page }) => {
  const cashMode = page.locator("#modes .mode").filter({ hasText: "CASH NOW" });
  await expect(cashMode).toBeVisible();
  await cashMode.click();

  await expect(cashMode).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#modes .mode[aria-pressed='true']")).toHaveCount(1);
});
