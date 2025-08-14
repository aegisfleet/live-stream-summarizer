const { test, expect } = require('@playwright/test');

test('has correct title', async ({ page }) => {
  // Navigate to the home page.
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle('AIでホロライブの配信を要約 - ホロサマリー');
});
