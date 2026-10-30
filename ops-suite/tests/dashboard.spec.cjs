const { test, expect } = require('@playwright/test');

test.describe('Ops Suite Dashboard Core Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/ops-suite/');
  });

  test('loads the dashboard and labels prototype metrics as simulated', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Digital Renaissance');
    await expect(page.locator('text=Simulated ROI')).toBeVisible();
    await expect(page.locator('#system-status')).toHaveText('Simulated');
  });

  test('agent cycle completes and returns to idle', async ({ page }) => {
    await page.locator('#start-cycle-btn').click();
    await expect(page.locator('#cycle-status')).toBeVisible();
    await expect(page.locator('#metric-agents')).toContainText('Active');
    await expect(page.locator('#cycle-complete')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#metric-agents')).toContainText('Idle');
  });
});
