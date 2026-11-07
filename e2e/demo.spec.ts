import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "@/e2e/utils";

test("demo bridge journey: dashboard, map, roadmap", async ({ page }) => {
  await page.goto("/dashboard?demo=1");
  await expect(page.getByText(/38% of the way to ML engineer/)).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/map?demo=1");
  await expect(page.getByRole("img", { name: /Bridge Map graph with/ })).toBeVisible();
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("table")).toContainText("Docker");
  await expectNoA11yViolations(page);

  await page.goto("/roadmap?demo=1");
  await page.getByRole("button", { name: "Why?" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("41% of");
  await expectNoA11yViolations(page);
});

test("onboarding demo opens the activity panel when the bridge is built", async ({ page }) => {
  await page.goto("/onboard?demo=1");
  await page.getByLabel("Your name").fill("Aisha");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /ML engineer/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Build my bridge →" }).click();
  await expect(page).toHaveURL(/dashboard\?demo=1/);
  await expect(page.getByRole("dialog")).toContainText("Agents at work");
  await expectNoA11yViolations(page);
});

test("landing demo CTA includes demo mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Try the demo/ })).toHaveAttribute("href", "/dashboard?demo=1");
  await expectNoA11yViolations(page);
});
