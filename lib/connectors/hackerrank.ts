import "server-only";
// HackerRank → EvidenceItems from verified platform facts: skill certificates and practice-track badges.
// There is no official user API. The public profile page (www.hackerrank.com/profile/<handle>, which serves
// server-rendered badges + certificates) reads fine directly today; if that path is blocked (403 or a
// Cloudflare challenge) we scrape the same page through Firecrawl when FIRECRAWL_API_KEY exists. If every
// path fails we degrade: emit a kind error event, keep the evidence we already have, never throw.
import { emit } from "@/lib/agents/events";
import { LLMError } from "@/lib/llm-error";
import { replayOrRecord } from "@/lib/replay";
import { getStore } from "@/lib/store";
import type { EvidenceItem, Level, SkillId } from "@/lib/types";
import { listEvidence } from "@/lib/graph/data";

export const profileUrl = (handle: string) => `https://www.hackerrank.com/profile/${encodeURIComponent(handle)}`;

export type HackerRankBadge = { name: string; stars: number };
export type HackerRankCertificate = { name: string };
export type HackerRankProfile = { badges: HackerRankBadge[]; certificates: HackerRankCertificate[] };

/**
 * Practice-track badge / certificate subject → skill ids from data/skills.json only. Conservative by design:
 * unknown tracks ("Days of Code", "Functional Programming", "Software Engineer" role certificates, …) have no
 * entry and are skipped, and levels never reach 3 (a badge star count or a passed test isn't "build").
 */
export const TRACK_SKILL: Record<string, SkillId | SkillId[]> = {
  "problem solving": ["data-structures", "algorithms"],
  python: "python", java: "java", javascript: "javascript", typescript: "typescript",
  c: "c", "c++": "cpp", sql: "sql", css: "html-css", html: "html-css",
  react: "react", node: "nodejs", "node.js": "nodejs",
  // "Days of JS" is the JavaScript practice track's profile badge.
  "days of js": "javascript",
};
/** 1–2 stars → level 1 at 0.6; 3+ stars → level 2 at 0.7. Certificates are graded tests, so a touch stronger. */
const CERT_TIER: Record<string, { level: Level; confidence: number; rank: number }> = {
  "basic": { level: 1, confidence: 0.75, rank: 1 },
  "intermediate": { level: 2, confidence: 0.75, rank: 2 },
  "advanced": { level: 2, confidence: 0.8, rank: 3 },
};

const starsLevel = (stars: number): Level => (stars >= 3 ? 2 : 1);
const starsConfidence = (stars: number): number => (stars >= 3 ? 0.7 : 0.6);
const certTier = (name: string) => CERT_TIER[/\((basic|intermediate|advanced)\)/i.exec(name)?.[1]?.toLowerCase() ?? ""] ?? null;
const certSubject = (name: string) => name.replace(/\((?:basic|intermediate|advanced)\)/i, "").replace(/\s+/g, " ").trim();
const normalise = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();
const skillsFor = (name: string): SkillId[] => {
  const v = TRACK_SKILL[normalise(name)];
  return Array.isArray(v) ? v : v ? [v] : [];
};

/** Parses the server-rendered profile HTML into badges (name + stars) and verified certificates. Pure. */
export function parseProfileHtml(html: string): HackerRankProfile {
  const badges = new Map<string, HackerRankBadge>();
  for (const block of html.split('<div class="hacker-badge">').slice(1)) {
    const name = block.match(/<text class="badge-title"[^>]*>([^<]+)<\/text>/)?.[1]?.trim();
    if (!name) continue;
    // Stars to date are shown as that many badge-star icons (verified against a live profile). If the
    // renderer stops showing them, a conservative floor comes from the badge colour tier.
    let stars = (block.match(/class="[^"]*badge-star[^"]*"/g) ?? []).length;
    if (!stars) {
      const tier = /class="[^"]*ui-badge level-(gold|silver|bronze)/.exec(block)?.[1];
      stars = tier === "gold" ? 5 : tier === "silver" ? 3 : tier === "bronze" ? 1 : 0;
    }
    if (stars > 0) badges.set(normalise(name), { name, stars: Math.min(6, stars) });
  }
  const certificates = new Map<string, HackerRankCertificate>();
  for (const m of html.matchAll(/certificate-link[^>]*href="\/certificates\/([a-f0-9]{8,16})"[\s\S]{0,2500}?sr-only">Certificate:\s*<\/span>([^<]+)<\/h2>/g)) {
    const name = m[2].replace(/\s+/g, " ").trim();
    if (name) certificates.set(normalise(name), { name });
  }
  return { badges: [...badges.values()], certificates: [...certificates.values()] };
}

/** True when the HTML actually holds a public profile section (error and Cloudflare pages hold neither). */
export function looksLikePublicProfile(html: string): boolean {
  return /hacker-badges|badge-title|certificate-link/.test(html);
}

/** Verified facts → EvidenceItems, merged per skill (e.g. a Python badge and a Python certificate become one id). */
export function pageToEvidence(userId: string, page: HackerRankProfile, url: string, now = new Date()): EvidenceItem[] {
  type Acc = { badgeFact?: string; certFact?: string; certRank: number; level: Level; confidence: number };
  const acc = new Map<SkillId, Acc>();
  const merge = (skillId: SkillId, badgeFact: string | undefined, certFact: string | undefined, certRank: number, level: Level, confidence: number) => {
    const a = acc.get(skillId) ?? { certRank: 0, level: 1, confidence: 0 };
    if (badgeFact && !a.badgeFact) a.badgeFact = badgeFact; // one badge fact per skill; the strongest certificate later
    if (certFact && certRank >= a.certRank) {
      a.certFact = certFact; // several certificates for one subject: name the strongest in the quote
      a.certRank = certRank;
    }
    a.level = Math.max(a.level, level) as Level;
    a.confidence = Math.max(a.confidence, confidence);
    acc.set(skillId, a);
  };
  for (const b of page.badges) {
    for (const skillId of skillsFor(b.name)) {
      const stars = `${b.stars} ${b.stars === 1 ? "star" : "stars"}`;
      merge(skillId, `${b.name} badge with ${stars}`, undefined, 0, starsLevel(b.stars), starsConfidence(b.stars));
    }
  }
  for (const c of page.certificates) {
    const tier = certTier(c.name);
    if (!tier) continue; // role certificates and non-graded names aren't skill evidence
    for (const skillId of skillsFor(certSubject(c.name))) merge(skillId, undefined, `verified ${c.name} certificate`, tier.rank, tier.level, tier.confidence);
  }
  return [...acc.entries()].map(([skillId, a]) => {
    const facts = [a.badgeFact, a.certFact].filter((f): f is string => !!f);
    return {
      id: `ev_${userId}_${skillId}_hackerrank`, userId, skillId, level: a.level, confidence: a.confidence,
      source: "hackerrank" as const, url, quote: `HackerRank ${facts.join(" and a ")}`, createdAt: now.toISOString(),
    };
  });
}

const BLOCKED = /checking your browser|attention required|challenge-platform|cf-error-details/i;

/** A direct read of the public profile page (works today without any key; demo-replayable by handle). */
function getProfileHtml(handle: string): Promise<string> {
  return replayOrRecord<string>(
    "hackerrank",
    { op: "profile", handle },
    async () => {
      const res = await fetch(profileUrl(handle), {
        headers: { Accept: "text/html", "User-Agent": "keystone-evidence-agent" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HackerRank ${res.status}`);
      const html = await res.text();
      if (BLOCKED.test(html)) throw new Error("HackerRank blocked the request");
      return html;
    },
    { loose: false, meta: { kind: "profile", label: `hackerrank profile @${handle}` }, validate: (v) => typeof v === "string" && v.length > 500, shouldRecord: looksLikePublicProfile },
  );
}

/** Firecrawl fallback for the same page, used only when the direct read is blocked (needs FIRECRAWL_API_KEY). */
function scrapeProfileHtml(handle: string): Promise<string> {
  return replayOrRecord<string>(
    "hackerrank",
    { op: "scrape-page", handle },
    async () => {
      const key = process.env.FIRECRAWL_API_KEY;
      if (!key) throw new LLMError("no_key");
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ url: profileUrl(handle), formats: ["html"] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
      const html = ((await res.json()) as { data?: { html?: string } }).data?.html;
      if (!html) throw new Error("Firecrawl returned no HTML");
      if (BLOCKED.test(html)) throw new Error("HackerRank blocked the scrape");
      return html;
    },
    { loose: false, requires: ["FIRECRAWL_API_KEY"], meta: { kind: "scrape", label: `hackerrank profile @${handle}` }, validate: (v) => typeof v === "string" && v.length > 500, shouldRecord: looksLikePublicProfile },
  );
}

/**
 * Reads @handle's HackerRank badges and certificates and turns them into evidence. Saves each item to the
 * store (deterministic ids, so re-syncs upsert). On any HackerRank failure it emits an error-status event and
 * returns the evidence you already have — it never throws.
 */
export async function syncHackerRankEvidence(i: { userId: string; handle: string; runId?: string }): Promise<EvidenceItem[]> {
  const { userId, handle, runId } = i;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "evidence", status, message, ...(data ? { data } : {}) });
  };
  say("started", `Evidence Agent: reading HackerRank for @${handle}`);
  try {
    let html: string;
    let scraped = false;
    try {
      html = await getProfileHtml(handle);
    } catch {
      html = await scrapeProfileHtml(handle); // direct read blocked: the Firecrawl path (skipped without a key)
      scraped = true;
    }
    let page = parseProfileHtml(html);
    if (!scraped && !looksLikePublicProfile(html)) {
      // The direct call read something that isn't a public profile (error or challenge page): one scrape attempt.
      try {
        page = parseProfileHtml(await scrapeProfileHtml(handle));
      } catch { /* keep what the direct page gave us (an empty profile) */ }
    }
    const items = pageToEvidence(userId, page, profileUrl(handle));
    if (page.badges.length + page.certificates.length) {
      say("progress", `read ${page.badges.length} badges · ${page.certificates.length} certificates`, { badges: page.badges.length, certificates: page.certificates.length });
    }
    const store = getStore();
    await Promise.all(items.map((e) => store.upsert("evidence", e.id, e, userId)));
    const level2 = items.filter((e) => e.level >= 2).length;
    if (items.length) say("done", `found ${items.length} skills on HackerRank (${level2} at level 2)`, { skills: items.length, level2 });
    else say("done", `no public HackerRank badges or certificates found for @${handle} — nothing new yet`, { badges: 0, certificates: 0 });
    return listEvidence(userId);
  } catch (err) {
    say("error", "HackerRank wasn't available just now: keeping the evidence we already have", { reason: err instanceof Error ? err.message : "unknown" });
    return listEvidence(userId);
  }
}
