// Evidence from the student's own LinkedIn export ("Save to PDF").
//
// Why a PDF (and never the LinkedIn API): the official LinkedIn API is closed to apps like this and scraping
// the site is forbidden. The privacy-safe flow instead: the student downloads their own profile PDF, we parse
// it in memory, and keep ONLY the derived evidence items. The raw bytes, the extracted text and any excerpts
// are never written to disk, persisted or logged — extractPdfText below is the single boundary that touches
// the upload, and it hands back text only. Nothing about the file outlives this call.
import "server-only";
import { extractText } from "unpdf";
import { emit } from "@/lib/agents/events";
import { listEvidence } from "@/lib/graph/data";
import { getStore } from "@/lib/store";
import { canonicalize, matchSkills } from "@/lib/agents/skillmap";
import type { AgentEvent, EvidenceItem, Level, SkillId } from "@/lib/types";

/** Confidence for a skill as it appears on the profile or a certificate: self-reported, level 1. */
export const CONF_LISTED = 0.6;
/** Confidence for a skill we also found inside an Experience entry: still self-reported, but applied — level 2. */
export const CONF_EXPERIENCED = 0.7;
/** Bounded memory: parse at most this much text, drop the rest. Nothing is kept beyond the extraction. */
const MAX_TEXT_CHARS = 200_000;
/** A PDF that yields fewer real characters than this is treated as image-only ("scanned"). */
const MIN_TEXT_CHARS = 24;
const MAX_SECTION_LINES = 160;

// ---------- LinkedIn "Save to PDF" section splitting ----------

type SecKey = "skills" | "experience" | "certifications";

const SECTION_HEADINGS: [RegExp, SecKey][] = [
  [/^skills? & endorsements?$/i, "skills"],
  [/^top skills?$/i, "skills"],
  [/^skills?$/i, "skills"],
  [/^(?:work|professional) experience$/i, "experience"],
  [/^experience$/i, "experience"],
  [/^(?:licenses? & certifications?|certifications?|certificates?)$/i, "certifications"],
];
/** Any other section heading of a LinkedIn export: it just ends the section we were reading. */
const OTHER_HEADINGS =
  /^(?:summary|about|education|projects|honors? & awards?|awards?|languages|interests|recommendations|volunteer experience|patents|publications|courses|activities|articles?|test scores|featured|background|contact(?: info)?|profile|page \d+(?: of \d+)?|\d+ connections?)$/i;
/** Sub-groupings inside the skills list — layout labels, not skills. */
const SKILL_NOISE = /^(?:industry knowledge|tools? & technologies?|technologies|other skills?|endorsed by .*|also knows about.*|skills profile.*)$/i;
/** Candidate phrases inside a skills-list line (bullets and commas on LinkedIn exports). */
const LIST_SPLIT = /[•▪‣·|,;\t]+/;
/** A certification is spelled "Nome — Issuer (Year)" or plain text; split only on real dashes so names like "Front-End" survive. */
const CERT_DASH = /^(.+?)\s+[—–]\s+(.+?)(?:\s*\(([^()]{1,60})\))?\s*$/;
/** Experience entries carry tenant dates ("Jun 2025 - Sep 2025 · 3 mos"). */
const ENTRY_DATE = /\b(?:19|20)\d{2}\b|\b\d+\s+(?:mo(?:s)?|months?|yrs?|years?)\b/i;

export type LinkedInStats = { skills: number; experienceEntries: number; certifications: number };

export type LinkedInHit = {
  skillId: SkillId;
  level: Level;
  confidence: number;
  /** The exact phrase from the export, quoted back to the student. */
  phrase: string;
  /** 0 experience · 1 skills list · 2 certification — prefer lower when level and confidence tie. */
  tier: 0 | 1 | 2;
};

const tidy = (s: string): string => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** Which of our sections the line opens, or null. */
function isSectionHeading(line: string): SecKey | null {
  for (const [re, key] of SECTION_HEADINGS) if (re.test(line)) return key;
  return null;
}

type Heading = { key: SecKey | "other"; inline?: string } | null;

function classifyLine(line: string): Heading {
  // "Skills: Python, React" — heading and the first content line fused by extraction.
  if (line.length <= 64) {
    const fused = /^([^:|]{2,32})(?::\s*|\s*\|\s*)(.+)$/.exec(line);
    if (fused) {
      const key = isSectionHeading(tidy(fused[1]));
      if (key) return { key, inline: tidy(fused[2]) };
      if (OTHER_HEADINGS.test(tidy(fused[1]))) return { key: "other" };
    }
  }
  const key = isSectionHeading(line);
  if (key) return { key };
  if (OTHER_HEADINGS.test(line)) return { key: "other" };
  return null;
}

function sectionize(text: string): { sections: Record<SecKey, string[]>; headings: boolean } {
  const sections: Record<SecKey, string[]> = { skills: [], experience: [], certifications: [] };
  let cur: SecKey | null = null;
  let headings = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = tidy(raw);
    const heading = line ? classifyLine(line) : null;
    if (heading) {
      headings = true;
      if (heading.key === "other") { cur = null; continue; }
      cur = heading.key;
      if (heading.inline) sections[cur].push(heading.inline);
      continue;
    }
    if (line && cur) sections[cur].push(line);
  }
  for (const key of Object.keys(sections) as SecKey[]) sections[key] = sections[key].slice(0, MAX_SECTION_LINES);
  return { sections, headings };
}

/** Skill list lines → candidate phrases ("Python (Programming Language) • React" → both). */
function phrasesFromList(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (SKILL_NOISE.test(line)) continue;
    for (const bit of line.split(LIST_SPLIT)) {
      const phrase = bit.trim();
      if (phrase) out.push(phrase);
    }
  }
  return out;
}

/** Certification lines: keep "Name — Issuer (Year)" and plain lines whole; split only on real bullets. */
function certificationPhrases(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const bit of line.split(/[•▪‣]+/)) {
      const phrase = tidy(bit);
      if (phrase) out.push(phrase);
    }
  }
  return out;
}

/** A phrase maps to skill ids via the Skill Mapper's deterministic matcher (its alias list + the taxonomy ids). */
function idsIn(phrase: string): SkillId[] {
  const single = canonicalize(phrase);
  if (single) return [single];
  return [...matchSkills(phrase).keys()];
}

function cleanPhrase(phrase: string): string {
  return phrase.replace(/["“”«»]/g, "'").replace(/\s+/g, " ").trim().slice(0, 160);
}

// ---------- the pure pipeline: PDF text → evidence items ----------

/**
 * Deterministic: Skills lines map at level 1 (self-reported); a mapped skill that also appears inside an
 * Experience entry bumps to level 2; certification lines with the same skill stay at level 1 unless the
 * experience beat them. One item per skill id, highest level/confidence wins.
 */
export function textToLinkedInEvidence(
  userId: string,
  text: string,
  now = new Date(),
): { items: EvidenceItem[]; stats: LinkedInStats } {
  const { sections, headings } = sectionize(text.slice(0, MAX_TEXT_CHARS));

  // Degraded fallback: a template without any recognisable LinkedIn headings — trust the whole text as a list.
  const listedPhrases = headings ? phrasesFromList(sections.skills) : phrasesFromList(text.split(/\r?\n/));
  const certs = headings ? certificationPhrases(sections.certifications) : [];
  const expLines = headings ? sections.experience : [];

  const hits = new Map<SkillId, LinkedInHit>();
  const beats = (a: LinkedInHit, b: LinkedInHit): boolean =>
    a.level !== b.level ? a.level > b.level : a.confidence !== b.confidence ? a.confidence > b.confidence : a.tier < b.tier;
  const put = (hit: LinkedInHit) => {
    const cur = hits.get(hit.skillId);
    if (!cur || beats(hit, cur)) hits.set(hit.skillId, hit);
  };

  // (1) listed skills: level 1, self-reported.
  for (const phrase of listedPhrases) for (const id of idsIn(phrase)) put({ skillId: id, level: 1, confidence: CONF_LISTED, phrase, tier: 1 });

  // (2) certifications: "Nome — Issuer (Year)" — the name/issuer naming a skill maps at level 1 too.
  for (const phrase of certs) for (const id of idsIn(phrase)) put({ skillId: id, level: 1, confidence: CONF_LISTED, phrase, tier: 2 });

  // (3) experience bump: a mapped skill seen in an Experience entry has been applied, not just listed.
  const experiencedPhrase = new Map<SkillId, string>();
  let jobs = 0;
  for (const line of expLines) {
    if (ENTRY_DATE.test(line)) jobs++;
    for (const id of matchSkills(line).keys()) if (!experiencedPhrase.has(id)) experiencedPhrase.set(id, line);
  }
  for (const [id, phrase] of experiencedPhrase)
    if (hits.has(id)) put({ skillId: id, level: 2, confidence: CONF_EXPERIENCED, phrase, tier: 0 });

  const stats: LinkedInStats = { skills: hits.size, experienceEntries: jobs, certifications: certs.length };
  return { items: hitsToItems(userId, hits, now), stats };
}

function hitsToItems(userId: string, hits: Map<SkillId, LinkedInHit>, now: Date): EvidenceItem[] {
  return [...hits.values()]
    .map((h): EvidenceItem => ({
      id: `ev_${userId}_${h.skillId}_linkedin`,
      userId,
      skillId: h.skillId,
      level: h.level,
      confidence: h.confidence,
      source: "linkedin-pdf",
      url: "", // a PDF carries no platform URL — empty on purpose, never fabricated
      quote: `"${cleanPhrase(h.phrase)}" from your LinkedIn export`,
      createdAt: now.toISOString(),
    }))
    .sort((a, b) => (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0));
}

// ---------- the imported flow: emit, parse, store ----------

const say = (runId: string | undefined, status: AgentEvent["status"], message: string, data?: Record<string, unknown>) => {
  if (runId) emit({ runId, agent: "evidence", status, message, ...(data ? { data } : {}) });
};

/** In-memory text extraction — the single boundary that touches the upload; it never writes to disk. */
async function extractPdfText(bytes: Uint8Array, max: number): Promise<string> {
  if (bytes.byteLength === 0) return "";
  // The parser may take ownership of the view, so hand it a private copy; nothing outlives this call.
  const out = await extractText(new Uint8Array(bytes), { mergePages: true });
  const text = typeof out.text === "string" ? out.text : "";
  return text.slice(0, max);
}

/**
 * Parses a student's own LinkedIn export in memory and turns its sections into EvidenceItems, then returns
 * listEvidence(userId). Never throws for content problems: a scanned/unreadable PDF or an export without any
 * known skill keeps the evidence you already have (an error-status event explains why). Only a storage
 * failure is rethrown for the route to answer 500 — delivery is the caller's concern.
 */
export async function importLinkedInPdfEvidence(input: {
  userId: string;
  bytes: Uint8Array;
  runId?: string;
}): Promise<EvidenceItem[]> {
  const { userId, bytes, runId } = input;
  const now = new Date();
  say(runId, "started", "Evidence Agent: reading your LinkedIn export");
  let text: string;
  try {
    text = await extractPdfText(bytes, MAX_TEXT_CHARS);
  } catch (err) {
    say(runId, "error", "We couldn't read that PDF — save your profile again from LinkedIn (profile page → More → Save to PDF).", {
      reason: err instanceof Error ? err.message.slice(0, 80) : "unknown",
    });
    return listEvidence(userId);
  }
  if (text.trim().length < MIN_TEXT_CHARS) {
    // Image-only export: parsing nothing would pretend success, so say what to do instead.
    say(runId, "error", "The upload looks like scanned images; copy your skills here instead.", { scanned: true });
    return listEvidence(userId);
  }
  const { items, stats } = textToLinkedInEvidence(userId, text, now);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  say(runId, "progress", `read ${plural(stats.skills, "skill", "skills")} · ${plural(stats.experienceEntries, "experience job", "experience jobs")} · ${plural(stats.certifications, "certification", "certifications")}`, { ...stats });
  if (!items.length) {
    say(runId, "error", "We couldn't find any skills we know in that file — copy your skills here instead and we'll build from there.", { ...stats });
    return listEvidence(userId);
  }
  try {
    const store = getStore();
    await Promise.all(items.map((e) => store.upsert("evidence", e.id, e, userId)));
  } catch (err) {
    say(runId, "error", "We hit a storage hiccup saving your skills — nothing was lost. Try again in a moment.", {
      reason: err instanceof Error ? err.message.slice(0, 80) : "unknown",
    });
    throw err instanceof Error ? err : new Error("Evidence store unavailable");
  }
  const all = await listEvidence(userId);
  say(runId, "done", `found ${plural(items.length, "skill", "skills")} from your LinkedIn export — we kept just the skills, the file itself is gone`, {
    items: items.length,
    level2: items.filter((e) => e.level >= 2).length,
    ...stats,
  });
  return all;
}

// ---------- DEMO_MODE sample (no file needed; stored like a real import) ----------

const DEMO_SAMPLE: { skillId: SkillId; level: Level; phrase: string }[] = [
  { skillId: "python", level: 1, phrase: "Python (Programming Language)" },
  { skillId: "react", level: 2, phrase: "Built React dashboards — Software Engineer Intern at Northwind Bank" },
  { skillId: "sql", level: 1, phrase: "SQL" },
];

/** Deterministic linkedin-pdf evidence "as if parsed" — the route upserts these in DEMO_MODE. */
export function demoLinkedInEvidence(userId: string): EvidenceItem[] {
  const hits = new Map<SkillId, LinkedInHit>(
    DEMO_SAMPLE.map((s) => [s.skillId, { ...s, confidence: s.level >= 2 ? CONF_EXPERIENCED : CONF_LISTED, tier: s.level >= 2 ? (0 as const) : (1 as const) }]),
  );
  return hitsToItems(userId, hits, new Date());
}
