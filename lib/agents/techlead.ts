// P5 · AI Tech Lead: Socratic pull-request reviews for pod repos, plus pr-merged momentum events.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Octokit } from "octokit";
import { llmText } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { newRunId } from "@/lib/agents/events";
import { MAX_CODE_LINES, noFullSolutions, stripLongCodeBlocks } from "@/lib/agents/guardrails";
import { runAgent, type Checkpoint } from "@/lib/agents/harness";
import type { Profile } from "@/lib/types";

export const SOCRATIC_SYSTEM =
  "You are a kind senior engineer mentoring students. Give a Socratic review: max 6 bullets, ask guiding questions and point to concepts/docs; NEVER write the full solution or large code blocks.";
export const MAX_DIFF_CHARS = 8000;
// The code-block stripper now lives in the shared guardrails (noFullSolutions); re-exported for callers.
export { MAX_CODE_LINES, stripLongCodeBlocks };
/** Human checkpoint: the AI only asks questions; the pod reviewer approves and merges. */
export const REVIEW_CHECKPOINT: Checkpoint = {
  kind: "peer-approval",
  who: "your pod reviewer",
  note: "The AI comments with questions only; a podmate approves and merges, never the AI",
};
const FOOTER = "_Keystone AI Tech Lead: questions to guide you, not answers. Your pod reviewer has the final say._";

class ReviewModelUnavailable extends Error {
  constructor(cause: unknown) {
    super("review model unavailable");
    this.name = "ReviewModelUnavailable";
    this.cause = cause;
  }
}

/** GitHub `X-Hub-Signature-256` check: "sha256=" + HMAC-SHA256(rawBody, secret) in hex, compared in constant time. */
export function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`, "utf8");
  const got = Buffer.from(signatureHeader, "utf8");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

const PullRequestEventZ = z.object({
  action: z.string(),
  number: z.number().optional(),
  pull_request: z.object({
    number: z.number(),
    title: z.string().optional(),
    body: z.string().nullable().optional(),
    html_url: z.string().optional(),
    merged: z.boolean().nullable().optional(),
    merged_at: z.string().nullable().optional(),
    user: z.object({ login: z.string() }).nullable().optional(),
  }),
  repository: z.object({ name: z.string(), full_name: z.string().optional(), owner: z.object({ login: z.string() }) }),
});

async function recordMerge(e: z.infer<typeof PullRequestEventZ>): Promise<void> {
  const login = e.pull_request.user?.login?.toLowerCase();
  if (!login) return;
  const store = getStore();
  const profiles = await store.list<Profile>("profiles");
  const member = profiles.find((p) => p.githubLogin?.toLowerCase() === login);
  if (!member) return;
  const repo = e.repository.name;
  const id = `pr-merged-${e.repository.owner.login}-${repo}-${e.pull_request.number}`.toLowerCase();
  await store.upsert(
    "momentum_events",
    id,
    { id, userId: member.id, kind: "pr-merged", ts: e.pull_request.merged_at ?? new Date().toISOString(), label: `Merged PR in ${repo}`, url: e.pull_request.html_url },
    member.id,
  );
}

/** Handles a GitHub `pull_request` webhook payload. Only opened/synchronize get a review comment. */
export async function reviewPullRequest(event: unknown): Promise<{ reviewed: boolean }> {
  const parsed = PullRequestEventZ.safeParse(event);
  if (!parsed.success) return { reviewed: false };
  const e = parsed.data;

  if (e.action === "closed" && e.pull_request.merged === true) {
    try { await recordMerge(e); } catch { /* momentum is best-effort */ }
    return { reviewed: false };
  }
  if (e.action !== "opened" && e.action !== "synchronize") return { reviewed: false };

  const token = process.env.GITHUB_TOKEN;
  if (!token) return { reviewed: false };
  const owner = e.repository.owner.login;
  const repo = e.repository.name;
  const n = e.pull_request.number;
  const { output } = await runAgent<{ reviewed: boolean }>({
    agent: "techlead",
    runId: newRunId(),
    purpose: `Reviewing PR #${n} in ${repo}`,
    input: { repo: `${owner}/${repo}`, pr: n, action: e.action },
    checkpoint: REVIEW_CHECKPOINT,
    timeoutMs: 45_000,
    run: async (ctx) => {
      const octokit = new Octokit({ auth: token });
      const fullDiff = await ctx.step(
        "read diff",
        async () => {
          const diffRes = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
            owner, repo, pull_number: n, mediaType: { format: "diff" },
          });
          return typeof diffRes.data === "string" ? diffRes.data : String(diffRes.data ?? "");
        },
        (d) => `Read ${Math.min(d.length, MAX_DIFF_CHARS)} characters of diff${d.length > MAX_DIFF_CHARS ? " (truncated)" : ""}`,
      );
      const diff = fullDiff.slice(0, MAX_DIFF_CHARS);

      let review: string;
      try {
        review = await ctx.step("draft review", () => llmText({
          agent: "techlead", runId: ctx.runId, system: SOCRATIC_SYSTEM,
          user: `PR #${n}: ${e.pull_request.title ?? ""}\n\n${e.pull_request.body ?? ""}\n\nDIFF (may be truncated):\n${diff}`,
        }), () => "Drafted guiding questions");
      } catch (err) {
        throw new ReviewModelUnavailable(err);
      }
      // Guardrail BEFORE the side effect: no long code blocks, no "here is the full solution".
      const safe = ctx.guard(review.trim(), [noFullSolutions<string>()]);
      const body = `${safe}\n\n---\n${FOOTER}`;
      await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", { owner, repo, issue_number: n, body });
      ctx.done(`Posted a Socratic review on PR #${n}`, { pr: n });
      return { reviewed: true };
    },
    fallback: (err, ctx) => {
      ctx.done(err instanceof ReviewModelUnavailable ? "The review model is unavailable, so no comment was posted" : `Couldn't review PR #${n} on GitHub`);
      return { reviewed: false };
    },
  });
  return output;
}
