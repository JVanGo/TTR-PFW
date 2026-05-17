import { test, expect } from "@playwright/test";

test("a public read-only route loads", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/$/);
});
