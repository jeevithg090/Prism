// API smoke suite: every route in app/api/** against a running server (DEMO_MODE=true or false, no keys).
// Valid input → 200 + {ok:true} + a zod-valid body; invalid input → 400; unknown ids → 404; never a 500.
// Then the full proof loop: match → project → review → merge → progress → badges/momentum → evidence.
import { createHmac } from "node:crypto";
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { z } from "zod";
import {
  BadgeIdZ, GuideSuggestionZ, HelpRequestZ, MomentumEventZ, MomentumWeekZ, PodZ, ProfileZ, ProjectBriefZ, TrajectoryZ,
} from "@/lib/schemas/community";
import { LecturerCohortZ, LecturerInsightsZ } from "@/lib/schemas/lecturer";
import { PodInsightsZ, PRReviewZ, ProjectProgressZ, ProofResultZ } from "@/lib/schemas/studio";

const SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "e2e-webhook-secret";
const DEMO_POD = "pod_demo01";
const PROGRAMME = "uom-bsc-cs";
const uid = () => Math.random().toString(36).slice(2, 8);

/** 200 + {ok:true, data} where data passes `schema`; returns the parsed data. */
async function okData<S extends z.ZodType>(res: APIResponse, schema: S): Promise<z.infer<S>> {
  const text = await res.text();
  expect(res.status(), `${res.url()} → ${text.slice(0, 300)}`).toBe(200);
  const body = JSON.parse(text) as { ok: boolean; data: unknown };
  expect(body.ok).toBe(true);
  const parsed = schema.safeParse(body.data);
  expect(parsed.success, parsed.success ? "" : `${res.url()} shape: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
  return parsed.data as z.infer<S>;
}

/** {ok:false, error:{code,message}} with the given status (and code). */
async function expectErr(res: APIResponse, status: number, code?: string) {
  const text = await res.text();
  expect(res.status(), `${res.url()} → ${text.slice(0, 300)}`).toBe(status);
  const body = JSON.parse(text) as { ok: boolean; error: { code: string; message: string } };
  expect(body.ok).toBe(false);
  expect(body.error.message.length).toBeGreaterThan(0);
  if (code) expect(body.error.code).toBe(code);
}

const post = (request: APIRequestContext, url: string, data: unknown) => request.post(url, { data });
// A Buffer goes over the wire byte for byte (Playwright JSON-encodes a string body that isn't valid JSON).
const postRaw = (request: APIRequestContext, url: string, body: string) =>
  request.post(url, { data: Buffer.from(body, "utf8"), headers: { "content-type": "application/json" } });

async function isDemo(request: APIRequestContext): Promise<boolean> {
  const res = await request.get("/api/health");
  const body = await okData(res, z.object({ service: z.literal("keystone"), demo: z.boolean(), ts: z.string() }));
  return body.demo;
}

const SimilarZ = z.array(z.object({ trajectory: TrajectoryZ, similarity: z.number().min(-1).max(1) }));
const MatchedPodZ = PodZ.extend({ runId: z.string().min(1) });

test.describe("API smoke: every route", () => {
  test("GET /api/health", async ({ request }) => {
    expect(typeof (await isDemo(request))).toBe("boolean");
  });

  test("GET /api/profile/[id]", async ({ request }) => {
    const p = await okData(await request.get("/api/profile/aisha"), ProfileZ);
    expect(p.id).toBe("aisha");
    await expectErr(await request.get("/api/profile/nobody-here"), 404, "not_found");
  });

  test("GET /api/badges/[userId]", async ({ request }) => {
    const badges = await okData(await request.get("/api/badges/aisha"), z.array(BadgeIdZ));
    expect(badges).toContain("international");
    await expectErr(await request.get("/api/badges/nobody-here"), 404, "not_found");
  });

  test("GET /api/momentum/[userId] (weeks, events, bad view)", async ({ request }) => {
    const weeks = await okData(await request.get("/api/momentum/aisha"), z.array(MomentumWeekZ).length(6));
    expect(weeks.every((w) => w.userId === "aisha")).toBe(true);
    const sorted = [...weeks].map((w) => w.week).sort();
    expect(weeks.map((w) => w.week)).toEqual(sorted); // latest last
    const events = await okData(await request.get("/api/momentum/aisha?view=events"), z.array(MomentumEventZ).min(1));
    const ts = events.map((e) => Date.parse(e.ts));
    expect(ts).toEqual([...ts].sort((a, b) => b - a)); // newest first
    expect(events.every((e) => !!e.label)).toBe(true);
    await expectErr(await request.get("/api/momentum/aisha?view=everything"), 400, "bad_request");
    // By design (and unit-tested): a user with no events gets 6 empty weeks, not a 404.
    const empty = await okData(await request.get("/api/momentum/nobody-here"), z.array(MomentumWeekZ).length(6));
    expect(empty.every((w) => w.score === 0)).toBe(true);
  });

  test("GET /api/pods?userId=", async ({ request }) => {
    const pods = await okData(await request.get("/api/pods?userId=aisha"), z.array(PodZ));
    expect(pods.every((p) => p.members.some((m) => m.userId === "aisha"))).toBe(true);
    await expectErr(await request.get("/api/pods"), 400, "bad_request");
    await expectErr(await request.get("/api/pods?userId="), 400, "bad_request");
  });

  test("GET /api/pods/[podId]", async ({ request }) => {
    const pod = await okData(await request.get(`/api/pods/${DEMO_POD}`), PodZ);
    expect(pod.id).toBe(DEMO_POD);
    await expectErr(await request.get("/api/pods/pod_nope"), 404, "not_found");
  });

  test("POST /api/pods/match", async ({ request }) => {
    const pod = await okData(await post(request, "/api/pods/match", { userId: "aisha" }), MatchedPodZ);
    expect(pod.members[0]?.userId).toBe("aisha");
    expect(pod.members.length).toBeGreaterThanOrEqual(3);
    expect(pod.explanations.length).toBeGreaterThan(0);
    await expectErr(await post(request, "/api/pods/match", {}), 400, "bad_request");
    await expectErr(await postRaw(request, "/api/pods/match", "not json"), 400, "bad_request");
    await expectErr(await post(request, "/api/pods/match", { userId: "nobody-here" }), 404, "not_found");
  });

  test("GET /api/pods/insights", async ({ request }) => {
    const ins = await okData(await request.get(`/api/pods/insights?programmeId=${PROGRAMME}`), PodInsightsZ);
    expect(ins.suppressed).toBe(false);
    expect(ins.cohortSize).toBeGreaterThanOrEqual(10);
    expect(ins.peerTeachable.length).toBeGreaterThan(0);
    await expectErr(await request.get("/api/pods/insights"), 400, "bad_request");
    // Below the anonymity threshold: suppressed, never a list.
    const none = await okData(await request.get("/api/pods/insights?programmeId=nowhere"), PodInsightsZ);
    expect(none).toMatchObject({ suppressed: true, peerTeachable: [], unteachableGaps: [] });
  });

  test("POST /api/projects/create", async ({ request }) => {
    const brief = await okData(await post(request, "/api/projects/create", { podId: DEMO_POD }), ProjectBriefZ);
    expect(brief.repoUrl).toMatch(/^https:\/\/github\.com\//);
    expect(brief.issues.length).toBeGreaterThan(0);
    expect(brief.issues.every((i) => /^https:\/\/github\.com\/.+\/issues\/\d+$/.test(i.githubIssueUrl ?? ""))).toBe(true);
    await expectErr(await post(request, "/api/projects/create", {}), 400, "bad_request");
    await expectErr(await postRaw(request, "/api/projects/create", "{"), 400, "bad_request");
    await expectErr(await post(request, "/api/projects/create", { podId: "pod_nope" }), 404, "not_found");
  });

  test("POST /api/projects/review", async ({ request }) => {
    const review = await okData(await post(request, "/api/projects/review", { podId: DEMO_POD }), PRReviewZ);
    expect(review.hints.length).toBeGreaterThan(0);
    expect(review.hints.length).toBeLessThanOrEqual(6);
    expect(review.comment).not.toMatch(/```[\s\S]{400,}```/); // Socratic: no long code blocks
    await expectErr(await post(request, "/api/projects/review", {}), 400, "bad_request");
    await expectErr(await post(request, "/api/projects/review", { podId: DEMO_POD, prNumber: -2 }), 400, "bad_request");
    await expectErr(await post(request, "/api/projects/review", { podId: "pod_nope" }), 404, "not_found");
  });

  test("POST /api/projects/merge (validation and unknown ids)", async ({ request }) => {
    await expectErr(await post(request, "/api/projects/merge", {}), 400, "bad_request");
    await expectErr(await post(request, "/api/projects/merge", { podId: DEMO_POD, issueIndex: -1 }), 400, "bad_request");
    await expectErr(await post(request, "/api/projects/merge", { podId: DEMO_POD, issueIndex: 1.5 }), 400, "bad_request");
    await expectErr(await postRaw(request, "/api/projects/merge", "nope"), 400, "bad_request");
    await expectErr(await post(request, "/api/projects/merge", { podId: "pod_nope", issueIndex: 0 }), 404, "not_found");
    await expectErr(await post(request, "/api/projects/merge", { podId: DEMO_POD, issueIndex: 99 }), 404, "not_found");
  });

  test("GET /api/projects/progress", async ({ request }) => {
    const prog = await okData(await request.get(`/api/projects/progress?podId=${DEMO_POD}`), ProjectProgressZ);
    expect(prog.podId).toBe(DEMO_POD);
    const idx = prog.merged.map((m) => m.issueIndex);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    await expectErr(await request.get("/api/projects/progress"), 400, "bad_request");
    await expectErr(await request.get("/api/projects/progress?podId=pod_nope"), 404, "not_found");
  });

  test("GET /api/trajectories", async ({ request }) => {
    const all = await okData(await request.get("/api/trajectories"), z.array(TrajectoryZ).min(1));
    const mine = await okData(await request.get(`/api/trajectories?programmeId=${PROGRAMME}`), z.array(TrajectoryZ));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t) => t.programmeId === PROGRAMME)).toBe(true);
    expect(mine.length).toBeLessThanOrEqual(all.length);
    expect(await okData(await request.get("/api/trajectories?programmeId=nowhere"), z.array(TrajectoryZ))).toEqual([]);
    await expectErr(await request.get("/api/trajectories?programmeId="), 400, "bad_request");
  });

  test("GET /api/trajectories/similar", async ({ request }) => {
    const sims = await okData(await request.get("/api/trajectories/similar?userId=aisha&limit=3"), SimilarZ);
    expect(sims.length).toBeGreaterThan(0);
    expect(sims.length).toBeLessThanOrEqual(3);
    expect(sims.every((s) => s.trajectory.userId !== "aisha")).toBe(true);
    const scores = sims.map((s) => s.similarity);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    await expectErr(await request.get("/api/trajectories/similar"), 400, "bad_request");
    await expectErr(await request.get("/api/trajectories/similar?userId=aisha&limit=99"), 400, "bad_request");
    await expectErr(await request.get("/api/trajectories/similar?userId=aisha&limit=abc"), 400, "bad_request");
    await expectErr(await request.get("/api/trajectories/similar?userId=nobody-here"), 404, "not_found");
  });

  test("GET /api/help", async ({ request }) => {
    const all = await okData(await request.get("/api/help"), z.array(HelpRequestZ).min(1));
    const ts = all.map((r) => Date.parse(r.createdAt));
    expect(ts).toEqual([...ts].sort((a, b) => b - a)); // newest first
    const open = await okData(await request.get("/api/help?status=open"), z.array(HelpRequestZ));
    expect(open.every((r) => r.status === "open")).toBe(true);
    const fixture = await okData(await request.get("/api/help?demo=1"), z.array(HelpRequestZ));
    expect(fixture.length).toBe(8);
    await expectErr(await request.get("/api/help?status=bogus"), 400, "bad_request");
  });

  test("POST /api/help (create, update, accept → helper momentum)", async ({ request }) => {
    const message = `e2e api question ${uid()}`;
    const created = await okData(await post(request, "/api/help", { fromUserId: "sara", kind: "question", message }), HelpRequestZ);
    expect(created).toMatchObject({ fromUserId: "sara", kind: "question", message, status: "open" });
    const listed = await okData(await request.get("/api/help?status=open"), z.array(HelpRequestZ));
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    await expectErr(await post(request, "/api/help", {}), 400, "bad_request");
    await expectErr(await post(request, "/api/help", { fromUserId: "sara", kind: "question", message: "   " }), 400, "bad_request");
    await expectErr(await post(request, "/api/help", { fromUserId: "sara", kind: "favour", message: "hi" }), 400, "bad_request");
    await expectErr(await post(request, "/api/help", { fromUserId: "sara", kind: "question", message: "x".repeat(1001) }), 400, "bad_request");
    await expectErr(await postRaw(request, "/api/help", "{oops"), 400, "bad_request");
    await expectErr(await post(request, "/api/help", { id: "help_nope", status: "accepted", toUserId: "jakub" }), 404, "not_found");
    await expectErr(await post(request, "/api/help", { id: created.id, status: "bogus" }), 400, "bad_request");
    await expectErr(await post(request, "/api/help", { id: created.id, status: "accepted", toUserId: "sara" }), 400, "bad_request");

    const accepted = await okData(await post(request, "/api/help", { id: created.id, status: "accepted", toUserId: "jakub" }), HelpRequestZ);
    expect(accepted).toMatchObject({ id: created.id, status: "accepted", toUserId: "jakub" });
    const events = await okData(await request.get("/api/momentum/jakub?view=events"), z.array(MomentumEventZ));
    const ev = events.find((e) => e.id === `mev_help_${created.id}_jakub`);
    expect(ev).toMatchObject({ kind: "helped-newcomer", userId: "jakub" });
    expect(ev?.label).toContain("Sara");
    // Accepting twice never double-counts.
    await okData(await post(request, "/api/help", { id: created.id, status: "accepted", toUserId: "jakub" }), HelpRequestZ);
    const again = await okData(await request.get("/api/momentum/jakub?view=events"), z.array(MomentumEventZ));
    expect(again.filter((e) => e.id === ev?.id)).toHaveLength(1);
  });

  test("POST /api/guides/find (+ the 3-a-day limit)", async ({ request }) => {
    await expectErr(await post(request, "/api/guides/find", {}), 400, "bad_request");
    await expectErr(await postRaw(request, "/api/guides/find", "nope"), 400, "bad_request");
    await expectErr(await post(request, "/api/guides/find", { userId: "nobody-here" }), 404, "not_found");
    // Each user gets 3 drafts a day on this server; use the first user with quota left (re-runs on a reused server).
    let user: string | null = null;
    for (const id of ["dev", "amara", "hannah", "yusuf", "chloe", "leo", "jakub", "ollie"]) {
      const res = await post(request, "/api/guides/find", { userId: id });
      if (res.status() === 429) continue;
      const guides = await okData(res, z.array(GuideSuggestionZ).min(1));
      expect(guides.every((g) => g.draftMessage.length > 0 && /^https?:\/\//.test(g.publicUrl))).toBe(true);
      user = id;
      break;
    }
    expect(user, "every candidate user is out of guide drafts on this server: restart it").not.toBeNull();
    let last: APIResponse | null = null;
    for (let i = 0; i < 3; i++) {
      last = await post(request, "/api/guides/find", { userId: user });
      if (last.status() === 429) break;
      await okData(last, z.array(GuideSuggestionZ));
    }
    await expectErr(last!, 429, "daily_limit");
  });

  test("GET /api/lecturer/cohort", async ({ request }) => {
    const c = await okData(await request.get(`/api/lecturer/cohort?programmeId=${PROGRAMME}`), LecturerCohortZ);
    expect(c).toMatchObject({ programmeId: PROGRAMME, suppressed: false });
    expect(c.cohortSize).toBeGreaterThanOrEqual(10);
    expect(c.roles.reduce((a, r) => a + r.students, 0)).toBeLessThanOrEqual(c.cohortSize);
    await expectErr(await request.get("/api/lecturer/cohort"), 400, "bad_request");
    await expectErr(await request.get("/api/lecturer/cohort?programmeId=%20"), 400, "bad_request");
    const none = await okData(await request.get("/api/lecturer/cohort?programmeId=nowhere"), LecturerCohortZ);
    expect(none).toMatchObject({ suppressed: true, roles: [] });
  });

  test("GET /api/lecturer/insights", async ({ request }) => {
    const ins = await okData(await request.get(`/api/lecturer/insights?programmeId=${PROGRAMME}`), LecturerInsightsZ);
    expect(ins.gaps.length).toBeGreaterThan(0);
    expect(ins.labIdeas.length).toBeGreaterThan(0);
    // Anonymous: no user ids or names anywhere in the payload.
    expect(JSON.stringify(ins)).not.toMatch(/aisha|priya|"userId"/i);
    await expectErr(await request.get("/api/lecturer/insights"), 400, "bad_request");
    const none = await okData(await request.get("/api/lecturer/insights?programmeId=nowhere"), LecturerInsightsZ);
    expect(none.gaps).toEqual([]);
  });

  test("POST /api/webhooks/github", async ({ request }) => {
    const sign = (raw: string) => `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
    const hook = (raw: string, event: string, signature: string | null = sign(raw)) =>
      request.post("/api/webhooks/github", {
        data: Buffer.from(raw, "utf8"),
        headers: { "content-type": "application/json", "x-github-event": event, ...(signature ? { "x-hub-signature-256": signature } : {}) },
      });

    await expectErr(await hook("{}", "ping", null), 401, "unauthorized");
    await expectErr(await hook("{}", "ping", "sha256=deadbeef"), 401, "unauthorized");
    const ping = await hook("{}", "ping");
    test.skip(ping.status() === 401, "the server's GITHUB_WEBHOOK_SECRET is not the suite's (see e2e/README.md)");
    expect(await okData(ping, z.object({ reviewed: z.literal(false) }))).toEqual({ reviewed: false });
    await expectErr(await hook("{not json", "pull_request"), 400, "bad_request");

    // An opened PR without a GitHub token: no review is posted, and it says so.
    const opened = JSON.stringify({
      action: "opened",
      pull_request: { number: 9, title: "WIP", body: "", html_url: "https://github.com/keystone-demo/pod-vision-demo/pull/9" },
      repository: { name: "pod-vision-demo", owner: { login: "keystone-demo" } },
    });
    expect(await okData(await hook(opened, "pull_request"), z.object({ reviewed: z.boolean() }))).toMatchObject({ reviewed: false });

    // A merged PR on the demo pod's repo that closes issue #2 → proof of skill for that issue's assignee.
    const pod = await okData(await request.get(`/api/pods/${DEMO_POD}`), PodZ);
    const merged = JSON.stringify({
      action: "closed",
      pull_request: {
        number: 42, title: "Postgres schema", body: "Closes #2", merged: true, merged_at: new Date().toISOString(),
        html_url: "https://github.com/keystone-demo/pod-vision-demo/pull/42", user: { login: "someone" },
      },
      repository: { name: "pod-vision-demo", full_name: "keystone-demo/pod-vision-demo", html_url: pod.project!.repoUrl, owner: { login: "keystone-demo" } },
    });
    const res = await okData(await hook(merged, "pull_request"), z.object({ reviewed: z.literal(false), proof: ProofResultZ }));
    const issue = res.proof.issueIndex;
    expect(pod.project!.issues[issue]?.githubIssueUrl).toMatch(/\/issues\/2$/);
    expect(res.proof.userId).toBe(pod.project!.issues[issue]!.assigneeUserId);
  });
});

test.describe("Proof loop chain", () => {
  test("match aisha → create project → review → merge issue 0 → progress → badges + momentum → evidence", async ({ request }) => {
    const demo = await isDemo(request);

    // 1. Match: Aisha's pod (in DEMO_MODE the seeded demo pod under its stable id).
    const pod = await okData(await post(request, "/api/pods/match", { userId: "aisha" }), MatchedPodZ);
    if (demo) expect(pod.id).toBe(DEMO_POD);
    expect(await okData(await request.get(`/api/pods/${pod.id}`), PodZ)).toMatchObject({ id: pod.id, name: pod.name });

    // 2. Project: a repo and one GitHub issue per task; calling it again is idempotent.
    const brief = await okData(await post(request, "/api/projects/create", { podId: pod.id }), ProjectBriefZ);
    expect(brief.repoUrl).toMatch(/^https:\/\/github\.com\//);
    expect(brief.issues.length).toBeGreaterThan(0);
    const memberIds = new Set(pod.members.map((m) => m.userId));
    expect(brief.issues.every((i) => memberIds.has(i.assigneeUserId) && memberIds.has(i.reviewerUserId))).toBe(true);
    const again = await okData(await post(request, "/api/projects/create", { podId: pod.id }), ProjectBriefZ);
    expect(again.repoUrl).toBe(brief.repoUrl);
    const stored = await okData(await request.get(`/api/pods/${pod.id}`), PodZ);
    expect(stored.project?.repoUrl).toBe(brief.repoUrl);

    // 3. Review now: the AI Tech Lead's Socratic hints.
    const review = await okData(await post(request, "/api/projects/review", { podId: pod.id }), PRReviewZ);
    expect(review.hints.length).toBeGreaterThan(0);

    // 4. Merge issue 0 → proof for the learner and the reviewer.
    const issue = brief.issues[0]!;
    const proof = await okData(await post(request, "/api/projects/merge", { podId: pod.id, issueIndex: 0 }), ProofResultZ);
    expect(proof).toMatchObject({ podId: pod.id, issueIndex: 0, userId: issue.assigneeUserId, skillId: issue.skillId, reviewerUserId: issue.reviewerUserId });
    expect(proof.readinessAfter).toBeGreaterThanOrEqual(proof.readinessBefore);
    expect(proof.momentumPoints).toBeGreaterThan(0);
    expect(proof.badgesEarned.every((b) => b === "shipped")).toBe(true);
    // DEMO_MODE reuses the seeded pod, so the stored proof is the story's: Docker, readiness 38% → 43%.
    // (Live, every match is a new pod and Docker may already be proven from an earlier run on this server.)
    if (demo && issue.assigneeUserId === "aisha" && issue.skillId === "docker") {
      expect(proof.readinessBefore).toBeCloseTo(0.38, 2);
      expect(proof.readinessAfter).toBeGreaterThan(proof.readinessBefore);
      expect(proof.message).toContain("Docker is now proven");
    }

    // 5. Progress shows it (exactly once, even after a second merge call).
    const progress = await okData(await request.get(`/api/projects/progress?podId=${pod.id}`), ProjectProgressZ);
    expect(progress.merged.filter((m) => m.issueIndex === 0)).toEqual([expect.objectContaining({ userId: issue.assigneeUserId, skillId: issue.skillId })]);
    const twice = await okData(await post(request, "/api/projects/merge", { podId: pod.id, issueIndex: 0 }), ProofResultZ);
    expect(twice.evidenceIds).toEqual(proof.evidenceIds);
    const progress2 = await okData(await request.get(`/api/projects/progress?podId=${pod.id}`), ProjectProgressZ);
    expect(progress2.merged.filter((m) => m.issueIndex === 0)).toHaveLength(1);

    // 6. Badges: the learner has shipped.
    expect(await okData(await request.get(`/api/badges/${issue.assigneeUserId}`), z.array(BadgeIdZ))).toContain("shipped");

    // 7. Momentum: the learner's pr-merged event (Aisha in DEMO_MODE keeps her fixture: +18% this week, by design),
    //    and the reviewer's helped-newcomer event when the learner is a 🌱 newcomer.
    const learnerEvents = await okData(await request.get(`/api/momentum/${issue.assigneeUserId}?view=events`), z.array(MomentumEventZ));
    if (demo && issue.assigneeUserId === "aisha") {
      const weeks = await okData(await request.get("/api/momentum/aisha"), z.array(MomentumWeekZ).length(6));
      expect(weeks.at(-1)).toMatchObject({ week: "2026-W45", changePct: 18 });
    } else {
      expect(learnerEvents.find((e) => e.id === `pr-merged-${pod.id}-0`)).toMatchObject({ kind: "pr-merged", userId: issue.assigneeUserId });
    }
    const learner = await okData(await request.get(`/api/profile/${issue.assigneeUserId}`), ProfileZ);
    if (learner.badges.includes("new-to-uni") && issue.reviewerUserId !== issue.assigneeUserId) {
      const reviewerEvents = await okData(await request.get(`/api/momentum/${issue.reviewerUserId}?view=events`), z.array(MomentumEventZ));
      expect(reviewerEvents.find((e) => e.id === `helped-newcomer-${pod.id}-0`)).toMatchObject({ kind: "helped-newcomer" });
    }

    // 8. Evidence: the learner's skill proof and the reviewer's code-review proof.
    expect(proof.evidenceIds).toEqual([`ev_pod_${pod.id}_0_${issue.assigneeUserId}`, `ev_pod_${pod.id}_0_${issue.reviewerUserId}_review`]);
    // GET /api/evidence/[userId] is P2's route: check it too once it exists in this build.
    const ev = await request.get(`/api/evidence/${issue.assigneeUserId}`);
    if ((ev.headers()["content-type"] ?? "").includes("application/json") && ev.status() === 200) {
      const items = await okData(ev, z.array(z.object({ id: z.string(), skillId: z.string(), source: z.string() })));
      expect(items.find((i) => i.id === proof.evidenceIds[0])).toMatchObject({ skillId: issue.skillId, source: "keystone-pod" });
    }
  });
});
