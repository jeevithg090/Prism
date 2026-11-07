#!/usr/bin/env node
// Records Keystone's demo story from a running Live AI server, so Demo mode can replay real results.
// Every OpenAI, Firecrawl, ElevenLabs (and, with TRENDS_LIVE=true, Hacker News) call the server makes in
// Live mode is saved under data/replay/<ns>/ on the server's disk (lib/replay.ts). Commit data/replay so the
// Vercel build ships them.
//
//   npm run record-demo                                  # http://localhost:3001 as aisha
//   npm run record-demo -- --base http://localhost:3002 --user aisha
//   npm run record-demo -- --no-github                   # skip the steps that write to GitHub
//   npm run record-demo -- --only coach,tts              # just some steps (names in the table)
//
// Needs a server with DEMO_MODE=false and the keys set. For the best replay hit rate, start it fresh (seed
// data) so the prompts match what a fresh Vercel instance sends. Heads-up: approving "Start our project"
// and "Review my PR" (and POST /api/projects/review) create a GitHub repo / post a PR comment when the
// server has GITHUB_TOKEN; --no-github skips those steps.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { github: true, conversation: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i];
    else if (a === "--user") out.user = argv[++i];
    else if (a === "--only") out.only = new Set(String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--no-github") out.github = false;
    else if (a === "--no-conversation") out.conversation = false;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/record-demo.mjs [--base http://localhost:3001] [--user aisha] [--no-github] [--no-conversation] [--only coach,pods,…]");
  process.exit(0);
}
const BASE = String(args.base ?? process.env.KEYSTONE_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const USER = args.user ?? "aisha";
const COOKIE = `ks_mode=live; ks_uid=${encodeURIComponent(USER)}`;
const SYLLABUS_URL = "https://www.manchester.ac.uk/study/undergraduate/courses/2027/00560/bsc-computer-science/";
const INTERVIEW_TRANSCRIPT = [
  "agent: Tell me about a recent piece of work you're proud of.",
  "user: In my pod we built a small recommendation service for student society events. I owned the Docker setup. I wrote a multi-stage Dockerfile, so the image went from about 1.2 GB to 180 MB, and I added a GitHub Actions job that builds and tests it on every pull request.",
  "agent: What was the hardest part, and how did you deal with it?",
  "user: Loading the model. The first version loaded the embeddings on every request, so responses took over two seconds. I moved the loading to start-up and cached it, then ran a quick load test: the slowest five percent of requests came back in about 120 milliseconds. Next time I'd add a health check and pin the Python dependencies earlier.",
  "agent: How did you work with the rest of your team?",
  "user: We split the work into GitHub issues. I reviewed two of Omar's pull requests and he reviewed mine. His review caught that I was copying the whole repo into the image, so I added a .dockerignore and the build got faster too.",
].join("\n");

const COACH_STORY = ["What should I do this week?", "Why Docker?", "Find me a pod", "Start our project", "Review my PR", "Who has been where I want to go?"];
const APPROVE = new Set(["Start our project", "Review my PR"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runId = () => `run_${Math.random().toString(36).slice(2, 12).padEnd(10, "0")}`;

async function call(method, route, body, { timeoutMs = 240_000, binary = false } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${route}`, {
      method,
      headers: { cookie: COOKIE, accept: binary ? "audio/mpeg" : "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const type = res.headers.get("content-type") ?? "";
    let json = null;
    let bytes = 0;
    if (type.includes("json")) json = await res.json().catch(() => null);
    else bytes = (await res.arrayBuffer()).byteLength;
    return { status: res.status, ok: res.ok, json, bytes, headers: res.headers, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, ok: false, json: null, bytes: 0, headers: new Headers(), ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function modeState() {
  const r = await call("GET", "/api/mode", undefined, { timeoutMs: 20_000 });
  return r.ok && r.json?.ok ? r.json.data : null;
}

const delta = (before, after) => {
  const out = {};
  for (const [ns, n] of Object.entries(after?.recordings ?? {})) {
    const d = n - (before?.recordings?.[ns] ?? 0);
    if (d > 0) out[ns] = d;
  }
  return out;
};

// ---------- the story ----------

const rows = [];
let pod = null; // the pod id from /api/pods/match, for the PR review
const sent = new Set(); // coach requests already sent (same inputs = same recording keys)

async function step(group, name, fn) {
  if (args.only && !args.only.has(group) && !args.only.has(name)) return;
  const before = await modeState();
  process.stdout.write(`- ${name} … `);
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { status: 0, ok: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
  }
  if (r?.skipped) {
    console.log(`skipped (${r.skipped})`);
    rows.push({ group, name, status: "skip", ms: 0, recorded: {}, note: r.skipped });
    return r;
  }
  const after = await modeState();
  const recorded = delta(before, after);
  const n = Object.values(recorded).reduce((a, b) => a + b, 0);
  const note = r.error ?? (r.ok ? r.note ?? "" : r.json?.error?.message ?? "");
  console.log(`${r.status || "ERR"} in ${(r.ms / 1000).toFixed(1)}s, ${n} new recording${n === 1 ? "" : "s"}${note ? ` (${note})` : ""}`);
  rows.push({ group, name, status: r.status || "ERR", ms: r.ms, recorded, note });
  return r;
}

const coachBody = (message, history, approval) => ({ userId: USER, message, history, ...(approval ? { approval } : {}), runId: runId() });

/** POST /api/coach unless these exact inputs were already sent (that recording already exists). */
async function coach(message, history = [], approval) {
  const sig = JSON.stringify({ message, history, approval });
  if (sent.has(sig)) return { skipped: "same request already recorded" };
  sent.add(sig);
  const r = await call("POST", "/api/coach", coachBody(message, history, approval));
  const d = r.json?.data;
  if (d) r.note = `${d.planner} planner${d.pendingApproval ? `, asks to approve ${d.pendingApproval.tool}` : ""}`;
  return r;
}

const approvalOf = (r) => {
  const p = r?.json?.data?.pendingApproval;
  return p ? { tool: p.tool, args: p.args, decision: "approve" } : null;
};

/** The Coach panel's flow: one conversation; history = the last 10 turns, approvals shown as "Approve: …". */
async function coachConversation() {
  const turns = [];
  const history = () => turns.slice(-10).map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  for (const message of COACH_STORY) {
    const prior = history();
    const r = await step("coach", `coach (conversation): ${message}`, () => coach(message, prior));
    turns.push({ role: "user", content: message });
    const answer = r?.json?.data?.answer;
    if (!answer) continue;
    turns.push({ role: "assistant", content: answer });
    const approval = approvalOf(r);
    if (approval && APPROVE.has(message)) {
      if (!args.github) {
        await step("coach", `coach (conversation): approve ${approval.tool}`, async () => ({ skipped: "--no-github" }));
        continue;
      }
      const title = r.json.data.pendingApproval.title;
      const prior2 = history();
      const a = await step("coach", `coach (conversation): approve ${approval.tool}`, () => coach(message, prior2, approval));
      turns.push({ role: "user", content: `Approve: ${title}` });
      if (a?.json?.data?.answer) turns.push({ role: "assistant", content: a.json.data.answer });
    }
  }
}

/** Each story question asked fresh (a new Coach chat), approving the side-effecting ones. */
async function coachStandalone() {
  for (const message of COACH_STORY) {
    const r = await step("coach", `coach: ${message}`, () => coach(message, []));
    const approval = approvalOf(r);
    if (approval && APPROVE.has(message)) {
      if (!args.github) {
        await step("coach", `coach: approve ${approval.tool}`, async () => ({ skipped: "--no-github" }));
        continue;
      }
      const prior = [{ role: "user", content: message }, { role: "assistant", content: r.json.data.answer }];
      await step("coach", `coach: approve ${approval.tool}`, () => coach(message, prior, approval));
    }
  }
}

async function waitForRun(id, limitMs = 6 * 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    const r = await call("GET", `/api/agents/stream?runId=${encodeURIComponent(id)}&poll=1`, undefined, { timeoutMs: 20_000 });
    const events = Array.isArray(r.json?.data) ? r.json.data : [];
    const end = events.find((e) => e.agent === "orchestrator" && (e.status === "done" || e.status === "error"));
    if (end) return { status: end.status === "done" ? 200 : 500, ok: end.status === "done", ms: Date.now() - t0, note: `${events.length} agent events, ${end.status}` };
    await sleep(2000);
  }
  return { status: 0, ok: false, ms: Date.now() - t0, error: "timed out waiting for the onboarding run" };
}

function voiceover() {
  try {
    const src = fs.readFileSync(path.join(ROOT, "components/launch/data.ts"), "utf8");
    const m = src.match(/export const VOICEOVER\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/);
    return m ? JSON.parse(`"${m[1]}"`) : null;
  } catch {
    return null;
  }
}

/** Every /api/labs/** route without a dynamic segment: POST {userId} when it exports POST, else GET ?userId=. */
function labRoutes() {
  const dir = path.join(ROOT, "app/api/labs");
  const out = [];
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith("[")) walk(p); }
      else if (e.name === "route.ts") {
        const src = fs.readFileSync(p, "utf8");
        const route = `/api/${path.relative(path.join(ROOT, "app/api"), path.dirname(p)).split(path.sep).join("/")}`;
        out.push({ route, method: /export\s+(async\s+)?function\s+POST\b|export\s+const\s+POST\b/.test(src) ? "POST" : "GET" });
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

async function main() {
  const start = await modeState();
  if (!start) {
    console.error(`No Keystone with the Demo toggle at ${BASE} (GET /api/mode failed). Start a Live server with this code, e.g. DEMO_MODE=false npx next dev -p 3001.`);
    process.exit(1);
  }
  if (start.demoModeEnv) {
    console.error(`${BASE} runs with DEMO_MODE=true, so it never calls the AI services and nothing would be recorded. Use a server with DEMO_MODE=false.`);
    process.exit(1);
  }
  if (start.mode !== "live") {
    console.error(`${BASE} didn't take the ks_mode=live cookie (mode is ${start.mode}).`);
    process.exit(1);
  }
  console.log(`Recording the demo story from ${BASE} as ${USER} (Live AI). ${start.total ?? 0} recordings before.${args.github ? "" : " GitHub steps skipped."}\n`);

  if (args.conversation) await coachConversation();
  await coachStandalone();

  await step("pods", "POST /api/pods/match", async () => {
    const r = await call("POST", "/api/pods/match", { userId: USER });
    pod = r.json?.data?.id ?? null;
    if (pod) r.note = `pod ${pod}`;
    return r;
  });
  await step("review", "POST /api/projects/review", async () => {
    if (!args.github) return { skipped: "--no-github" };
    return call("POST", "/api/projects/review", { podId: pod ?? "pod_demo01" });
  });
  await step("interview", "POST /api/interview/feedback", () =>
    call("POST", "/api/interview/feedback", { userId: USER, roleId: "ml-engineer", transcript: INTERVIEW_TRANSCRIPT, durationSec: 240, skillId: "docker" }));

  let script = null;
  await step("briefing", `GET /api/briefing/${USER}`, async () => {
    const r = await call("GET", `/api/briefing/${encodeURIComponent(USER)}`);
    script = r.json?.data?.script ?? null;
    if (script) r.note = `${script.length} characters`;
    return r;
  });
  await step("tts", "POST /api/tts (briefing script)", async () => {
    if (!script) return { skipped: "no briefing script" };
    const r = await call("POST", "/api/tts", { text: script.slice(0, 2500) }, { binary: true });
    r.note = `${r.headers.get("x-keystone-replay") ?? "?"}, ${Math.round(r.bytes / 1024)} KB`;
    return r;
  });
  await step("tts", "POST /api/tts (launch voiceover)", async () => {
    const text = voiceover();
    if (!text) return { skipped: "VOICEOVER not found in components/launch/data.ts" };
    const r = await call("POST", "/api/tts", { text }, { binary: true });
    r.note = `${r.headers.get("x-keystone-replay") ?? "?"}, ${Math.round(r.bytes / 1024)} KB`;
    return r;
  });

  await step("syllabus", "POST /api/syllabus/extract", async () => {
    const r = await call("POST", "/api/syllabus/extract", { url: SYLLABUS_URL });
    const d = r.json?.data;
    if (d) r.note = `${d.modules?.length ?? 0} course units, source ${d.source}`;
    return r;
  });
  await step("onboard", "POST /api/onboard/run (until done)", async () => {
    const r = await call("POST", "/api/onboard/run", { userId: USER });
    const id = r.json?.data?.runId;
    if (!id) return r;
    return waitForRun(id);
  });
  await step("trajectories", `GET /api/trajectories/similar?userId=${USER}`, () => call("GET", `/api/trajectories/similar?userId=${encodeURIComponent(USER)}`));
  await step("guides", "POST /api/guides/find", () => call("POST", "/api/guides/find", { userId: USER }));

  // Other AI-backed screens in the demo.
  await step("extra", "POST /api/roadmap/generate", () => call("POST", "/api/roadmap/generate", { userId: USER, roleId: "ml-engineer" }));
  await step("extra", "POST /api/challenges/generate (docker)", () => call("POST", "/api/challenges/generate", { userId: USER, skillId: "docker" }));
  await step("extra", "GET /api/lecturer/insights", () => call("GET", "/api/lecturer/insights?programmeId=uom-bsc-cs"));
  await step("extra", "GET /api/trends (HN, needs TRENDS_LIVE=true)", () => call("GET", "/api/trends"));

  const labs = labRoutes();
  if (!labs.length) console.log("- no /api/labs routes to record");
  for (const { route, method } of labs) {
    await step("labs", `${method} ${route}`, () =>
      method === "POST" ? call("POST", route, { userId: USER }) : call("GET", `${route}?userId=${encodeURIComponent(USER)}`));
  }

  // ---------- report ----------
  const end = await modeState();
  const total = delta(start, end);
  const pad = (s, n) => String(s).padEnd(n);
  const w = Math.max(...rows.map((r) => r.name.length), 10);
  console.log(`\n${pad("Step", w)}  HTTP  Time    Recorded`);
  console.log(`${"-".repeat(w)}  ----  ------  ${"-".repeat(30)}`);
  for (const r of rows) {
    const rec = Object.entries(r.recorded).map(([ns, n]) => `${ns} +${n}`).join(", ") || (r.status === "skip" ? `skipped: ${r.note}` : "nothing new");
    console.log(`${pad(r.name, w)}  ${pad(r.status, 4)}  ${pad(`${(r.ms / 1000).toFixed(1)}s`, 6)}  ${rec}`);
  }
  const sum = Object.values(total).reduce((a, b) => a + b, 0);
  console.log(`\nNew recordings: ${sum} (${Object.entries(total).map(([ns, n]) => `${ns} ${n}`).join(", ") || "none"}). Total on the server: ${end?.total ?? "?"}.`);
  console.log("They are in data/replay on the server's disk (or /tmp/keystone-replay when that is read-only). Commit data/replay so Demo mode on Vercel replays them.");
  const failed = rows.filter((r) => r.status === "ERR" || (typeof r.status === "number" && r.status >= 500));
  if (failed.length) {
    console.log(`\n${failed.length} step${failed.length === 1 ? "" : "s"} failed: ${failed.map((r) => r.name).join("; ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
