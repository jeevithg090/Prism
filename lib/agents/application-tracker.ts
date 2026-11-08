// P5 · Application tracker agent (UC-2). Server-only: wraps the "applications" store
// collection. Never throws: store failures degrade to empty lists / false / null.
import "server-only";
import { nanoid } from "nanoid";
import { getStore } from "@/lib/store";
import type { SkillId } from "@/lib/types";
import { ApplicationZ, type Application } from "@/lib/schemas/application";
import { skillMeta } from "@/lib/graph/data";
import skillsJson from "@/data/skills.json";

const COLLECTION = "applications";
const now = () => new Date().toISOString();

type SkillEntry = { id: string; name: string; aliases: string[] };
const SKILLS = new Map<string, SkillEntry>(
  (skillsJson as { id: string; name: string; aliases: string[] }[]).map((s) => [
    s.id,
    { id: s.id, name: s.name, aliases: s.aliases ?? [] },
  ]),
);

/** Lowercase word tokens of a skill's display name and aliases, for whole-word matching. */
function skillTerms(id: string): string[] {
  const entry = SKILLS.get(id) ?? { id, name: skillMeta(id).name, aliases: [] };
  const terms = new Set<string>();
  const add = (s: string) => s.split(/[^a-z0-9]+/i).forEach((w) => w && terms.add(w.toLowerCase()));
  add(entry.name);
  entry.aliases.forEach(add);
  return [...terms];
}

const wordsOf = (text: string): Set<string> => {
  const out = new Set<string>();
  text.split(/[^a-z0-9]+/i).forEach((w) => w && out.add(w.toLowerCase()));
  return out;
};

/** Pure: which of the student's proven skills the job asks for, and a 0..1 match score. */
export function matchSkillsForJob(
  roleTitle: string,
  notes: string | undefined,
  provenSkills: SkillId[],
): { matchedSkills: SkillId[]; matchScore: number } {
  const textWords = wordsOf(`${roleTitle ?? ""} ${notes ?? ""}`);
  const matched: SkillId[] = [];
  for (const id of provenSkills) {
    if (skillTerms(id).some((term) => textWords.has(term))) matched.push(id);
  }
  const score = provenSkills.length ? Math.round((matched.length / provenSkills.length) * 100) / 100 : 0;
  return { matchedSkills: matched, matchScore: score };
}

export async function createApplication(input: {
  userId: string;
  company: string;
  roleTitle: string;
  roleUrl?: string;
  status?: string;
  source?: string;
  notes?: string;
}): Promise<Application> {
  const id = `app_${nanoid(8)}`;
  const stamp = now();
  const app: Application = ApplicationZ.parse({
    id,
    userId: input.userId,
    company: input.company,
    roleTitle: input.roleTitle,
    roleUrl: input.roleUrl,
    status: (input.status ?? "applied") as Application["status"],
    appliedAt: stamp,
    source: input.source,
    notes: input.notes,
    matchedSkills: [],
    matchScore: 0,
    createdAt: stamp,
    updatedAt: stamp,
  });
  try {
    await getStore().upsert(COLLECTION, id, app, input.userId);
  } catch {
    /* store down: still return the application, never throw */
  }
  return app;
}

export async function listApplications(
  userId: string,
  opts: { status?: string; limit?: number } = {},
): Promise<Application[]> {
  try {
    let items = await getStore().list<Application>(COLLECTION, { userId });
    items = items.filter((a) => a && a.userId === userId);
    if (opts.status) items = items.filter((a) => a.status === opts.status);
    if (opts.limit !== undefined && opts.limit > 0) items = items.slice(0, opts.limit);
    return items;
  } catch {
    return [];
  }
}

export async function updateApplication(
  id: string,
  userId: string,
  patches: { status?: string; notes?: string },
): Promise<Application | null> {
  try {
    const store = getStore();
    const current = await store.get<Application>(COLLECTION, id);
    if (!current || current.userId !== userId) return null;
    const updated: Application = ApplicationZ.parse({
      ...current,
      ...(patches.status !== undefined
        ? { status: patches.status as Application["status"] }
        : {}),
      ...(patches.notes !== undefined ? { notes: patches.notes } : {}),
      id,
      userId,
      updatedAt: now(),
    });
    await store.upsert(COLLECTION, id, updated, userId);
    return updated;
  } catch {
    return null;
  }
}

export async function removeApplication(id: string, userId: string): Promise<boolean> {
  try {
    const store = getStore();
    const current = await store.get<Application>(COLLECTION, id);
    if (!current || current.userId !== userId) return false;
    await store.remove(COLLECTION, id);
    return true;
  } catch {
    return false;
  }
}
