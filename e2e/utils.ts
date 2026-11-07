import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/** Fails on serious/critical axe violations, listing each rule with the offending selectors and axe's summary. */
export async function expectNoA11yViolations(page: Page) {
  // Let entrance animations (motion's staggered opacity fades) finish, or axe measures half-faded text as low
  // contrast. Infinite ones (skeleton pulse, spinners) never finish, so they don't count.
  await page.waitForTimeout(250);
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity || (a.playState !== "running" && !a.pending)),
      null,
      { timeout: 5_000 },
    )
    .catch(() => {});
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  if (bad.length) {
    const detail = bad
      .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 6).map((n) => `  - ${n.target.join(" ")}\n    ${(n.failureSummary ?? "").replace(/\n/g, "\n    ")}`).join("\n")}`)
      .join("\n");
    throw new Error(`axe found ${bad.length} serious/critical violation(s) on ${page.url()}:\n${detail}`);
  }
}

/** Requests the app is allowed to fail: profiles that don't exist yet (the UI falls back to a capitalised id). */
const IGNORED_FAILURES = [/\/api\/profile\/[^/?#]+$/];
/**
 * Contract routes another area is still building. Ignored only while the route is missing from this build
 * (Next answers an unknown route with its HTML 404 page); once it exists, any error it returns counts.
 */
const PENDING_ROUTES = [/^\/api\/agents\/stream$/];

/**
 * Collects console errors, uncaught page errors, failed requests and 4xx/5xx API responses while a test runs.
 * Call `assertClean()` at the end of the test.
 */
export function watchPage(page: Page, opts: { allow?: RegExp[] } = {}) {
  const problems: { text: string; url?: string }[] = [];
  const missing = new Set<string>();
  const allow = [...IGNORED_FAILURES, ...(opts.allow ?? [])];
  const pathOf = (url: string) => {
    try { return new URL(url).pathname; } catch { return url; }
  };
  const ignored = (url: string) => allow.some((re) => re.test(pathOf(url)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const loc = msg.location()?.url ?? "";
    // A failed resource is also reported as a console error by the browser.
    if (/Failed to load resource/.test(msg.text()) && loc && ignored(loc)) return;
    problems.push({ text: `console.error: ${msg.text()}${loc ? ` (${loc})` : ""}`, url: loc || undefined });
  });
  page.on("pageerror", (err) => problems.push({ text: `pageerror: ${err.message}` }));
  page.on("requestfailed", (req) => {
    const why = req.failure()?.errorText ?? "";
    // Navigations and aborted prefetches/RSC fetches are cancelled by the browser on purpose.
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(why)) return;
    if (ignored(req.url())) return;
    problems.push({ text: `requestfailed: ${req.method()} ${req.url()} ${why}`, url: req.url() });
  });
  page.on("response", (res) => {
    const url = res.url();
    const path = pathOf(url);
    if (res.status() === 404 && PENDING_ROUTES.some((re) => re.test(path)) && (res.headers()["content-type"] ?? "").includes("text/html")) {
      missing.add(url);
      return;
    }
    if (res.status() >= 500) problems.push({ text: `HTTP ${res.status()}: ${res.request().method()} ${url}`, url });
    else if (res.status() >= 400 && path.startsWith("/api/") && !ignored(url)) {
      problems.push({ text: `HTTP ${res.status()}: ${res.request().method()} ${url}`, url });
    }
  });
  const current = () => problems.filter((p) => !(p.url && missing.has(p.url))).map((p) => p.text);
  return {
    get problems() {
      return current();
    },
    assertClean(info?: TestInfo) {
      const list = current();
      if (info && list.length) void info.attach("page-problems", { body: list.join("\n"), contentType: "text/plain" });
      expect(list, "console errors / failed requests during the test").toEqual([]);
    },
  };
}
