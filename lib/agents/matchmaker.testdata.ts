// Test-only data for the matchmaker: a handmade 5-person dataset and a tiny in-memory store.
// Aisha mirrors data/fixtures/profile.aisha.json + bridgemap.aisha.ml-engineer.json; Sara is the
// "lookalike" distractor (same interests, role and availability, redundant skills).
import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import type { BadgeId, BridgeMap, BridgeNode, Profile, SkillStatus } from "@/lib/types";

function profile(
  id: string, name: string, year: 1 | 2 | 3 | 4, badges: BadgeId[], interests: string[], availability: string[], role: string,
): Profile {
  return {
    id, name, programmeId: "uom-bsc-cs", year, startedAt: year === 1 ? "2026-09-21" : "2024-09-23", badges, interests, availability, isDemo: true,
    dna: {
      targetRoles: [role], timelineLabel: "Placement 2027/28", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 60,
      formats: ["projects"], budget: "free", constraints: [], accessibility: [], language: "en",
    },
  };
}

export const PROFILES: Profile[] = [
  profile("aisha", "Aisha Rahman", 1, ["new-to-uni", "international"], ["computer vision", "healthcare AI", "open source"], ["tue-eve", "thu-eve", "sat-am"], "ml-engineer"),
  profile("priya", "Priya Shah", 2, ["first-gen"], ["computer vision", "open source"], ["tue-eve", "sat-am"], "ml-engineer"),
  profile("tom", "Tom Okafor", 3, [], ["healthcare AI", "fintech"], ["tue-eve", "thu-eve"], "data-analyst"),
  profile("mei", "Mei Lin", 2, ["international"], ["open source", "game dev"], ["tue-eve", "sat-am"], "software-engineer"),
  profile("sara", "Sara Haddad", 1, ["new-to-uni"], ["computer vision", "healthcare AI", "open source"], ["tue-eve", "thu-eve", "sat-am"], "ml-engineer"),
];

/** data/seed/student-skills.json shape (Aisha is not in it: her skills come from her Bridge Map). */
export const STUDENT_SKILLS: Record<string, { proven: string[]; gaps: string[] }> = {
  priya: { proven: ["python", "pytorch", "docker", "git"], gaps: ["sql", "aws"] },
  tom: { proven: ["sql", "postgresql", "aws"], gaps: ["pytorch", "react"] },
  mei: { proven: ["react", "typescript", "ci-cd"], gaps: ["python", "machine-learning"] },
  sara: { proven: ["python", "javascript", "git"], gaps: ["kubernetes", "mlops"] },
};

const node = (skillId: string, status: SkillStatus, demand: number): BridgeNode => ({
  skillId, name: skillId, category: "language", status, demand, level: status === "proven" ? 2 : 0, evidenceIds: [], moduleCodes: [],
});

export const AISHA_MAP: BridgeMap = {
  userId: "aisha", roleId: "ml-engineer", edges: [], readinessNow: 0.31, readinessProjected: 0.58, generatedAt: "2026-11-07T10:00:00Z",
  nodes: [
    node("python", "proven", 0.62), node("git", "proven", 0.3), node("html-css", "proven", 0.05), node("javascript", "proven", 0.1),
    node("machine-learning", "degree-upcoming", 0.55), node("data-structures", "degree-done", 0.22),
    node("docker", "gap", 0.41), node("pytorch", "gap", 0.38), node("sql", "gap", 0.35), node("aws", "gap", 0.33),
    node("mlops", "gap", 0.28), node("llm-apps", "gap", 0.26), node("kubernetes", "gap", 0.18), node("ci-cd", "gap", 0.2),
    node("tensorflow", "gap", 0.16), node("communication", "gap", 0.15), node("not-in-role", "gap", 0),
  ],
};

type Row = { doc: unknown; userId?: string };
/** Minimal Store double with the same API as @/lib/store's getStore(). */
export function createFakeStore() {
  const data = new Map<string, Map<string, Row>>();
  const col = (c: string) => {
    let m = data.get(c);
    if (!m) data.set(c, (m = new Map()));
    return m;
  };
  return {
    data,
    reset(profiles: Profile[] = PROFILES) {
      data.clear();
      for (const p of profiles) col("profiles").set(p.id, { doc: p, userId: p.id });
    },
    async get<T>(c: string, id: string): Promise<T | null> {
      return (col(c).get(id)?.doc as T) ?? null;
    },
    async list<T>(c: string, f?: { userId?: string }): Promise<T[]> {
      return [...col(c).values()].filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc as T);
    },
    async upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string): Promise<T> {
      col(c).set(id, { doc, userId });
      return doc;
    },
    async remove(c: string, id: string): Promise<void> {
      col(c).delete(id);
    },
  };
}

export const fakeStore = createFakeStore();

/**
 * Serve data/** files from memory: `files` maps a path suffix (e.g. "data/seed/student-skills.json")
 * to its JSON content; any other data/seed or data/fixtures path throws ENOENT so tests stay hermetic.
 */
export function serveDataFiles(files: Record<string, unknown>) {
  const real = fs.readFileSync.bind(fs) as (...a: unknown[]) => unknown;
  return vi.spyOn(fs, "readFileSync").mockImplementation(((file: unknown, ...rest: unknown[]) => {
    const p = String(file).split(path.sep).join("/");
    for (const [suffix, content] of Object.entries(files)) if (p.endsWith(suffix)) return JSON.stringify(content);
    if (/\/data\/(seed|fixtures)\//.test(p)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
    return real(file, ...rest);
  }) as typeof fs.readFileSync);
}
