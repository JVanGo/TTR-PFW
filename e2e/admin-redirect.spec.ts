import { test, expect } from "@playwright/test";

test("admin route redirects to /login when signed out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});
