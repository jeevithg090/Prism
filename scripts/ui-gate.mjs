#!/usr/bin/env node
// Keystone UI gate: a page is not done until this passes in a real browser.
//
//   node scripts/ui-gate.mjs                         # default routes on http://localhost:3000
//   node scripts/ui-gate.mjs --base http://localhost:3311 /dashboard /map
//   node scripts/ui-gate.mjs --only /pods?demo=1     # just the routes you name
//
// For every route at 1440x900 and 390x844 it loads the page (network idle), then:
//   FAIL  axe serious/critical violations (WCAG 2.2 AA tags)
//   FAIL  horizontal overflow (documentElement.scrollWidth > innerWidth)
//   FAIL  visible text smaller than 13px
//   FAIL  <img> without alt, buttons/links without an accessible name
//   FAIL  HTTP status >= 400 or the page failed to load
//   WARN  more than one primary-filled button above the fold, no <h1>, console errors,
//         axe moderate/minor violations
// Screenshots (full page) go to .ui-gate/<route>-<width>.png. Exit code 1 on any FAIL.
//
// Rules behind each check: DESIGN.md ("The 4 states", "Accessibility", "Projector rules").

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const DEFAULT_ROUTES = ["/pods?demo=1", "/trajectories", "/community"];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const MIN_TEXT_PX = 13;

function parseArgs(argv) {
  const opts = { base: process.env.UI_GATE_BASE ?? "http://localhost:3000", extra: [], only: false, settle: 900, out: ".ui-gate", shots: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") opts.base = argv[++i];
    else if (a.startsWith("--base=")) opts.base = a.slice(7);
    else if (a === "--only") opts.only = true;
    else if (a === "--settle") opts.settle = Number(argv[++i]);
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--no-shots") opts.shots = false;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a.startsWith("/")) opts.extra.push(a);
    else if (a.startsWith("http")) opts.base = a;
    else {
      console.error(`ui-gate: unknown argument "${a}" (routes start with "/")`);
      process.exit(2);
    }
  }
  opts.base = opts.base.replace(/\/$/, "");
  const routes = opts.only ? opts.extra : [...DEFAULT_ROUTES, ...opts.extra];
  opts.routes = [...new Set(routes)];
  return opts;
}

function slug(route) {
  const s = route.replace(/^\//, "").replace(/[?&=#/]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").replace(/-+$/, "");
  return s || "home";
}

// Runs inside the page. Returns the DOM-level findings for one viewport.
function inspectPage(minText) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = el; n && n instanceof Element; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
      if (Number(cs.opacity) === 0) return false;
      if (cs.clipPath === "inset(50%)" || (cs.clip && cs.clip.startsWith("rect(0") && r.width <= 1)) return false;
    }
    return true;
  }
  function isSrOnly(el) {
    for (let n = el; n && n instanceof Element; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === "absolute" && (cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.clipPath === "inset(50%)")) return true;
      if (n.classList?.contains("sr-only")) return true;
    }
    return false;
  }
  function describe(el) {
    if (!el) return "?";
    const parts = [];
    for (let n = el, d = 0; n && n instanceof Element && d < 3; n = n.parentElement, d++) {
      let p = n.tagName.toLowerCase();
      if (n.id) p += `#${n.id}`;
      const tid = n.getAttribute("data-testid");
      if (tid) p += `[data-testid=${tid}]`;
      else if (n.classList.length) p += "." + [...n.classList].slice(0, 2).join(".");
      parts.unshift(p);
      if (n.id || tid) break;
    }
    return parts.join(" > ").slice(0, 140);
  }
  function textOf(node) {
    // Accessible-name-ish text: skips aria-hidden subtrees, takes img alt and svg <title>.
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element)) return "";
    if (node.getAttribute("aria-hidden") === "true") return "";
    if (node.tagName === "IMG") return node.getAttribute("alt") ?? "";
    if (node.getAttribute("aria-label")) return node.getAttribute("aria-label");
    if (node.tagName.toLowerCase() === "title") return node.textContent ?? "";
    let t = "";
    for (const c of node.childNodes) t += " " + textOf(c);
    return t;
  }
  function accessibleName(el) {
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (t) return t;
    }
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return al.trim();
    const t = textOf(el).replace(/\s+/g, " ").trim();
    if (t) return t;
    if (el.getAttribute("title")?.trim()) return el.getAttribute("title").trim();
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab?.textContent?.trim()) return lab.textContent.trim();
    }
    return "";
  }

  // 1. Horizontal overflow, with the widest offenders.
  const scrollWidth = document.documentElement.scrollWidth;
  const overflow = scrollWidth > vw;
  const overflowers = [];
  if (overflow) {
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && isVisible(el)) {
        // Only report the outermost offender in a chain.
        if (!overflowers.some((o) => o.el.contains(el))) overflowers.push({ el, right: Math.round(r.right) });
      }
      if (overflowers.length > 6) break;
    }
  }

  // 2. Small text: every visible, non-empty text node.
  const small = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNodes = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = (n.textContent ?? "").trim();
    if (!txt) continue;
    const el = n.parentElement;
    if (!el || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
    if (!isVisible(el) || isSrOnly(el)) continue;
    textNodes++;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < minText) small.push({ text: txt.slice(0, 40), px: Math.round(fs * 10) / 10, where: describe(el) });
  }

  // 3. Images without alt (decorative images use alt="").
  const noAlt = [...document.querySelectorAll("img:not([alt])")].filter(isVisible).map((el) => ({ where: describe(el), src: (el.getAttribute("src") ?? "").slice(0, 60) }));

  // 4. Buttons and links with no accessible name.
  const controls = [...document.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"]')].filter(isVisible);
  const unnamed = controls.filter((el) => !accessibleName(el)).map((el) => ({ where: describe(el), html: el.outerHTML.slice(0, 120) }));

  // 5. Primary-filled buttons above the fold (bg equals the resolved --primary).
  const probe = document.createElement("span");
  probe.style.backgroundColor = "var(--primary)";
  probe.style.position = "absolute";
  document.body.appendChild(probe);
  const primaryBg = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const primaries = [...document.querySelectorAll('button, a[href], [role="button"]')]
    .filter((el) => {
      if (!isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.top >= vh || r.bottom <= 0) return false;
      return getComputedStyle(el).backgroundColor === primaryBg;
    })
    .map((el) => accessibleName(el).slice(0, 40) || describe(el));

  const h1s = [...document.querySelectorAll("h1")].filter(isVisible).map((h) => h.textContent.trim().slice(0, 60));

  return {
    scrollWidth,
    vw,
    overflow,
    overflowers: overflowers.map((o) => ({ where: describe(o.el), right: o.right })),
    textNodes,
    small,
    noAlt,
    unnamed,
    primaries,
    h1s,
  };
}

async function checkRoute(browser, opts, route, vp) {
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "no-preference" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  const badResponses = [];
  page.on("response", (res) => {
    if (res.status() >= 400 && res.request().resourceType() !== "document") badResponses.push(`${res.status()} ${res.url().replace(opts.base, "")}`);
  });

  const r = { route, width: vp.width, fails: [], warns: [], cells: {} };
  try {
    const resp = await page.goto(opts.base + route, { waitUntil: "networkidle", timeout: 60_000 });
    const status = resp?.status() ?? 0;
    if (status >= 400) r.fails.push(`HTTP ${status}`);
    await page.waitForTimeout(opts.settle);
    try {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    } catch {
      /* long-polling pages: settle is enough */
    }

    // axe
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const minor = axe.violations.filter((v) => !(v.impact === "serious" || v.impact === "critical"));
    r.cells.axe = serious.length ? `${serious.reduce((n, v) => n + v.nodes.length, 0)} serious` : "ok";
    for (const v of serious) {
      const targets = v.nodes.slice(0, 3).map((n) => {
        const t = n.target.join(" ");
        const why = n.any?.[0]?.message ?? n.failureSummary?.split("\n")[1] ?? "";
        return `${t}${why ? ` (${why.slice(0, 150)})` : ""}`;
      });
      r.fails.push(`axe ${v.id} [${v.impact}] x${v.nodes.length}: ${targets.join(" | ")}`);
    }
    for (const v of minor) r.warns.push(`axe ${v.id} [${v.impact}] x${v.nodes.length}: ${v.help}`);

    // DOM checks
    const d = await page.evaluate(inspectPage, MIN_TEXT_PX);
    r.cells.overflow = d.overflow ? `+${d.scrollWidth - d.vw}px` : "ok";
    if (d.overflow) r.fails.push(`horizontal overflow: scrollWidth ${d.scrollWidth} > ${d.vw}; offenders: ${d.overflowers.map((o) => `${o.where} (right ${o.right})`).join(" | ") || "unknown"}`);

    r.cells.text = d.small.length ? `${d.small.length} <${MIN_TEXT_PX}px` : "ok";
    if (d.small.length) {
      const sample = d.small.slice(0, 5).map((s) => `"${s.text}" ${s.px}px @ ${s.where}`);
      r.fails.push(`text under ${MIN_TEXT_PX}px x${d.small.length} of ${d.textNodes}: ${sample.join(" | ")}`);
    }

    r.cells.alt = d.noAlt.length ? `${d.noAlt.length} missing` : "ok";
    if (d.noAlt.length) r.fails.push(`img without alt x${d.noAlt.length}: ${d.noAlt.slice(0, 3).map((i) => `${i.where} ${i.src}`).join(" | ")}`);

    r.cells.names = d.unnamed.length ? `${d.unnamed.length} unnamed` : "ok";
    if (d.unnamed.length) r.fails.push(`button/link without accessible name x${d.unnamed.length}: ${d.unnamed.slice(0, 3).map((u) => `${u.where} ${u.html}`).join(" | ")}`);

    r.cells.primary = String(d.primaries.length);
    if (d.primaries.length > 1) r.warns.push(`${d.primaries.length} primary buttons above the fold (one primary action per screen): ${d.primaries.join(", ")}`);
    if (d.h1s.length === 0) r.warns.push("no visible <h1> (use PageHeader)");
    if (d.h1s.length > 1) r.warns.push(`${d.h1s.length} visible <h1>s: ${d.h1s.join(" | ")}`);
    const otherErrors = consoleErrors.filter((m) => !m.startsWith("Failed to load resource"));
    if (badResponses.length) r.warns.push(`failed requests x${badResponses.length}: ${[...new Set(badResponses)].slice(0, 4).join(" | ")}`);
    if (otherErrors.length) r.warns.push(`console errors x${otherErrors.length}: ${otherErrors.slice(0, 2).join(" | ")}`);

    if (opts.shots) {
      const file = path.join(opts.out, `${slug(route)}-${vp.width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      r.shot = file;
    }
  } catch (e) {
    r.fails.push(`page failed: ${String(e?.message ?? e).split("\n")[0]}`);
  } finally {
    await context.close();
  }
  r.result = r.fails.length ? "FAIL" : r.warns.length ? "WARN" : "PASS";
  return r;
}

function pad(s, n) {
  s = String(s ?? "");
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.routes.length) {
    console.log("usage: node scripts/ui-gate.mjs [--base URL] [--only] [--settle ms] [--no-shots] [/route ...]");
    process.exit(opts.help ? 0 : 2);
  }
  await mkdir(opts.out, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.error(`ui-gate: could not start Chromium (${String(e?.message ?? e).split("\n")[0]}). Run: npx playwright install chromium`);
    process.exit(2);
  }
  try {
    const probe = await fetch(opts.base, { redirect: "manual" }).catch(() => null);
    if (!probe) {
      console.error(`ui-gate: nothing is answering at ${opts.base}. Start the app first (npm run dev, or DEMO_MODE=true npx next start -p 3311).`);
      process.exit(2);
    }

    console.log(`ui-gate: ${opts.routes.length} route(s) x ${VIEWPORTS.length} widths on ${opts.base}\n`);
    const results = [];
    for (const route of opts.routes) {
      for (const vp of VIEWPORTS) {
        const r = await checkRoute(browser, opts, route, vp);
        results.push(r);
        process.stdout.write(`  ${pad(r.result, 4)}  ${route} @ ${vp.width}\n`);
      }
    }

    const cols = [
      ["Route", 26],
      ["Width", 6],
      ["axe", 11],
      ["Overflow", 9],
      ["Text>=13", 10],
      ["Alt", 10],
      ["Names", 10],
      ["Primary", 8],
      ["Result", 6],
    ];
    const line = cols.map(([, n]) => "-".repeat(n)).join("-+-");
    console.log("\n" + cols.map(([h, n]) => pad(h, n)).join(" | "));
    console.log(line);
    for (const r of results) {
      const c = r.cells;
      console.log(
        [r.route, r.width, c.axe ?? "-", c.overflow ?? "-", c.text ?? "-", c.alt ?? "-", c.names ?? "-", c.primary ?? "-", r.result]
          .map((v, i) => pad(v, cols[i][1]))
          .join(" | "),
      );
    }

    const failing = results.filter((r) => r.fails.length);
    const warning = results.filter((r) => r.warns.length);
    if (failing.length) {
      console.log("\nFAIL details");
      for (const r of failing) {
        console.log(`\n  ${r.route} @ ${r.width}`);
        for (const f of r.fails) console.log(`    FAIL ${f}`);
      }
    }
    if (warning.length) {
      console.log("\nWARN details");
      for (const r of warning) {
        console.log(`\n  ${r.route} @ ${r.width}`);
        for (const w of r.warns) console.log(`    WARN ${w}`);
      }
    }
    if (opts.shots) console.log(`\nScreenshots: ${path.resolve(opts.out)}/ (open them and look: the gate cannot judge taste)`);
    const nFail = results.reduce((n, r) => n + r.fails.length, 0);
    console.log(`\nUI-GATE: ${nFail ? `FAIL ${nFail}` : "PASS"} (${results.filter((r) => r.result === "PASS").length} pass, ${warning.length} with warnings, ${failing.length} failing of ${results.length})`);
    process.exitCode = nFail ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("ui-gate crashed:", e);
  process.exit(2);
});
