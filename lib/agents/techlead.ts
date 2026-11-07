// P5 · AI Tech Lead: Socratic pull-request reviews for pod repos, plus pr-merged momentum events.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Octokit } from "octokit";
import { llmText } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { emit, newRunId } from "@/lib/agents/events";
import { NotFoundError, loadPod } from "@/lib/agents/proof";
import { UNTRUSTED_RULE, dropApprovalClaims, guardOutput, scanForInjection, wrapUntrusted } from "@/lib/agents/safety/injection";
import type { PRReview } from "@/lib/schemas/studio";
import type { Profile } from "@/lib/types";

export const SOCRATIC_SYSTEM =
  `You are a kind senior engineer mentoring students. Give a Socratic review: max 6 bullets, ask guiding questions and point to concepts/docs; NEVER write the full solution or large code blocks. ${UNTRUSTED_RULE}`;
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

export const INJECTION_HINT = "This PR contains text addressed to an AI reviewer; your human reviewer will check it.";

/** The PR's title, body and diff (all student-written) as one neutralized <untrusted> block, plus the injection scan. */
export function prPrompt(n: number, title: string, body: string | null | undefined, diff: string): { user: string; flagged: boolean } {
  const raw = `PR #${n}: ${title}\n\n${body ?? ""}\n\nDIFF (may be truncated):\n${diff}`;
  return { user: wrapUntrusted(`github-pr-${n}`, raw, MAX_DIFF_CHARS + 2000), flagged: scanForInjection(raw).risk === "high" };
}

/** Flagged PR: drop any "approved" claim the model was talked into and add one gentle human-check hint. */
export function withInjectionHint(review: string, flagged: boolean): string {
  return flagged ? `${dropApprovalClaims(review).trim()}\n- ${INJECTION_HINT}` : review;
}

export const REVIEW_FOOTER = "_Keystone AI Tech Lead: questions to guide you, not answers. Your pod reviewer has the final say._";

/** The GitHub comment: the review with long code blocks removed, plus the footer. */
export function formatReviewComment(review: string): string {
  return `${stripLongCodeBlocks(guardOutput(review.trim()))}\n\n---\n${REVIEW_FOOTER}`;
}

/** The review's bullets as plain strings (max 6), for the UI. */
export function extractHints(review: string, max = 6): string[] {
  const bullets: string[] = [];
  for (const line of stripLongCodeBlocks(guardOutput(review)).split("\n")) {
    const m = line.match(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (m) bullets.push(m[1].trim());
    else if (bullets.length && /^\s{2,}\S/.test(line)) bullets[bullets.length - 1] += ` ${line.trim()}`;
  }
  const hints = bullets.length ? bullets : review.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith("```") && !p.startsWith("_("));
  return hints.slice(0, max);
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

    const prompt = prPrompt(n, e.pull_request.title ?? "", e.pull_request.body, diff);
    let review: string;
    try {
      review = withInjectionHint(await llmText({ agent: "techlead", runId, system: SOCRATIC_SYSTEM, user: prompt.user }), prompt.flagged);
    } catch {
      emit({ runId, agent: "techlead", status: "error", message: "The review model is unavailable, so no comment was posted" });
      return { reviewed: false };
    }
    const body = formatReviewComment(review);
    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", { owner, repo, issue_number: n, body });
    emit({ runId, agent: "techlead", status: "done", message: `Posted a Socratic review on PR #${n}` });
    return { reviewed: true };
  } catch {
    emit({ runId, agent: "techlead", status: "error", message: `Couldn't review PR #${n} on GitHub` });
    return { reviewed: false };
  }
}

// ---------- "Review my PR now": the Tech Lead on demand, no webhook needed ----------

/** A realistic first Dockerfile PR for the demo pod (issue #1), with the classic beginner mistakes. */
export const SAMPLE_PR = {
  number: 1,
  title: "Add a Dockerfile for the captioning API",
  body: "Closes #1. First go at containerising the API; it builds and runs on my laptop!",
  diff: [
    "diff --git a/Dockerfile b/Dockerfile",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/Dockerfile",
    "@@ -0,0 +1,12 @@",
    "+FROM python:3.12",
    "+WORKDIR /app",
    "+",
    "+COPY . .",
    "+RUN pip install -r requirements.txt",
    "+",
    "+# bake the 1.9 GB BLIP weights in so the API starts fast",
    "+COPY models/blip-captioning /app/models/blip-captioning",
    "+ENV MODEL_DIR=/app/models/blip-captioning",
    "+",
    "+EXPOSE 8000",
    "+CMD [\"uvicorn\", \"api.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8000\"]",
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -9,0 +10,3 @@",
    "+## Run with Docker (first build takes ~6 minutes)",
    "+docker build -t visionaid . && docker run -p 8000:8000 visionaid",
    "+Edit code? Rebuild the image, then run it again.",
  ].join("\n"),
} as const;

/** Deterministic Socratic review of SAMPLE_PR: guiding questions + docs, never the finished Dockerfile. */
export const DEMO_HINTS: readonly string[] = [
  "**Layer caching:** `COPY . .` runs before `pip install`, so what happens to the install step every time you change one line in `api/main.py`? Which order of `COPY` steps would let Docker reuse the dependency layer? See \"Optimize cache usage in builds\": https://docs.docker.com/build/cache/optimize/",
  "**Image size:** `python:3.12` is the full Debian image. How big is your image right now (`docker images`)? What would a slim variant leave out, and does the API need any of it? And since `COPY . .` sends your whole folder (`.git`, any local venv), which file tells Docker what to skip? See https://docs.docker.com/build/building/best-practices/ and https://docs.docker.com/build/concepts/context/",
  "**Who runs the app?** There's no `USER` line, so uvicorn runs as root inside the container. If someone found a bug in the upload endpoint, what could they do as root? What would you add so the process runs as an unprivileged user? See the `USER` section of https://docs.docker.com/build/building/best-practices/",
  "**Model weights:** the 1.9 GB weights are baked into the image. What happens to build time, pushes and every teammate's pull when Week 2's fine-tuned model replaces them? Compare that with mounting them as a volume or downloading them at start-up: which fits your pod's workflow? See https://docs.docker.com/engine/storage/volumes/",
  "**One command for the pod:** the issue asks for `docker compose up` on port 8000. Which build flags, ports and paths does a teammate need to remember today, and how could a Compose file capture them so everyone starts the API with one command? See https://docs.docker.com/compose/gettingstarted/",
];

export function demoReviewMarkdown(hints: readonly string[] = DEMO_HINTS): string {
  return [
    "Nice first Dockerfile: it builds and the README tells teammates how to run it. A few questions to explore before your reviewer approves:",
    "",
    ...hints.map((x) => `- ${x}`),
  ].join("\n");
}

/** owner/repo from a GitHub repo URL. */
export function parseRepo(url?: string): { owner: string; repo: string } | null {
  const m = url?.match(/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

const lineCount = (diff: string) => (diff ? diff.replace(/\n+$/, "").split("\n").length : 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

type OpenPR = { number: number; title: string; body?: string | null; html_url: string; created_at?: string };

/**
 * POST /api/projects/review. Live (GITHUB_TOKEN, not DEMO_MODE, pod repo on GitHub): reviews the requested or
 * newest open PR and posts the comment. Demo, or any failure: reviews SAMPLE_PR (LLM if available, else DEMO_HINTS).
 */
export async function reviewNow(opts: { podId: string; prNumber?: number }, runId?: string): Promise<PRReview> {
  const rid = runId ?? newRunId();
  const pod = await loadPod(opts.podId);
  if (!pod) throw new NotFoundError(`We couldn't find pod ${opts.podId}.`);
  const repoUrl = (pod.project?.repoUrl ?? "https://github.com/keystone-demo/pod-vision-demo").replace(/\/+$/, "");
  const token = process.env.GITHUB_TOKEN;
  const demo = process.env.DEMO_MODE === "true";
  const gh = parseRepo(repoUrl);

  if (!demo && token && gh) {
    try {
      const octokit = new Octokit({ auth: token });
      const list = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
        owner: gh.owner, repo: gh.repo, state: "open", sort: "created", direction: "desc", per_page: 20,
      });
      const prs = (Array.isArray(list.data) ? list.data : []) as OpenPR[];
      const pr = opts.prNumber ? prs.find((p) => p.number === opts.prNumber) : [...prs].sort((a, b) => b.number - a.number)[0];
      if (!pr) throw new Error("no open PR");
      const diffRes = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner: gh.owner, repo: gh.repo, pull_number: pr.number, mediaType: { format: "diff" },
      });
      const fullDiff = typeof diffRes.data === "string" ? diffRes.data : String(diffRes.data ?? "");
      const diff = fullDiff.slice(0, MAX_DIFF_CHARS);
      emit({
        runId: rid, agent: "techlead", status: "started",
        message: `reading PR #${pr.number} diff (${plural(lineCount(diff), "line")}${fullDiff.length > MAX_DIFF_CHARS ? ", truncated" : ""})`,
        data: { prNumber: pr.number, chars: diff.length },
      });
      const prompt = prPrompt(pr.number, pr.title, pr.body, diff);
      const raw = await llmText({ agent: "techlead", runId: rid, system: SOCRATIC_SYSTEM, user: prompt.user });
      const review = withInjectionHint(raw, prompt.flagged);
      const comment = formatReviewComment(review);
      const hints = prompt.flagged ? [...extractHints(dropApprovalClaims(raw), 5), INJECTION_HINT] : extractHints(review);
      await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", { owner: gh.owner, repo: gh.repo, issue_number: pr.number, body: comment });
      emit({ runId: rid, agent: "techlead", status: "done", message: `posted ${plural(hints.length, "Socratic hint")}: no solutions given`, data: { prNumber: pr.number, posted: true } });
      emit({ runId: rid, agent: "orchestrator", status: "done", message: `Tech Lead review posted on PR #${pr.number}` });
      return { prUrl: pr.html_url, prTitle: pr.title, comment, hints, posted: true, source: "live", runId: rid };
    } catch {
      // fall through to the sample PR so the demo never dead-ends
    }
  }

  const n = opts.prNumber ?? SAMPLE_PR.number;
  emit({
    runId: rid, agent: "techlead", status: "started",
    message: `reading PR #${n} diff (${plural(lineCount(SAMPLE_PR.diff), "line")})`,
    data: { prNumber: n, sample: true },
  });
  let review: string | null = null;
  if (!demo) {
    try {
      const out = await llmText({
        agent: "techlead", runId: rid, system: SOCRATIC_SYSTEM,
        user: prPrompt(n, SAMPLE_PR.title, SAMPLE_PR.body, SAMPLE_PR.diff).user,
      });
      review = out?.trim() ? out : null;
    } catch {
      review = null;
    }
  }
  const markdown = review ?? demoReviewMarkdown();
  const hints = review ? extractHints(review) : [...DEMO_HINTS];
  const comment = formatReviewComment(markdown);
  emit({ runId: rid, agent: "techlead", status: "done", message: `posted ${plural(hints.length, "Socratic hint")}: no solutions given`, data: { prNumber: n, posted: false } });
  emit({ runId: rid, agent: "orchestrator", status: "done", message: `Tech Lead review ready for PR #${n}` });
  return { prUrl: `${repoUrl}/pull/${n}`, prTitle: SAMPLE_PR.title, comment, hints, posted: false, source: "demo", runId: rid };
}
