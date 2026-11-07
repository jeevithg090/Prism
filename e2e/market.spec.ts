import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./utils";

test("Industry Radar shows role demand and the trend chart", async ({ page }) => {
  await page.goto("/market?demo=1");
  await expect(page.getByRole("heading", { name: "Industry Radar" })).toBeVisible();
  await expect(page.getByText("214", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Data analyst" }).click();
  await expect(page.getByText("176", { exact: true })).toBeVisible();

  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expectNoA11yViolations(page);
});
