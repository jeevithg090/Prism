// Sample run-ledger entries for the governance page's "Use demo data" state (GET /api/agents/runs?demo=1), and the
// curated runs a demo ledger leads with (DEMO_MODE or ?samples=1), so a demo never opens on repeated QA runs.
import type { AgentRunEntry } from "@/lib/agents/harness";

const PEER = { kind: "peer-approval", who: "a podmate", note: "Each issue is reviewed and merged by a podmate, never by the AI" } as const;

export const SAMPLE_RUNS: AgentRunEntry[] = [
  {
    id: "run_demo01:techlead:1", runId: "run_demo01", agent: "techlead", purpose: "Reviewing PR #3 in pod-vision-demo",
    startedAt: "2026-11-07T15:12:04.000Z", durationMs: 2140, status: "ok", usedFallback: false,
    guardrails: [{ name: "noFullSolutions", action: "modified", detail: "stripped 1 code block (longest 14 lines)" }],
    checkpoint: { kind: "peer-approval", who: "your pod reviewer", note: "The AI comments with questions only; a podmate approves and merges, never the AI" },
    inputDigest: "4f1c9a2b7e30", model: "deterministic", steps: [{ name: "read diff", durationMs: 310 }, { name: "draft review", durationMs: 1720 }],
  },
  {
    id: "run_demo01:guides:1", runId: "run_demo01", agent: "guides", purpose: "Looking for Manchester practitioners who work with Docker",
    startedAt: "2026-11-07T15:08:40.000Z", durationMs: 1290, status: "fallback", usedFallback: true, fallbackReason: "AI writer unavailable: template drafts",
    guardrails: [
      { name: "piiRedactor", action: "modified", detail: "redacted 1 email in the LLM input" },
      { name: "noOutboundMessaging", action: "pass", detail: "drafts only: nothing is sent" },
      { name: "maxItems", action: "pass", detail: "4 ≤ 4" },
    ],
    checkpoint: { kind: "student-sends", who: "you", note: "Keystone only drafts the message. You decide whether to send it, from your own account." },
    inputDigest: "a83d02c4f915", model: "deterministic", steps: [{ name: "search", durationMs: 880 }],
  },
  {
    id: "run_demo00:architect:2", runId: "run_demo00", agent: "architect", purpose: 'Setting up the GitHub repo for "VisionAid: accessible image captioning API"',
    startedAt: "2026-11-07T15:02:19.000Z", durationMs: 640, status: "ok", usedFallback: false, guardrails: [], checkpoint: PEER,
    inputDigest: "0be7d5a1c642", model: "deterministic", steps: [],
  },
  {
    id: "run_demo00:architect:1", runId: "run_demo00", agent: "architect", purpose: "Designing a 3-week project for Pod Orbit (4 members)",
    startedAt: "2026-11-07T15:02:17.000Z", durationMs: 1830, status: "ok", usedFallback: false,
    guardrails: [{ name: "noFullSolutions", action: "pass" }, { name: "maxItems", action: "pass", detail: "7 ≤ 8" }], checkpoint: PEER,
    inputDigest: "e51a7f3309bd", model: "deterministic", steps: [{ name: "draft with LLM", durationMs: 1650 }],
  },
  {
    id: "run_demo00:matchmaker:1", runId: "run_demo00", agent: "matchmaker", purpose: "Form a complementary study pod from skills, interests and availability",
    startedAt: "2026-11-07T15:01:55.000Z", durationMs: 38, status: "ok", usedFallback: false,
    guardrails: [{ name: "noDemographicSignals", action: "pass", detail: "13 scoring inputs checked: skills, interests, availability, tenure only" }],
    inputDigest: "9c02b6ee41d7", model: "deterministic", steps: [{ name: "load candidates", durationMs: 12 }],
  },
];

/** Runs newer than this lead a demo ledger; the samples sit just before them, ahead of older runs. */
export const FRESH_RUN_MS = 15 * 60_000;

/** SAMPLE_RUNS moved in time so the newest sits just before `beforeMs` (gaps kept), each marked `sample`. */
export function samplesBefore(beforeMs: number): AgentRunEntry[] {
  const newest = Math.max(...SAMPLE_RUNS.map((e) => Date.parse(e.startedAt)));
  const shift = beforeMs - 60_000 - newest;
  return SAMPLE_RUNS.map((e) => ({ ...e, startedAt: new Date(Date.parse(e.startedAt) + shift).toISOString(), sample: true }));
}
