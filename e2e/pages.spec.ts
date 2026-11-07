// Every page loads: 200, one visible h1, axe clean, no console errors or failed requests.
// Built pages must pass; pages other agents are still building skip automatically while their route 404s.
import { test, expect } from "@playwright/test";
import { expectNoA11yViolations, watchPage } from "./utils";

const BUILT = ["/", "/pods", "/trajectories", "/community", "/lecturer", "/pods/pod_demo01"];
const COMING = [
  "/dashboard", "/onboard", "/map", "/roadmap", "/market", "/interview", "/launch", "/challenge",
  "/profile/aisha", "/coach", "/governance",
];

for (const route of [...BUILT, ...COMING]) {
  test(`${route} loads with an h1 and no serious a11y issues`, async ({ page }, testInfo) => {
    const watch = watchPage(page);
    const res = await page.goto(route);
    const status = res?.status() ?? 0;
    test.skip(COMING.includes(route) && status === 404, `${route} isn't built yet (404)`);
    expect(status, `${route} status`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
    // Settle: wait for loading skeletons to resolve (not "networkidle": an agent event stream may stay open).
    await page.waitForLoadState("load");
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 }).catch(() => {});
    await expectNoA11yViolations(page);
    watch.assertClean(testInfo);
  });
}
