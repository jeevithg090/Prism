import { z } from "zod";
import { emit } from "@/lib/agents/events";
import { mapTextToSkills } from "@/lib/agents/skillmap";
import { readCached, withCache } from "@/lib/cache";
import { mapLimit } from "@/lib/concurrency";
import { fcCrawl, fcScrapeJSON, fcScrapeMarkdown, fcSearch } from "@/lib/connectors/firecrawl";
import { llmJSON } from "@/lib/llm";
import type { Module, Programme } from "@/lib/types";

interface RawUnit {
  code?: string; title: string; year?: number; semester?: string; credits?: number;
  compulsory?: boolean; topics?: string[]; learning_outcomes?: string[]; assessment?: string;
}

const MODULE_SCHEMA = {
  type: "object",
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" }, title: { type: "string" }, year: { type: "number" },
          semester: { type: "string" }, credits: { type: "number" }, compulsory: { type: "boolean" },
          topics: { type: "array", items: { type: "string" } },
          learning_outcomes: { type: "array", items: { type: "string" } },
          assessment: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
};
const PROMPT =
  "Extract every course unit/module on this page with its code, title, year of study, semester (1, 2 or full-year), credits, whether compulsory, the list of topics, the learning outcomes and the assessment type. Return an empty list if none.";

const RawUnitZ = z.object({
  code: z.string().optional(), title: z.string(), year: z.number().optional(), semester: z.string().optional(),
  credits: z.number().optional(), compulsory: z.boolean().optional(), topics: z.array(z.string()).optional(),
  learning_outcomes: z.array(z.string()).optional(), assessment: z.string().optional(),
}) satisfies z.ZodType<RawUnit>;

const PROGRAMMES: Record<string, { university: string; name: string }> = {
  "uom-bsc-cs": { university: "University of Manchester", name: "BSc Computer Science" },
};

export function normaliseSemester(s: string | undefined, code?: string): Module["semester"] {
  const text = (s ?? "").toLowerCase();
  if (/full|both|all year|1\s*(&|and|\+)\s*2/.test(text)) return "full-year";
  const digit = text.match(/[12]/)?.[0];
  if (digit === "1" || digit === "2") return digit;
  const last = code?.match(/(\d)$/)?.[1]; // Manchester codes end 1, 2, or 0 for full year
  return last === "1" || last === "2" ? last : "full-year";
}

export function yearFromCode(code: string | undefined, fallback = 1): Module["year"] {
  const y = Number(code?.match(/^[A-Za-z]{3,5}(\d)/)?.[1] ?? fallback);
  return (y >= 1 && y <= 4 ? y : 1) as Module["year"];
}

export function dedupeUnits(units: RawUnit[]): RawUnit[] {
  const seen = new Map<string, RawUnit>();
  for (const u of units) {
    const key = (u.code || u.title).trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, u);
  }
  return [...seen.values()];
}

async function findPages(url: string, runId: string): Promise<string[]> {
  const pages = await fcCrawl(url, {
    limit: 40,
    includePaths: ["course-units", "course-details", "units", "module"],
  });
  emit({ runId, agent: "syllabus", status: "progress", message: `crawled ${pages.length} pages` });
  if (pages.length >= 3) return pages.map((p) => p.url);
  const markdown = await fcScrapeMarkdown(url).catch(() => "");
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1] ?? "Computer Science";
  const hits = await fcSearch(`${heading} course units site:manchester.ac.uk`, 10);
  return [...new Set([url, ...hits.slice(0, 8).map((h) => h.url)])];
}

async function unitsFromUrl(url: string, runId: string): Promise<RawUnit[]> {
  const pages = await findPages(url, runId);
  const perPage = await mapLimit(pages, 6, (page) =>
    fcScrapeJSON<{ units?: RawUnit[] }>(page, MODULE_SCHEMA, PROMPT).catch(() => ({ units: [] })));
  return perPage.flatMap((p) => p.units ?? []);
}

async function unitsFromText(text: string, runId: string): Promise<RawUnit[]> {
  const { units } = await llmJSON({
    agent: "syllabus",
    runId,
    system: PROMPT,
    user: text.slice(0, 12000),
    schema: z.object({ units: z.array(RawUnitZ) }),
    schemaName: "course units",
  });
  return units;
}

async function addIndustryNotes(modules: Module[], runId: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  const { notes } = await llmJSON({
    agent: "syllabus",
    runId,
    system: "For each course unit, write one note of at most 14 words on where its content is used at work.",
    user: JSON.stringify(modules.map((m) => ({ code: m.code, title: m.title, topics: m.topics }))),
    schema: z.object({ notes: z.array(z.object({ code: z.string(), note: z.string() })) }),
    schemaName: "industry notes",
  });
  const byCode = new Map(notes.map((n) => [n.code, n.note]));
  for (const m of modules) m.industryNote = byCode.get(m.code);
}

export async function extractProgramme(input: {
  url?: string; text?: string; programmeId: string; runId?: string;
}): Promise<Programme> {
  const { url, text, programmeId } = input;
  const runId = input.runId ?? crypto.randomUUID();
  return withCache(`syllabus-${programmeId}`, async () => {
    emit({ runId, agent: "syllabus", status: "started", message: "Syllabus Agent: reading programme page" });
    try {
      const raw = text ? await unitsFromText(text, runId) : await unitsFromUrl(url ?? "", runId);
      const units = dedupeUnits(raw);
      emit({ runId, agent: "syllabus", status: "progress", message: `extracted ${units.length} course units` });

      const modules = await mapLimit(units, 6, async (u): Promise<Module> => {
        const topics = u.topics ?? [];
        const learningOutcomes = u.learning_outcomes ?? [];
        const { skills } = await mapTextToSkills([u.title, ...topics, ...learningOutcomes].join("\n"), { runId });
        return {
          code: u.code ?? u.title, title: u.title,
          year: u.year ? yearFromCode(undefined, u.year) : yearFromCode(u.code),
          semester: normaliseSemester(u.semester, u.code),
          credits: u.credits, compulsory: u.compulsory ?? false,
          topics, learningOutcomes, assessment: u.assessment, skills,
        };
      });
      await addIndustryNotes(modules, runId).catch(() => {});

      const skillCount = new Set(modules.flatMap((m) => m.skills.map((s) => s.skillId))).size;
      emit({ runId, agent: "syllabus", status: "progress", message: `mapped ${skillCount} skills across ${modules.length} modules` });
      const known = PROGRAMMES[programmeId];
      const programme: Programme = {
        id: programmeId, university: known?.university ?? "Unknown university", name: known?.name ?? programmeId,
        url: url ?? "", modules, extractedAt: new Date().toISOString(), source: "firecrawl",
      };
      emit({ runId, agent: "syllabus", status: "done", message: `${modules.length} modules ready` });
      return programme;
    } catch (err) {
      emit({ runId, agent: "syllabus", status: "error", message: "Couldn't read the syllabus" });
      throw err;
    }
  }, { fixture: "programme.uom-bsc-cs.json" });
}

export async function getProgramme(id: string): Promise<Programme | null> {
  if (id !== "uom-bsc-cs") return readCached<Programme>(`syllabus-${id}`);
  return readCached<Programme>(`syllabus-${id}`, "programme.uom-bsc-cs.json");
}
