// P5 · Pods happy path (DEMO_MODE): find a pod, start the project, land on the project view.
import { test, expect } from "@playwright/test";
import { expectNoA11yViolations, watchPage } from "./utils";

test("find my pod → start our project → project view with the repo link", async ({ page }, testInfo) => {
  const watch = watchPage(page);
  await page.goto("/pods?demo=1");

  await expect(page.getByRole("heading", { name: "Learn faster in a pod" })).toBeVisible();
  await page.getByRole("button", { name: "Find my pod" }).click();

  const card = page.getByTestId("pod-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole("progressbar", { name: "Compatibility" })).toBeVisible();
  await expect(card.getByText(/reviews your/).first()).toBeVisible();
  await expect(page.getByText(/^You're in Pod /)).toBeVisible(); // the success toast
  await expectNoA11yViolations(page);

  await card.getByRole("button", { name: /Start our project/ }).click();
  await expect(page).toHaveURL(/\/pods\/[^/?#]+$/, { timeout: 30_000 });
  const openRepo = page.getByRole("link", { name: /Open repo/ });
  await expect(openRepo).toBeVisible({ timeout: 30_000 });
  await expect(openRepo).toHaveAttribute("href", /^https:\/\/github\.com\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});

test("an unknown pod id shows a kind error, not a crash", async ({ page }, testInfo) => {
  const watch = watchPage(page, { allow: [/\/api\/pods\/pod_does_not_exist$/] });
  await page.goto("/pods/pod_does_not_exist");
  await expect(page.getByRole("heading", { name: "We couldn't load this pod" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Use demo data" })).toBeVisible();
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});

test("loading states are announced and axe-clean while the API is slow", async ({ page }) => {
  const slow = (pattern: string) =>
    page.route(pattern, async (route) => {
      await new Promise((r) => setTimeout(r, 2_500));
      await route.continue().catch(() => {});
    });
  await slow("**/api/pods?userId=*");
  await page.goto("/pods");
  await expect(page.getByRole("status", { name: "Loading your pod" })).toBeVisible();
  await expectNoA11yViolations(page);

  await slow("**/api/pods/pod_demo01");
  await page.goto("/pods/pod_demo01");
  await expect(page.getByRole("status", { name: "Loading your pod's project" })).toBeVisible();
  await expectNoA11yViolations(page);
});
