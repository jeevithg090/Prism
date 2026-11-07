// P5 · /trajectories: the journey Sankey (summary + outcome chips), students like you, and "Ask for 15 minutes".
import { test, expect } from "@playwright/test";
import { expectNoA11yViolations, watchPage } from "./utils";

test("journeys summary, outcome filter chips, and Ask for 15 minutes → toast", async ({ page }, testInfo) => {
  const watch = watchPage(page);
  await page.goto("/trajectories");
  await expect(page.getByRole("heading", { level: 1, name: "Trajectories" })).toBeVisible();

  // The Sankey card and its plain-English summary (the chart itself is aria-hidden; the caption is the text alternative).
  const journeys = page.locator("section", { has: page.getByRole("heading", { name: "Where students before you went" }) });
  await expect(journeys).toBeVisible({ timeout: 15_000 });
  const caption = journeys.locator("figcaption");
  await expect(caption).toHaveText(/\S{3,}/);
  const allSummary = (await caption.textContent())?.trim();

  // Filter chips: "All" starts pressed (its summary is about ML, the viewer's goal); Software follows its own paths.
  const chips = journeys.getByRole("group", { name: "Filter journeys by outcome" });
  const all = chips.getByRole("button", { name: /^All/ });
  const swe = chips.getByRole("button", { name: /^Software/ });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(caption).toContainText("ML");
  await swe.click();
  await expect(swe).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await expect(caption).not.toHaveText(allSummary ?? "");
  await expect(caption).toContainText(/software/i);

  // The list view is the accessible alternative to the chart, on every screen size.
  const toggle = journeys.getByRole("button", { name: /View as (list|chart)/ });
  if ((await toggle.textContent())?.includes("View as list")) await toggle.click();
  await expect(journeys.getByRole("table")).toBeVisible();
  await all.click();
  await expectNoA11yViolations(page);

  // Students like you → Ask for 15 minutes → drafted message → Send → toast.
  const like = page.getByRole("region", { name: /Students like you/ });
  const ask = like.getByRole("button", { name: /^Ask for 15 minutes with / }).first();
  await expect(ask).toBeVisible({ timeout: 15_000 });
  const first = ((await ask.getAttribute("aria-label")) ?? "").replace("Ask for 15 minutes with ", "");
  await ask.click();

  const dialog = page.getByRole("dialog", { name: `Ask ${first} for 15 minutes` });
  await expect(dialog).toBeVisible();
  const message = dialog.getByRole("textbox", { name: `Your message to ${first}` });
  await expect(message).toHaveValue(new RegExp(`^Hi ${first}`), { timeout: 15_000 });
  await expectNoA11yViolations(page);
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent: they'll see it in Community.")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expectNoA11yViolations(page);
  watch.assertClean(testInfo);
});
