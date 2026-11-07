// P5 · /community: help a newcomer (I can help → toast, the card leaves the feed), the ask composer, helpers, guides.
import { test, expect } from "@playwright/test";
import { expectNoA11yViolations, watchPage } from "./utils";

const uid = () => Math.random().toString(36).slice(2, 8);

test("I can help → thank-you toast and the request leaves the feed", async ({ page, request }, testInfo) => {
  // A fresh request from Sara (🌱), so the test never depends on (or uses up) the seeded feed.
  const message = `How do I undo my last git commit? (e2e ${uid()})`;
  const res = await request.post("/api/help", { data: { fromUserId: "sara", kind: "question", message } });
  expect(res.status()).toBe(200);

  const watch = watchPage(page);
  await page.goto("/community");
  await expect(page.getByRole("heading", { level: 1, name: "Community" })).toBeVisible();
  const feed = page.getByRole("list", { name: "Open help requests" });
  await expect(feed).toBeVisible({ timeout: 15_000 });

  const card = feed.getByTestId("help-card").filter({ hasText: message });
  await expect(card).toBeVisible();
  await expect(card.getByText("New to UoM")).toBeVisible(); // 🌱 badge pill
  await expectNoA11yViolations(page);

  await card.getByRole("button", { name: /^I can help / }).click();
  await expect(page.getByText("Thank you! +3 momentum")).toBeVisible();
  await expect(feed.getByTestId("help-card").filter({ hasText: message })).toHaveCount(0);
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});

test("an empty ask is blocked; a real ask appears in the feed as yours", async ({ page }, testInfo) => {
  const watch = watchPage(page);
  await page.goto("/community");
  const form = page.getByRole("form", { name: "Ask for help" });
  const box = form.getByRole("textbox", { name: "What do you need help with?" });
  const submit = form.getByRole("button", { name: "Ask for help" });
  await expect(box).toBeVisible({ timeout: 15_000 });

  await expect(submit).toBeDisabled();
  await box.fill("    ");
  await expect(submit).toBeDisabled();
  await box.press("Enter"); // a newline in a textarea, never a submit
  await expect(page.getByText("Posted. A helper will pick it up soon.")).toHaveCount(0);

  const message = `Could someone explain Python list comprehensions? (e2e ${uid()})`;
  await box.fill(message);
  await form.getByLabel("Kind of help").selectOption("question");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Posted. A helper will pick it up soon.")).toBeVisible();
  await expect(box).toHaveValue("");

  const mine = page.getByRole("list", { name: "Open help requests" }).getByTestId("help-card").filter({ hasText: message });
  await expect(mine).toBeVisible();
  await expect(mine.getByRole("heading", { name: /\(you\)$/ })).toBeVisible();
  await expect(mine.getByRole("button", { name: /^I can help/ })).toHaveCount(0);
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});

test("helpers this week, and Find guides drafts messages (or explains the 3-a-day limit)", async ({ page }, testInfo) => {
  // Each user gets 3 guide drafts a day; on a reused server the friendly limit message is the expected state.
  const watch = watchPage(page, { allow: [/\/api\/guides\/find$/] });
  await page.goto("/community");
  const helpers = page.locator("section", { has: page.getByRole("heading", { name: "Helpers this week" }) });
  await expect(helpers).toBeVisible({ timeout: 15_000 });
  // Opt-in: nothing is listed until the viewer asks to see it.
  await expect(helpers.getByRole("list", { name: "Helpers this week" })).toHaveCount(0);
  await helpers.getByRole("button", { name: "Show helpers" }).click();
  await expect(helpers.getByRole("list", { name: "Helpers this week" }).getByRole("listitem").first()).toBeVisible();
  await expect(helpers.getByText("Helper").first()).toBeVisible();

  const guides = page.locator("section", { has: page.getByRole("heading", { name: "Learn from practitioners" }) });
  await expect(guides.getByText("You send it yourself. We never message anyone.")).toBeVisible();
  await guides.getByRole("button", { name: "Find guides" }).click();
  const list = guides.getByRole("list", { name: "Suggested guides" });
  const limit = guides.getByRole("alert").filter({ hasText: "today's 3 drafts" });
  await expect(list.or(limit)).toBeVisible({ timeout: 20_000 });
  if (await list.isVisible()) {
    await expect(page.getByText(/^Found \d+ guides?\. Drafts are ready to copy\.$/)).toBeVisible();
    await expect(list.getByRole("listitem").first()).toBeVisible();
  }
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});
