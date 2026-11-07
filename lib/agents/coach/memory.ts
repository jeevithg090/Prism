// P5 · Keystone Coach long-term memory: short notes about how a student learns (collection `coach_memory`).
// Principle 6 (memory): notes are opt-in, visible in the UI and deletable by the student at any time.
// Only learning-related notes are kept: no health, demographic or contact details.
import "server-only";
import { getStore } from "@/lib/store";
import { MemoryNoteZ, type MemoryNote } from "@/lib/schemas/coach";

export const MEMORY_COLLECTION = "coach_memory";
export const MAX_NOTES_PER_USER = 20;

export type MemoryKind = MemoryNote["kind"];
export interface ExtractedMemory { kind: MemoryKind; text: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The student's notes, newest first (invalid rows are skipped). */
export async function listMemory(userId: string): Promise<MemoryNote[]> {
  const rows = await getStore().list<unknown>(MEMORY_COLLECTION, { userId });
  return rows
    .map((r) => MemoryNoteZ.safeParse(r))
    .flatMap((r) => (r.success && r.data.userId === userId ? [r.data] : []))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id)));
}

/** Saves a note as `${userId}:${n}`. The same text twice returns the existing note (idempotent). */
export async function addMemory(note: { userId: string; kind: MemoryKind; text: string; source?: string }): Promise<MemoryNote> {
  const existing = await listMemory(note.userId);
  const dupe = existing.find((n) => norm(n.text) === norm(note.text));
  if (dupe) return dupe;
  const maxN = existing.reduce((m, n) => Math.max(m, Number(n.id.split(":").pop()) || 0), 0);
  const saved = MemoryNoteZ.parse({
    id: `${note.userId}:${maxN + 1}`,
    userId: note.userId,
    kind: note.kind,
    text: note.text.slice(0, 240),
    source: note.source ?? "coach chat",
    createdAt: new Date().toISOString(),
  });
  await getStore().upsert(MEMORY_COLLECTION, saved.id, saved, note.userId);
  // keep memory small: forget the oldest notes beyond the cap
  for (const old of existing.slice(MAX_NOTES_PER_USER - 1)) await getStore().remove(MEMORY_COLLECTION, old.id);
  return saved;
}

/** Deletes one of the student's own notes. Returns false if it doesn't exist or belongs to someone else. */
export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const note = MemoryNoteZ.safeParse(await getStore().get<unknown>(MEMORY_COLLECTION, id));
  if (!note.success || note.data.userId !== userId) return false;
  await getStore().remove(MEMORY_COLLECTION, id);
  return true;
}

// ---------- deterministic extraction ----------

/** First person → second person, so the note reads back naturally ("you prefer …"). */
function toSecondPerson(s: string): string {
  return s
    .replace(/\bI am\b|\bI'm\b/gi, "you're")
    .replace(/\bI\b/g, "you")
    .replace(/\bmy\b/gi, "your")
    .replace(/\bme\b/gi, "you")
    .replace(/\bmyself\b/gi, "yourself")
    .replace(/\bmine\b/gi, "yours");
}

function clean(fragment: string): string {
  const cut = fragment.split(/[.!?;\n]|,\s*(?:but|so|and then|because|any|what|how|can|could|should|do|does|is|please|thanks)\b|\s+but\s+/i)[0] ?? "";
  const words = cut.trim().replace(/\s+/g, " ").split(" ").slice(0, 14).join(" ");
  return toSecondPerson(words).replace(/[,\s]+$/, "");
}

// Sensitive things we never remember (privacy by design).
const SENSITIVE = /@|\+?\d[\d\s-]{7,}\d|\b(password|passport|address|phone|religio\w*|ethnic\w*|pregnan\w*|disabilit\w*|diagnos\w*|medication|depress\w*|anxiety|sexual\w*|visa status)\b/i;
// "I want to …" that is really a request to the Coach, not a goal.
const REQUEST_VERBS = /^(know|see|ask|check|find|start|get|review|talk|understand|try|look|hear|learn more about why|do this week|chat)\b/i;

const RULES: { re: RegExp; kind: MemoryKind; render: (m: string) => string; noText?: boolean }[] = [
  { re: /\bi(?:'d| would)? (?:really |much |strongly )?prefer\s+(.+)/i, kind: "preference", render: (x) => `you prefer ${x}` },
  { re: /\bi learn (?:best|better) (.+)/i, kind: "preference", render: (x) => `you learn best ${x}` },
  { re: /\bi(?:'m| am) (?:working|in) (?:a )?part[- ]time(?: job)?\b(.*)/i, kind: "preference", render: () => "you're working part-time, so keep weekly plans light", noText: true },
  { re: /\bi (?:have|work) (?:a )?part[- ]time(?: job)?\b(.*)/i, kind: "preference", render: () => "you're working part-time, so keep weekly plans light", noText: true },
  { re: /\bi (?:only )?have (?:about |around )?(\d{1,2}) hours? (?:a|per|each) week\b/i, kind: "preference", render: (x) => `you have about ${x} hours a week` },
  { re: /\bi(?:'m| am)? ?(?:really )?(?:struggl(?:e|ing)|find it hard|have trouble|get stuck) (?:with |on )?(.+)/i, kind: "struggle", render: (x) => (/^to /.test(x) ? `you find it hard ${x}` : `you struggle with ${x}`) },
  { re: /\bmy goal is (?:to )?(.+)/i, kind: "goal", render: (x) => `your goal is to ${x}` },
  { re: /\bi(?:'d| would) (?:really )?like to (.+)/i, kind: "goal", render: (x) => `you want to ${x}` },
  { re: /\bi (?:really )?want to (.+)/i, kind: "goal", render: (x) => `you want to ${x}` },
  { re: /\bi(?:'m| am) aiming (?:for|to) (.+)/i, kind: "goal", render: (x) => `you're aiming for ${x}` },
  { re: /\bi (?:finally |just )?(passed|finished|shipped|merged|landed|won|completed) (.+)/i, kind: "win", render: (x) => x },
];

/**
 * Finds notes worth remembering in one student message ("I prefer…", "I struggle with…", "my goal is…",
 * "I want to…", "I'm working part-time"…). Deterministic, at most 2 notes, never sensitive data.
 */
export function extractMemory(message: string): ExtractedMemory[] {
  if (!message || SENSITIVE.test(message)) return [];
  const out: ExtractedMemory[] = [];
  for (const rule of RULES) {
    const m = message.match(rule.re);
    if (!m) continue;
    let text: string;
    if (rule.kind === "win") {
      const what = clean(m[2] ?? "");
      if (!what) continue;
      text = `you ${m[1].toLowerCase()} ${what}`;
    } else {
      const frag = clean(m[1] ?? "");
      if (!frag && !rule.noText) continue;
      if (rule.kind === "goal" && REQUEST_VERBS.test(frag)) continue;
      text = rule.render(frag);
    }
    if (out.some((o) => o.kind === rule.kind)) continue; // one note per kind per message
    out.push({ kind: rule.kind, text });
    if (out.length >= 2) break;
  }
  return out;
}
