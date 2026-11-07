import { test, expect } from "@playwright/test";
import { expectNoA11yViolations } from "./utils";

// DEMO_MODE (playwright.config webServer env): /api/interview/config returns no signedUrl,
// nextQuestion falls back to the scripted questions and /api/interview/feedback scores with the neutral fallback when no LLM key is set.
test.describe("mock interview", () => {
  test.beforeEach(async ({ page }) => {
    // Keep the run silent and deterministic: no real speech synthesis in CI.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window, "speechSynthesis", {
          configurable: true,
          value: { speak: () => {}, cancel: () => {}, getVoices: () => [] },
        });
      } catch {
        /* leave the browser's own implementation */
      }
    });
  });

  test("text mode: pre-call -> answer one question -> end -> feedback", async ({ page }) => {
    await page.goto("/interview?demo=1");

    await expect(page.getByRole("heading", { name: "Practise your interview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
    await expect(page.getByLabel("Role", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start interview" })).toBeEnabled();
    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "Use text mode" }).click();

    const captions = page.getByRole("log", { name: "Live captions" });
    await expect(captions.getByText("Interviewer", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Question 1/)).toBeVisible();

    const answer = page.getByLabel("Your answer");
    await answer.fill(
      "I'm a first-year Computer Science student at Manchester. I got into computing by building small Python tools for my family.",
    );
    await page.getByRole("button", { name: "Send answer" }).click();
    await expect(captions.getByText("You", { exact: true }).first()).toBeVisible();
    await expect(answer).toHaveValue("");
    await expect(page.getByText(/Question 2/)).toBeVisible({ timeout: 15_000 });
    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "End interview" }).click();

    await expect(page.getByRole("heading", { name: /Nice work/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("meter")).toHaveCount(4);
    await expect(page.getByText(/\/min/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "See it on your passport" })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
