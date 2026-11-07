// P5 · Pods happy path (DEMO_MODE): find a pod, start the project, land on the project view.
import { test, expect } from "@playwright/test";
import { expectNoA11yViolations } from "./utils";

test("find my pod → start our project → project view with the repo link", async ({ page }) => {
  await page.goto("/pods?demo=1");

  await expect(page.getByRole("heading", { name: "Learn faster in a pod" })).toBeVisible();
  await page.getByRole("button", { name: "Find my pod" }).click();

  const card = page.getByTestId("pod-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole("progressbar", { name: "Compatibility" })).toBeVisible();
  await expect(card.getByText(/reviews your/).first()).toBeVisible();
  await expectNoA11yViolations(page);

  await card.getByRole("button", { name: /Start our project/ }).click();
  await expect(page).toHaveURL(/\/pods\/[^/?#]+$/, { timeout: 30_000 });
  const openRepo = page.getByRole("link", { name: /Open repo/ });
  await expect(openRepo).toBeVisible({ timeout: 30_000 });
  await expect(openRepo).toHaveAttribute("href", /^https:\/\/github\.com\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});
