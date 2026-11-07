// GET /api/agents/runs?runId=&agent=&limit=50 → AgentRunEntry[] (newest first): the governed-agent run ledger.
// Entries hold an input digest, never the raw input. `?demo=1` returns sample entries (the page's "Use demo data").
import { z } from "zod";
import { listRuns } from "@/lib/agents/harness";
import { SAMPLE_RUNS } from "@/lib/agents/ledger-sample";
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
    return ok(await listRuns({ runId, agent, limit }));
  } catch {
    return internal();
  }
}
