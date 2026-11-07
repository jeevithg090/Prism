import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
export async function expectNoA11yViolations(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  if (bad.length) throw new Error(bad.map((v) => v.id).join(", "));
}
