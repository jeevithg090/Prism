// P5 · /lecturer: anonymous cohort stat cards, the uncovered-gaps chart summary, lab ideas (copy to module plan).
import { test, expect } from "@playwright/test";
import { expectNoA11yViolations, watchPage } from "./utils";

test("stat cards, gaps chart summary, and Copy to module plan → clipboard + toast", async ({ page, context, baseURL }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseURL!).origin });
  const watch = watchPage(page);
  await page.goto("/lecturer");
  await expect(page.getByRole("heading", { level: 1, name: "Lecturer Insights" })).toBeVisible();
  await expect(page.getByText("BSc Computer Science", { exact: false }).first()).toBeVisible();

  // Three headline stat cards (anonymous totals only).
  const stats = page.getByTestId("lecturer-stats");
  await expect(stats).toBeVisible({ timeout: 15_000 });
  await expect(stats.getByText("Students in this cohort")).toBeVisible();
  await expect(stats.getByText(/^Targeting .+ roles$/)).toBeVisible();
  await expect(stats.getByText("Top gap no module covers")).toBeVisible();
  await expect(stats.getByText(/^\d+$/).first()).toBeVisible();

  // The chart's plain-English summary, plus a screen-reader table behind it.
  await expect(page.getByTestId("gaps-chart")).toBeVisible();
  await expect(page.getByTestId("gaps-summary")).toHaveText(/\d+%/);
  await expect(page.getByRole("table", { name: /Skills no module covers/ })).toBeAttached();

  // Peer teaching numbers.
  await expect(page.getByRole("heading", { name: "Learning by teaching in your cohort" })).toBeVisible();
  await expectNoA11yViolations(page);

  // Lab ideas → Copy to module plan.
  const labs = page.getByRole("list", { name: "Suggested practical labs" });
  await expect(labs.getByRole("listitem").first()).toBeVisible();
  const firstLab = labs.getByRole("listitem").first();
  await firstLab.getByRole("button", { name: "Copy to module plan" }).click();
  await expect(page.getByText("Lab idea copied")).toBeVisible();
  await expect(firstLab.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.length).toBeGreaterThan(20);
  await expect(firstLab).toContainText(copied.slice(0, 40));
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});

test("a programme under 10 students shows nothing identifiable", async ({ page }, testInfo) => {
  const watch = watchPage(page);
  await page.goto("/lecturer?programmeId=tiny-programme");
  await expect(page.getByRole("heading", { name: "Not enough students to show insights yet" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("lecturer-stats")).toHaveCount(0);
  await expect(page.getByTestId("gaps-chart")).toHaveCount(0);
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});

test("loading states are announced and axe-clean while the API is slow", async ({ page }) => {
  for (const p of ["**/api/lecturer/cohort?*", "**/api/lecturer/insights?*"]) {
    await page.route(p, async (route) => {
      await new Promise((r) => setTimeout(r, 2_500));
      await route.continue().catch(() => {});
    });
  }
  await page.goto("/lecturer");
  await expect(page.getByRole("status", { name: "Loading cohort numbers" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading lab ideas" })).toBeVisible();
  await expectNoA11yViolations(page);
});
