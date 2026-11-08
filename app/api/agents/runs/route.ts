// GET /api/agents/runs?runId=&agent=&limit=50 → AgentRunEntry[] (newest first): the governed-agent run ledger.
// Entries hold an input digest, never the raw input. `?demo=1` returns sample entries (the page's "Use demo data").
// DEMO_MODE (or `?samples=1`) merges the curated samples in front of older runs: runs from the last 15 minutes
// (what the presenter just did, such as a merge) stay on top, then the samples, then the older live runs.
import { z } from "zod";
import { listRuns } from "@/lib/agents/harness";
import { FRESH_RUN_MS, SAMPLE_RUNS, samplesBefore } from "@/lib/agents/ledger-sample";
import { badRequest, internal, ok } from "@/lib/schemas/community";

const AGENTS = [
  "orchestrator", "syllabus", "skillmap", "market", "trends", "evidence", "roadmap",
  "matchmaker", "architect", "techlead", "trajectories", "guides", "voice", "n8n",
] as const;

const RunsQueryZ = z.object({
  runId: z.string().min(1).max(100).optional(),
  agent: z.enum(AGENTS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = RunsQueryZ.safeParse({
      runId: sp.get("runId") || undefined,
      agent: sp.get("agent") || undefined,
      limit: sp.get("limit") || undefined,
    });
    if (!parsed.success) return badRequest(parsed.error);
    const { runId, agent, limit } = parsed.data;
    if (sp.get("demo") === "1") {
      return ok(SAMPLE_RUNS.filter((e) => (!runId || e.runId === runId) && (!agent || e.agent === agent)).slice(0, limit));
    }
    if (process.env.DEMO_MODE === "true" || sp.get("samples") === "1") {
      const live = await listRuns({ runId, agent, limit });
      const samples = samplesBefore(Date.now() - FRESH_RUN_MS).filter((e) => (!runId || e.runId === runId) && (!agent || e.agent === agent));
      return ok([...live, ...samples].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0)).slice(0, limit));
    }
    return ok(await listRuns({ runId, agent, limit }));
  } catch {
    return internal();
  }
}
