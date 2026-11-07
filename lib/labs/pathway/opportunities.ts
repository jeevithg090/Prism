// Shortest Path to Opportunity: where the listings come from.
// Always the labelled demo fixture; live results from Firecrawl search are added when a key exists and DEMO_MODE is
// off. Live text is untrusted: hidden Unicode is stripped, anything the injection shield rates high is dropped, and
// skills are matched deterministically (the text never reaches a model).
import "server-only";
import { matchSkills } from "@/lib/agents/skillmap";
import { neutralize, scanForInjection, stripHiddenUnicode } from "@/lib/agents/safety/injection";
import { fcSearch, type FcResult } from "@/lib/connectors/firecrawl";
import { readData } from "@/lib/graph/data";
import { roleName } from "@/lib/graph/roles";
import { EffortFileZ, OpportunityFileZ, OpportunityZ, type EffortTable, type Opportunity } from "./types";

export const MAX_LIVE = 5;

export function demoOpportunities(): Opportunity[] {
  const parsed = OpportunityFileZ.safeParse(readData("data/fixtures/labs/pathway.opportunities.json"));
  return parsed.success ? parsed.data.opportunities : [];
}

const FALLBACK_EFFORT: EffortTable = { label: "Keystone estimate", note: "", hours: {}, byCategory: {} };
export function effortTable(): EffortTable {
  const parsed = EffortFileZ.safeParse(readData("data/fixtures/labs/pathway.effort.json"));
  return parsed.success ? parsed.data : FALLBACK_EFFORT;
}

const clean = (s: string, max: number) => stripHiddenUnicode(s).replace(/\s+/g, " ").trim().slice(0, max);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "listing";

/** One search result → an opportunity, or a reason it was dropped. Pure. */
export function fromSearchResult(r: FcResult, roleId: string, k: number): { opportunity?: Opportunity; dropped?: "unsafe" | "no-skills" | "invalid" } {
  const text = `${r.title ?? ""}. ${r.description ?? ""}`;
  if (scanForInjection(text).risk === "high") return { dropped: "unsafe" };
  const skills = [...matchSkills(neutralize(text)).keys()].slice(0, 4);
  if (!skills.length) return { dropped: "no-skills" };
  let host = "web";
  try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch { return { dropped: "invalid" }; }
  const title = clean(r.title || "Listing", 120);
  const parsed = OpportunityZ.safeParse({
    id: `live-${k}-${slug(title)}`, title, employer: clean(host, 80), kind: /placement|year in industry/i.test(text) ? "placement-year" : "summer-internship",
    roleId, location: "UK", requires: skills.map((s) => [s]), nice: [], blurb: clean(r.description ?? "", 240), source: "firecrawl", url: r.url,
  });
  return parsed.success ? { opportunity: parsed.data } : { dropped: "invalid" };
}

/** Live listings for the role (empty in DEMO_MODE or without a key; never throws). */
export async function liveOpportunities(roleId: string): Promise<{ opportunities: Opportunity[]; droppedUnsafe: number; searched: number }> {
  let results: FcResult[] = [];
  try {
    results = await fcSearch(`${roleName(roleId)} internship OR placement UK 2027 students`, { limit: MAX_LIVE + 3 });
  } catch {
    results = [];
  }
  const out: Opportunity[] = [];
  let droppedUnsafe = 0;
  results.forEach((r, k) => {
    if (out.length >= MAX_LIVE || !r?.url) return;
    const one = fromSearchResult(r, roleId, k);
    if (one.dropped === "unsafe") droppedUnsafe++;
    if (one.opportunity) out.push(one.opportunity);
  });
  return { opportunities: out, droppedUnsafe, searched: results.length };
}
