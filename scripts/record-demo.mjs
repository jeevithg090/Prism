#!/usr/bin/env node
// Records Keystone's demo story from a running Live AI server, so Demo mode can replay real results, then
// (--verify) checks that Demo replays every step without a template fallback.
// Every OpenAI, Firecrawl, ElevenLabs, GitHub read (and, with TRENDS_LIVE=true, Hacker News) call the server
// makes in Live mode is saved under data/replay/<ns>/ on the server's disk (lib/replay.ts), or under
// KEYSTONE_REPLAY_DIR when the server sets it. Commit data/replay so the Vercel build ships them.
//
//   npm run record-demo -- --base http://localhost:3002            # record, then verify
//   npm run record-demo -- --base http://localhost:3002 --verify   # only check Demo replays every step
//   npm run record-demo -- --only coach,interview                  # just some phases or steps
//   npm run record-demo -- --no-github                             # skip approvals when the server writes to GitHub
//
// Needs a server with DEMO_MODE=false and the keys set, running this checkout's code. Best: start it without
// GITHUB_TOKEN (GITHUB_TOKEN= npx next dev -p 3002), so "Start our project" and "Review my PR" are side-effect
// free, and with TRENDS_LIVE=true. Each phase starts from the seed state (POST /api/mode {reset:true}), the way a
// fresh server or Vercel instance starts, so the recorded prompts match what Demo sends on stage.
// Runs under tsx (npm run record-demo) so it can build the interview transcript with lib/voice/questions.ts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRACTICE_QUESTION_COUNT, estimateDurationSec, formatTranscript, practiceQuestions, sampleAnswers } from "../lib/voice/questions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { github: true, record: true, verify: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i];
    else if (a === "--user") out.user = argv[++i];
    else if (a === "--only") out.only = new Set(String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--no-github") out.github = false;
    else if (a === "--verify") { out.record = false; out.verify = true; }
    else if (a === "--no-verify") out.verify = false;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: npm run record-demo -- [--base http://localhost:3002] [--user aisha] [--verify | --no-verify] [--no-github] [--only coach,pods,…]");
  process.exit(0);
}
const BASE = String(args.base ?? process.env.KEYSTONE_BASE ?? "http://localhost:3002").replace(/\/$/, "");
const USER = args.user ?? "aisha";
const ROLE = "ml-engineer";
/** The wizard's programme URL (components/onboarding/draft.ts UOM_CS_URL): the onboarding a judge runs. */
const UOM_CS_URL = "https://www.manchester.ac.uk/study/undergraduate/courses/2026/00560/bsc-computer-science/";

// The Coach panel's starter chips (components/coach/CoachPanel.tsx STARTER_PROMPTS) and the follow-up chips the
// coach suggests (lib/agents/coach/planner.ts suggestionsFor), in the order the stage demo clicks them.
const STARTERS = ["What should I do this week?", "Why Docker?", "Find me a pod", "Who's been where I want to go?"];
const COACH_STORY = [
  "What should I do this week?", "Why Docker?", "Find me a pod", "Start our project", "Review my PR",
  "I merged my issue", "How's my momentum?", "Who's been where I want to go?", "Find professionals to learn from",
];
const STANDALONE = [...STARTERS, "Start our project", "Review my PR", "How's my momentum?", "Find professionals to learn from"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runId = () => `run_${Math.random().toString(36).slice(2, 12).padEnd(10, "0")}`;

// Recording uses the dev-only "fill" Demo (ks_replay=fill): calls whose exact recording exists replay it, every
// other call goes to the live service and is recorded. So a chain (a Coach conversation, a pod explanation fed
// into the next coach step) is recorded on top of the very answers Demo replays, and every later key matches.
// Verifying uses the strict Demo (ks_replay=strict): nothing is called live, so any gap shows as a template.
let MODE = "live"; // "live" while recording (fill), "demo" (strict) while verifying
const cookie = () => `ks_mode=demo; ks_replay=${MODE === "live" ? "fill" : "strict"}; ks_uid=${encodeURIComponent(USER)}`;

async function call(method, route, body, { timeoutMs = 240_000, binary = false } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${route}`, {
      method,
      headers: { cookie: cookie(), accept: binary ? "audio/mpeg" : "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
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

// ---------- steps ----------

const rows = [];
let server = null; // GET /api/mode at the start
let canReset = true;

const selected = (group, name) => !args.only || args.only.has(group) || args.only.has(name);

/** Where a response's AI values came from: the envelope's `replay`, else the x-keystone-replay header. */
function provenance(r) {
  const info = r?.json?.replay;
  if (info && typeof info === "object") return { source: info.source, missed: info.missed ?? 0, replayed: info.replayed ?? 0, similar: !!info.similar };
  const h = r?.headers?.get?.("x-keystone-replay");
  return h ? { source: h === "off" ? "n/a" : h, missed: h === "template" ? 1 : 0, replayed: h === "replayed" ? 1 : 0 } : { source: "n/a", missed: 0, replayed: 0 };
}

async function step(group, name, fn) {
  if (!selected(group, name)) return null;
  const before = MODE === "live" ? await modeState() : null;
  process.stdout.write(`- ${name} … `);
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { status: 0, ok: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
  }
  if (r?.skipped) {
    console.log(`skipped (${r.skipped})`);
    rows.push({ mode: MODE, group, name, status: "skip", ms: 0, recorded: {}, note: r.skipped });
    return r;
  }
  const p = r.provenance ?? provenance(r);
  const note = r.error ?? (r.ok ? r.note ?? "" : r.json?.error?.message ?? "");
  if (MODE === "live") {
    const recorded = delta(before, await modeState());
    const n = Object.values(recorded).reduce((a, b) => a + b, 0);
    console.log(`${r.status || "ERR"} in ${(r.ms / 1000).toFixed(1)}s, ${n} new recording${n === 1 ? "" : "s"}${note ? ` (${note})` : ""}`);
    rows.push({ mode: MODE, group, name, status: r.status || "ERR", ms: r.ms, recorded, note, source: p.source });
  } else {
    console.log(`${r.status || "ERR"} in ${(r.ms / 1000).toFixed(1)}s, ${p.source}${p.similar ? " (similar run)" : ""}${note ? ` (${note})` : ""}`);
    rows.push({ mode: MODE, group, name, status: r.status || "ERR", ms: r.ms, recorded: {}, note, source: p.source, missed: p.missed });
  }
  return r;
}

/** Back to the seed state (a fresh server / Vercel instance), between story phases. */
async function reset(label) {
  if (!canReset) return;
  const r = await call("POST", "/api/mode", { mode: MODE, reset: true }, { timeoutMs: 20_000 });
  if (!r.ok || !r.json?.data?.reset) {
    canReset = false;
    console.log(`  (this server can't reset its state: ${r.json?.error?.message ?? r.status}; recording ${label} on top of the earlier phases)`);
  }
}

const coachBody = (message, history, approval) => ({ userId: USER, message, history, ...(approval ? { approval } : {}), runId: runId() });

async function coach(message, history = [], approval) {
  const r = await call("POST", "/api/coach", coachBody(message, history, approval));
  const d = r.json?.data;
  if (d) r.note = `${d.planner} planner${d.pendingApproval ? `, asks to approve ${d.pendingApproval.tool}` : ""}`;
  return r;
}

const approvalOf = (r) => {
  const p = r?.json?.data?.pendingApproval;
  return p ? { tool: p.tool, args: p.args, decision: "approve" } : null;
};

/** Approvals write to GitHub only when the server has a token and an org; --no-github skips them there. */
const approvalsAllowed = () => args.github || !server?.githubWrites;

/** One Coach chat, like CoachPanel: history = the last 10 turns, an approval shown as "Approve: <title>". */
async function coachChat(label, messages) {
  const turns = [];
  const history = () => turns.slice(-10).map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  for (const message of messages) {
    const prior = history();
    const r = await step("coach", `${label}: ${message}`, () => coach(message, prior));
    turns.push({ role: "user", content: message });
    const answer = r?.json?.data?.answer;
    if (!answer) continue;
    turns.push({ role: "assistant", content: answer });
    const approval = approvalOf(r);
    if (!approval) continue;
    if (!approvalsAllowed()) {
      await step("coach", `${label}: approve ${approval.tool}`, async () => ({ skipped: "--no-github and this server writes to GitHub" }));
      continue;
    }
    const title = r.json.data.pendingApproval.title;
    const prior2 = history();
    const a = await step("coach", `${label}: approve ${approval.tool}`, () => coach(message, prior2, approval));
    turns.push({ role: "user", content: `Approve: ${title}` });
    if (a?.json?.data?.answer) turns.push({ role: "assistant", content: a.json.data.answer });
  }
}

/** Polls an agent run until the orchestrator finishes; flags any "not recorded" template fallback in Demo. */
async function waitForRun(id, limitMs = 6 * 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    const r = await call("GET", `/api/agents/stream?runId=${encodeURIComponent(id)}&poll=1`, undefined, { timeoutMs: 20_000 });
    const events = Array.isArray(r.json?.data) ? r.json.data : [];
    const end = events.find((e) => e.agent === "orchestrator" && (e.status === "done" || e.status === "error"));
    if (end) {
      const misses = events.filter((e) => e.data?.missed || /not recorded/i.test(e.message ?? "")).length;
      const replays = events.filter((e) => e.data?.replay === true).length;
      const source = MODE === "demo" ? (misses ? (replays ? "mixed" : "template") : replays ? "replayed" : "n/a") : "live";
      return {
        status: end.status === "done" ? 200 : 500, ok: end.status === "done", ms: Date.now() - t0,
        note: `${events.length} agent events, ${end.status}${misses ? `, ${misses} not recorded` : ""}`,
        provenance: { source, missed: misses, replayed: replays },
      };
    }
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

async function briefingAndVoice(label) {
  let script = null;
  await step("briefing", `briefing (${label})`, async () => {
    const r = await call("GET", `/api/briefing/${encodeURIComponent(USER)}`);
    script = r.json?.data?.script ?? null;
    if (script) r.note = `${script.length} characters`;
    return r;
  });
  await step("tts", `voice for the briefing (${label})`, async () => {
    if (!script) return { skipped: "no briefing script" };
    const r = await call("POST", "/api/tts", { text: script.slice(0, 2500) }, { binary: true });
    r.note = `${r.headers.get("x-keystone-replay") ?? "?"}, ${Math.round(r.bytes / 1024)} KB`;
    return r;
  });
}

/** Practice mode with "Use sample answer" on every question, exactly as components/voice/InterviewFlow.tsx sends it. */
async function interview(label) {
  await step("interview", `interview feedback (${label})`, async () => {
    const cfg = await call("GET", `/api/interview/config?userId=${encodeURIComponent(USER)}&roleId=${ROLE}`);
    const vars = cfg.json?.data?.dynamicVariables;
    if (!vars) return cfg;
    const questions = practiceQuestions(vars);
    const samples = sampleAnswers(vars);
    const turns = [];
    for (let i = 0; i < PRACTICE_QUESTION_COUNT; i++) {
      turns.push({ speaker: "ai", text: questions[i] });
      if (samples[i]?.trim()) turns.push({ speaker: "user", text: samples[i].trim() });
    }
    const r = await call("POST", "/api/interview/feedback", {
      userId: USER, roleId: ROLE, transcript: formatTranscript(turns), durationSec: estimateDurationSec(turns),
      ...(vars.pr_skill_id ? { skillId: vars.pr_skill_id } : {}),
    });
    const d = r.json?.data;
    if (d) r.note = `scored by ${d.feedback?.scoredBy ?? d.scoredBy ?? "?"}, PR ${vars.pr_status}`;
    return r;
  });
}

// ---------- the story, phase by phase (each from the seed state) ----------

async function story() {
  // 1. A fresh instance: the dashboard briefing, the launch voiceover, and the interview before any pod work.
  await reset("the fresh phase");
  await briefingAndVoice("fresh");
  await step("tts", "launch voiceover", async () => {
    const text = voiceover();
    if (!text) return { skipped: "VOICEOVER not found in components/launch/data.ts" };
    const r = await call("POST", "/api/tts", { text }, { binary: true });
    r.note = `${r.headers.get("x-keystone-replay") ?? "?"}, ${Math.round(r.bytes / 1024)} KB`;
    return r;
  });
  await interview("fresh");

  // 2. Each Coach question in a new chat on a fresh instance (what a judge clicking one chip gets).
  for (const message of STANDALONE) {
    if (!selected("coach", `coach (new chat): ${message}`)) continue;
    await reset(`"${message}"`);
    await coachChat("coach (new chat)", [message]);
  }

  // 3. The stage conversation, in order, in one chat.
  await reset("the coach conversation");
  await coachChat("coach (conversation)", COACH_STORY);

  // 4. The Pods page: Find my pod → Start our project → Review my PR now → Mark as merged → interview, briefing.
  await reset("the pods flow");
  let pod = null;
  await step("pods", "find my pod", async () => {
    const r = await call("POST", "/api/pods/match", { userId: USER });
    pod = r.json?.data ?? null;
    if (pod?.id) r.note = `pod ${pod.id}`;
    return r;
  });
  await briefingAndVoice("after the pod");
  let project = null;
  await step("pods", "start our project", async () => {
    if (!pod?.id) return { skipped: "no pod" };
    if (!approvalsAllowed()) return { skipped: "--no-github and this server writes to GitHub" };
    const r = await call("POST", "/api/projects/create", { podId: pod.id });
    project = r.json?.data ?? null;
    if (project?.title) r.note = `"${project.title}", ${project.issues?.length ?? 0} issues`;
    return r;
  });
  await step("review", "review my PR now", async () => {
    if (!approvalsAllowed()) return { skipped: "--no-github and this server writes to GitHub" };
    return call("POST", "/api/projects/review", { podId: pod?.id ?? "pod_demo01" });
  });
  await step("pods", "mark my issue as merged", async () => {
    const issues = project?.issues ?? pod?.project?.issues ?? [];
    const issueIndex = issues.findIndex((i) => i.assigneeUserId === USER);
    if (!pod?.id || issueIndex < 0) return { skipped: "no issue assigned to this user" };
    return call("POST", "/api/projects/merge", { podId: pod.id, issueIndex });
  });
  await interview("after the merge");
  await briefingAndVoice("after the merge");

  // 5. The other AI screens, from a fresh instance.
  await reset("the other screens");
  await step("screens", `similar trajectories`, () => call("GET", `/api/trajectories/similar?userId=${encodeURIComponent(USER)}`));
  await step("screens", "find guides", () => call("POST", "/api/guides/find", { userId: USER }));
  await step("screens", "lecturer insights", () => call("GET", "/api/lecturer/insights?programmeId=uom-bsc-cs"));
  await step("screens", "trends (Hacker News needs TRENDS_LIVE=true)", () => call("GET", "/api/trends"));
  await step("screens", `market (${ROLE})`, () => call("GET", `/api/market/${ROLE}`));
  await step("screens", "micro-challenge (docker)", () => call("POST", "/api/challenges/generate", { userId: USER, skillId: "docker" }));
  await step("screens", "roadmap", () => call("POST", "/api/roadmap/generate", { userId: USER, roleId: ROLE }));

  // 6. Onboarding: the wizard's programme URL (Firecrawl + the model read the real syllabus), then the demo profile.
  await reset("onboarding");
  await step("syllabus", "syllabus extraction (UoM BSc CS)", async () => {
    const r = await call("POST", "/api/syllabus/extract", { url: UOM_CS_URL });
    const d = r.json?.data;
    if (d) r.note = `${d.modules?.length ?? 0} course units, source ${d.source}`;
    return r;
  });
  await step("onboard", "onboarding with the wizard's programme URL", async () => {
    const r = await call("POST", "/api/onboard/run", { userId: USER, programmeUrl: UOM_CS_URL });
    const id = r.json?.data?.runId;
    return id ? waitForRun(id) : r;
  });
  await reset("the demo profile");
  await step("onboard", "onboarding as the demo profile", async () => {
    const r = await call("POST", "/api/onboard/run", { userId: USER });
    const id = r.json?.data?.runId;
    return id ? waitForRun(id) : r;
  });
  await reset("the end");
}

// ---------- report ----------

function report(mode) {
  const mine = rows.filter((r) => r.mode === mode);
  const pad = (s, n) => String(s).padEnd(n);
  const w = Math.max(...mine.map((r) => r.name.length), 10);
  console.log(`\n${mode === "live" ? "Recorded (Live AI)" : "Verified (Demo, strict)"}\n${pad("Step", w)}  HTTP  Time    ${mode === "live" ? "Recorded" : "Source"}`);
  console.log(`${"-".repeat(w)}  ----  ------  ${"-".repeat(30)}`);
  for (const r of mine) {
    const col = r.status === "skip" ? `skipped: ${r.note}` : mode === "live"
      ? Object.entries(r.recorded).map(([ns, n]) => `${ns} +${n}`).join(", ") || "nothing new"
      : r.source;
    console.log(`${pad(r.name, w)}  ${pad(r.status, 4)}  ${pad(`${(r.ms / 1000).toFixed(1)}s`, 6)}  ${col}`);
  }
}

async function main() {
  const start = await modeState();
  if (!start) {
    console.error(`No Keystone with the Demo toggle at ${BASE} (GET /api/mode failed). Start one from this checkout, e.g.\n  DEMO_MODE=false TRENDS_LIVE=true GITHUB_TOKEN= npx next dev -p 3002`);
    process.exit(1);
  }
  server = start;
  if (start.demoModeEnv) {
    console.error(`${BASE} runs with DEMO_MODE=true, so it never calls the AI services and nothing would be recorded. Use a server with DEMO_MODE=false.`);
    process.exit(1);
  }
  let failed = 0;

  if (args.record) {
    MODE = "live";
    const s = await modeState();
    if (!s?.fill) {
      console.error(`${BASE} didn't take the ks_replay=fill cookie (a production server, or code without the recording mode). Record against a dev server from this checkout.`);
      process.exit(1);
    }
    const services = Object.entries(start.services ?? {}).map(([k, v]) => `${k} ${v ? "on" : "off"}`).join(", ");
    console.log(`Recording the demo story from ${BASE} as ${USER} (live calls for everything not yet recorded). ${start.total ?? 0} recordings before. Services: ${services || "?"}.`);
    if (start.githubWrites) console.log(args.github ? "Heads-up: this server has GITHUB_TOKEN + GITHUB_ORG, so approvals create a real repo and post a real PR comment." : "This server writes to GitHub, so approvals are skipped (--no-github).");
    console.log("");
    await story();
    const end = await modeState();
    report("live");
    const total = delta(start, end);
    const sum = Object.values(total).reduce((a, b) => a + b, 0);
    console.log(`\nNew recordings: ${sum} (${Object.entries(total).map(([ns, n]) => `${ns} ${n}`).join(", ") || "none"}). Total on the server: ${end?.total ?? "?"}.`);
    console.log("They are in the server's data/replay (or KEYSTONE_REPLAY_DIR, or /tmp/keystone-replay when that is read-only). Commit data/replay so Demo mode on Vercel replays them.");
    failed += rows.filter((r) => r.mode === "live" && (r.status === "ERR" || (typeof r.status === "number" && r.status >= 500))).length;
  }

  if (args.verify) {
    MODE = "demo";
    canReset = true;
    const s = await modeState();
    if (!s?.strict) {
      console.error(`\n${BASE} didn't take the ks_replay=strict cookie (production server?). Verify against a dev server, or one with KEYSTONE_REPLAY_STRICT=true.`);
      process.exit(1);
    }
    console.log(`\nVerifying Demo (strict: nothing is called live) against ${s.total ?? 0} recordings…\n`);
    await story();
    report("demo");
    const bad = rows.filter((r) => r.mode === "demo" && r.status !== "skip" && (r.source === "template" || r.source === "mixed" || r.source === "live" || r.status === "ERR" || (typeof r.status === "number" && r.status >= 500)));
    if (bad.length) {
      console.log(`\n${bad.length} step${bad.length === 1 ? "" : "s"} would not replay in Demo: ${bad.map((r) => `${r.name} (${r.source})`).join("; ")}`);
      failed += bad.length;
    } else {
      console.log("\nEvery step replays from a recorded real run in Demo.");
    }
  }

  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
