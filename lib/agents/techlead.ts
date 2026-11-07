// P5 · AI Tech Lead: Socratic pull-request reviews for pod repos, plus pr-merged momentum events.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Octokit } from "octokit";
import { llmText } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { emit, newRunId } from "@/lib/agents/events";
import type { Profile } from "@/lib/types";

export const SOCRATIC_SYSTEM =
  "You are a kind senior engineer mentoring students. Give a Socratic review: max 6 bullets, ask guiding questions and point to concepts/docs; NEVER write the full solution or large code blocks.";
export const MAX_DIFF_CHARS = 8000;
export const MAX_CODE_LINES = 5;
const CODE_REMOVED = "_(A longer code sample was removed here. Try writing this part yourself, then ask your reviewer.)_";

/** GitHub `X-Hub-Signature-256` check: "sha256=" + HMAC-SHA256(rawBody, secret) in hex, compared in constant time. */
export function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`, "utf8");
  const got = Buffer.from(signatureHeader, "utf8");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/** Replaces fenced code blocks (``` or ~~~) longer than `maxLines` lines with a short note. Unclosed fences count too. */
export function stripLongCodeBlocks(text: string, maxLines = MAX_CODE_LINES): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (!open) { out.push(lines[i]); continue; }
    const fence = open[1];
    let j = i + 1;
    while (j < lines.length && !lines[j].trim().startsWith(fence)) j++;
    const content = lines.slice(i + 1, j);
    if (content.length > maxLines || j >= lines.length) out.push(CODE_REMOVED);
    else out.push(...lines.slice(i, j + 1));
    i = j;
  }
  return out.join("\n");
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
  const runId = newRunId();
  emit({ runId, agent: "techlead", status: "started", message: `Reviewing PR #${n} in ${repo}` });

  try {
    const octokit = new Octokit({ auth: token });
    const diffRes = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner, repo, pull_number: n, mediaType: { format: "diff" },
    });
    const fullDiff = typeof diffRes.data === "string" ? diffRes.data : String(diffRes.data ?? "");
    const diff = fullDiff.slice(0, MAX_DIFF_CHARS);
    emit({ runId, agent: "techlead", status: "progress", message: `Read ${diff.length} characters of diff${fullDiff.length > MAX_DIFF_CHARS ? " (truncated)" : ""}` });

    let review: string;
    try {
      review = await llmText({
        agent: "techlead", runId, system: SOCRATIC_SYSTEM,
        user: `PR #${n}: ${e.pull_request.title ?? ""}\n\n${e.pull_request.body ?? ""}\n\nDIFF (may be truncated):\n${diff}`,
      });
    } catch {
      emit({ runId, agent: "techlead", status: "error", message: "The review model is unavailable, so no comment was posted" });
      return { reviewed: false };
    }
    const body = `${stripLongCodeBlocks(review.trim())}\n\n---\n_Keystone AI Tech Lead: questions to guide you, not answers. Your pod reviewer has the final say._`;
    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", { owner, repo, issue_number: n, body });
    emit({ runId, agent: "techlead", status: "done", message: `Posted a Socratic review on PR #${n}` });
    return { reviewed: true };
  } catch {
    emit({ runId, agent: "techlead", status: "error", message: `Couldn't review PR #${n} on GitHub` });
    return { reviewed: false };
  }
}
