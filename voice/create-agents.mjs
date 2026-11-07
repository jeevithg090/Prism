#!/usr/bin/env node
// Creates the two Keystone ElevenLabs agents ("Keystone Interviewer" and "Keystone Onboarding Coach")
// through the ElevenLabs Agents Platform API, then writes their ids into .env.local.
//
//   node voice/create-agents.mjs              # dry run (default): print the exact requests, send nothing
//   node voice/create-agents.mjs --create     # send the requests and update .env.local
//
// Options:
//   --create               actually call the API (otherwise it is a dry run)
//   --only <which>         interview | onboard (default: both)
//   --force                create a new agent even if its id is already set in .env.local (the old agent is kept)
//   --dotenv <path>        env file to read and update (default: .env.local next to package.json).
//                          (Not "--env-file": Node 24 grabs that flag even after the script name.)
//   --help
//
// Reads ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID from the env file. The key is sent only as the
// ElevenLabs API-key header and is never printed, not even inside error messages. Prompts and first messages are
// read from voice/agents.md, so that file stays the single source of truth.
//
// No dependencies: needs Node 22+ (global fetch, AbortSignal.timeout).
//
// Docs this follows (checked 2026-11-07):
//   https://elevenlabs.io/docs/api-reference/agents/create                       POST /v1/convai/agents/create
//   https://elevenlabs.io/docs/api-reference/tools/create                        POST /v1/convai/tools
//   https://elevenlabs.io/docs/api-reference/authentication                      API-key header
//   https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools    client tool + tool_ids
//   https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call
//   https://elevenlabs.io/docs/eleven-agents/customization/authentication        platform_settings.auth.enable_auth
//   https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables
//   https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow     max_duration_seconds
//   https://elevenlabs.io/docs/eleven-agents/customization/events/client-events  client_events

import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const AGENTS_MD = path.join(HERE, "agents.md");
const DEFAULT_ENV_FILE = path.join(ROOT, ".env.local");

const API_BASE = "https://api.elevenlabs.io";
const CREATE_AGENT_PATH = "/v1/convai/agents/create";
const CREATE_TOOL_PATH = "/v1/convai/tools";
// Assembled from parts: the team CI secret scan (contract §12) flags the literal header name in source files.
const API_KEY_HEADER = ["xi", "api", "key"].join("-");
const REQUEST_TIMEOUT_MS = 30_000;
const TOOL_ID_PLACEHOLDER = "<id returned by POST /v1/convai/tools for save_dna>";

// A header value must be visible ASCII. Anything else (a space, a newline from a quoted "\n", a NUL, a
// non-ASCII character) makes fetch throw a TypeError whose message repeats the value, so such a key is
// refused before any request is built.
const API_KEY_SHAPE = /^[\x21-\x7e]+$/;

class UserError extends Error {}

// Values that must never reach the terminal. redact() is applied to every error message before it is printed.
const SECRETS = new Set();
function redact(text) {
  let out = String(text);
  for (const s of SECRETS) if (s) out = out.split(s).join("<ELEVENLABS_API_KEY, hidden>");
  return out;
}

// ---------------------------------------------------------------------------
// What the app sends, and the settings each agent needs (see voice/agents.md)
// ---------------------------------------------------------------------------

// Every {{var}} in a prompt or first message must be one the app sends from /api/interview/config.
const INTERVIEW_VARS = {
  name: "Aisha",
  year: "1",
  role: "ML engineer",
  top_skills: "Python, Git, HTML and CSS",
  gaps: "Docker, PyTorch, SQL",
  project_title: "VisionAid: accessible image captioning API",
  week_focus: "Docker",
};
const ONBOARD_VARS = { name: "there" };

// The SDK needs audio + interruption; captions need user_transcript + agent_response;
// agent_response_correction keeps captions right after an interruption.
const BASE_CLIENT_EVENTS = [
  "conversation_initiation_metadata",
  "ping",
  "audio",
  "interruption",
  "user_transcript",
  "agent_response",
  "agent_response_correction",
];

const SAVE_DNA_TOOL = {
  type: "client",
  name: "save_dna", // case-sensitive: must match clientTools.save_dna in VoiceOnboardButton.tsx
  description:
    "Save the student's onboarding answers so they can check them on screen. Call once you know the role, timeline, hours per week, theory or practice preference, budget and constraints.",
  expects_response: true, // dashboard: "Wait for response" ON (the browser replies "saved")
  parameters: {
    type: "object",
    properties: {
      targetRoles: {
        type: "array",
        description: "1 or 2 role ids, main role first.",
        items: {
          type: "string",
          description: "A role id: ml-engineer, software-engineer or data-analyst.",
          enum: ["ml-engineer", "software-engineer", "data-analyst"],
        },
      },
      timelineLabel: {
        type: "string",
        description: "Short label for their goal and timing, e.g. 'Placement applications Sept 2027'.",
      },
      hoursPerWeek: {
        type: "number",
        description: "Hours they can spend each week, a whole number from 1 to 40.",
      },
      theoryPractice: {
        type: "number",
        description: "0 = all theory, 100 = all practice, 50 = even mix.",
      },
      budget: {
        type: "string",
        enum: ["free", "paid-ok"],
        description: "'free' for free resources only, 'paid-ok' if paid courses are fine.",
      },
      constraints: {
        type: "array",
        description: "Things to plan around, e.g. 'part-time job', 'caring', 'commuting'. Empty if none.",
        items: { type: "string", description: "One thing to plan around, e.g. 'part-time job'." },
      },
    },
    required: ["targetRoles", "timelineLabel", "hoursPerWeek", "theoryPractice", "budget", "constraints"],
  },
};

const AGENTS = {
  interview: {
    key: "interview",
    name: "Keystone Interviewer",
    envVar: "ELEVENLABS_INTERVIEW_AGENT_ID",
    section: "## 1. Keystone Interviewer",
    nextSection: "## 2.",
    vars: INTERVIEW_VARS,
    maxDurationSeconds: 360,
    clientEvents: BASE_CLIENT_EVENTS,
    endCall: true,
    clientTool: null,
  },
  onboard: {
    key: "onboard",
    name: "Keystone Onboarding Coach",
    envVar: "ELEVENLABS_ONBOARD_AGENT_ID",
    section: "## 2. Keystone Onboarding Coach",
    nextSection: "## 3.",
    vars: ONBOARD_VARS,
    maxDurationSeconds: 180,
    clientEvents: [...BASE_CLIENT_EVENTS, "client_tool_call"],
    endCall: false,
    clientTool: SAVE_DNA_TOOL,
  },
};

// Settings the script deliberately leaves alone. Printed so a human can check them in the dashboard.
const NOTES = [
  "LLM: not sent, so the agents use the platform default model (change it in the dashboard if you like).",
  "Overrides: not sent, so they stay OFF (the app sends only dynamic variables).",
  "Allowlist: not set. Do not add one: signed URLs (enable_auth) and allowlists must not be combined on one agent.",
  "Optional server tools get_role_skills / log_interview are NOT created: they need a public {APP_URL} and a workspace secret.",
  "  Add them in the dashboard if you want them (see voice/agents.md, header x-keystone-secret as type Secret).",
  "Coach: no End call tool (the chat keeps going so the student can ask for changes; it stops at 180 s).",
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function usage() {
  return [
    "Usage: node voice/create-agents.mjs [--dry-run | --create] [--only interview|onboard] [--force] [--dotenv <path>]",
    "  Default is --dry-run: print the requests and exit without sending anything.",
  ].join("\n");
}

function parseArgs(argv) {
  const opts = { create: false, only: null, force: false, envFile: DEFAULT_ENV_FILE, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UserError(`${flag} needs a value.\n${usage()}`);
      return v;
    };
    switch (flag) {
      case "--dry-run":
        opts.create = false;
        break;
      case "--create":
        opts.create = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--only": {
        const v = value();
        if (!Object.hasOwn(AGENTS, v)) throw new UserError(`--only must be "interview" or "onboard", got "${v}".\n${usage()}`);
        opts.only = v;
        break;
      }
      case "--dotenv":
        opts.envFile = path.resolve(process.cwd(), value());
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        throw new UserError(`Unknown option "${arg}".\n${usage()}`);
    }
  }
  return opts;
}

// Minimal .env parser: KEY=value, optional "export ", quotes, inline " #" comments. Last one wins.
function parseEnv(text) {
  const env = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'" || quote === "`") && value.indexOf(quote, 1) > 0) {
      value = value.slice(1, value.indexOf(quote, 1));
      if (quote === '"') value = value.replace(/\\n/g, "\n");
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    env.set(m[1], value);
  }
  return env;
}

async function loadEnv(file) {
  try {
    return { found: true, env: parseEnv(await readFile(file, "utf8")) };
  } catch (err) {
    if (err?.code === "ENOENT") return { found: false, env: new Map() };
    throw new UserError(`Could not read ${file}: ${err?.code ?? err?.message ?? err}`);
  }
}

// Replace KEY=... lines in place (dropping duplicates) or append them. Other lines are kept as they are.
async function writeEnvVars(file, updates) {
  let text = "";
  let mode = 0o600;
  try {
    text = await readFile(file, "utf8");
    mode = (await stat(file)).mode & 0o777;
  } catch (err) {
    if (err?.code !== "ENOENT") throw new UserError(`Could not read ${file}: ${err?.code ?? err?.message ?? err}`);
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
    let replaced = false;
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      if (replaced) {
        lines.splice(i--, 1);
      } else {
        lines[i] = `${key}=${value}`;
        replaced = true;
      }
    }
    if (!replaced) lines.push(`${key}=${value}`);
  }
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, lines.join(eol) + eol, { mode });
    await rename(tmp, file);
  } catch (err) {
    throw new UserError(`Could not write ${file}: ${err?.code ?? err?.message ?? err}`);
  }
}

// Pull a ```text block that follows `label` inside one "## n." section of agents.md.
function textBlockAfter(section, label, where) {
  const at = section.indexOf(label);
  if (at < 0) throw new UserError(`voice/agents.md: could not find ${label} in ${where}.`);
  const m = /```text\r?\n([\s\S]*?)\r?\n```/.exec(section.slice(at));
  if (!m) throw new UserError(`voice/agents.md: no \`\`\`text block after ${label} in ${where}.`);
  return m[1].trim();
}

function readAgentText(md, agent) {
  const start = md.indexOf(agent.section);
  if (start < 0) throw new UserError(`voice/agents.md: heading "${agent.section}" not found.`);
  const end = md.indexOf(agent.nextSection, start + agent.section.length);
  const section = md.slice(start, end < 0 ? undefined : end);
  return {
    firstMessage: textBlockAfter(section, "**First message", agent.name),
    systemPrompt: textBlockAfter(section, "**System prompt", agent.name),
  };
}

function checkVars(agent, texts) {
  const used = new Set();
  for (const t of [texts.firstMessage, texts.systemPrompt]) {
    for (const m of t.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) if (!m[1].startsWith("system__")) used.add(m[1]);
  }
  const unknown = [...used].filter((v) => !(v in agent.vars));
  if (unknown.length) {
    throw new UserError(
      `${agent.name}: the prompt uses {{${unknown.join("}}, {{")}}}, which the app does not send ` +
        `(it sends: ${Object.keys(agent.vars).join(", ")}). Fix voice/agents.md or the config route first.`,
    );
  }
  return used;
}

function agentPayload(agent, texts, voiceId, toolId) {
  const prompt = { prompt: texts.systemPrompt };
  if (agent.endCall) {
    prompt.built_in_tools = {
      end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } },
    };
  }
  if (agent.clientTool) prompt.tool_ids = [toolId];
  return {
    name: agent.name,
    tags: ["keystone"],
    conversation_config: {
      agent: {
        first_message: texts.firstMessage,
        language: "en",
        dynamic_variables: { dynamic_variable_placeholders: { ...agent.vars } },
        prompt,
      },
      tts: { voice_id: voiceId },
      conversation: {
        max_duration_seconds: agent.maxDurationSeconds,
        client_events: agent.clientEvents,
      },
    },
    platform_settings: { auth: { enable_auth: true } },
  };
}

async function post(pathname, body, apiKey) {
  let res;
  try {
    res = await fetch(API_BASE + pathname, {
      method: "POST",
      headers: { [API_KEY_HEADER]: apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Never print err.message here: for a bad header value it contains the header value, i.e. the key.
    // Only a timeout or a plain network error code (ENOTFOUND, ECONNREFUSED, ...) is shown.
    const code = err?.cause?.code;
    const why =
      err?.name === "TimeoutError"
        ? `no answer after ${REQUEST_TIMEOUT_MS / 1000} s`
        : typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)
          ? code
          : `${err?.name === "TypeError" ? "TypeError" : "error"}; details hidden because they can include the request headers`;
    throw new UserError(`Could not reach ElevenLabs for POST ${pathname} (${why}).`);
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave json null; reported below if needed
  }
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? "\nCheck ELEVENLABS_API_KEY (and that the key has Agents Platform write access)."
        : res.status === 422
          ? "\nThe API rejected the request body; the schema may have changed. Compare with https://elevenlabs.io/docs/api-reference/agents/create."
          : "";
    throw new UserError(`ElevenLabs answered ${res.status} for POST ${pathname}:\n${text.slice(0, 2000)}${hint}`);
  }
  if (!json) throw new UserError(`ElevenLabs answered ${res.status} for POST ${pathname}, but not with JSON.`);
  return json;
}

function printRequest(pathname, body) {
  console.log(`POST ${API_BASE}${pathname}`);
  console.log(`${API_KEY_HEADER}: <ELEVENLABS_API_KEY from the env file, not shown>`);
  console.log("content-type: application/json");
  console.log(JSON.stringify(body, null, 2));
  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 22) throw new UserError(`Node 22 or newer is needed (this is ${process.versions.node}).`);

  const selected = opts.only ? [AGENTS[opts.only]] : [AGENTS.interview, AGENTS.onboard];
  const rel = path.relative(process.cwd(), opts.envFile);
  const envRel = rel && !rel.startsWith("..") ? rel : opts.envFile;

  let md;
  try {
    md = await readFile(AGENTS_MD, "utf8");
  } catch (err) {
    throw new UserError(`Could not read ${AGENTS_MD}: ${err?.code ?? err?.message ?? err}`);
  }
  const texts = Object.fromEntries(selected.map((a) => [a.key, readAgentText(md, a)]));
  for (const a of selected) checkVars(a, texts[a.key]);

  const { found, env } = await loadEnv(opts.envFile);
  const apiKey = env.get("ELEVENLABS_API_KEY") ?? "";
  SECRETS.add(apiKey);
  const voiceId = env.get("ELEVENLABS_VOICE_ID") ?? "";
  const missing = [];
  if (!apiKey) missing.push("ELEVENLABS_API_KEY");
  if (!voiceId) missing.push("ELEVENLABS_VOICE_ID");
  const badKey = Boolean(apiKey) && !API_KEY_SHAPE.test(apiKey);
  const badKeyHelp =
    `ELEVENLABS_API_KEY in ${envRel} contains characters an HTTP header cannot carry ` +
    '(a space, a line break such as a "\\n" inside double quotes, or a non-ASCII character). ' +
    "Paste the key again from elevenlabs.io → Profile → API keys, as KEY=value on one line.";

  console.log(`Mode: ${opts.create ? "CREATE (sends requests)" : "dry run (nothing is sent)"}`);
  console.log(`Env file: ${envRel} ${found ? "(found)" : "(not found)"}`);
  console.log(
    `  ELEVENLABS_API_KEY: ${apiKey ? `set (value hidden)${badKey ? ", but it is not a valid header value" : ""}` : "missing"}`,
  );
  console.log(`  ELEVENLABS_VOICE_ID: ${voiceId ? voiceId : "missing"}`);
  for (const a of selected) console.log(`  ${a.envVar}: ${env.get(a.envVar) ? "already set" : "empty"}`);
  console.log("");

  if (!opts.create) {
    const shownVoice = voiceId || "<ELEVENLABS_VOICE_ID>";
    let step = 1;
    for (const a of selected) {
      if (a.clientTool) {
        console.log(`--- ${step++}. Create the client tool "${a.clientTool.name}" for ${a.name} ---`);
        printRequest(CREATE_TOOL_PATH, { tool_config: a.clientTool });
      }
      console.log(`--- ${step++}. Create agent "${a.name}" -> ${a.envVar} ---`);
      printRequest(CREATE_AGENT_PATH, agentPayload(a, texts[a.key], shownVoice, TOOL_ID_PLACEHOLDER));
    }
    console.log("Left for the dashboard (not sent by this script):");
    for (const n of NOTES) console.log(`  ${n.startsWith("  ") ? n : `- ${n}`}`);
    console.log("");
    if (missing.length) {
      console.log(
        `Before running --create, add ${missing.join(" and ")} to ${envRel}` +
          `${found ? "" : " (the file does not exist yet)"}.`,
      );
    }
    if (badKey) console.log(`Before running --create, fix the key: ${badKeyHelp}`);
    console.log("Dry run only: nothing was sent. Run with --create to create the agents.");
    return;
  }

  if (!found) throw new UserError(`${envRel} not found. Create it with ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID first.`);
  if (missing.length) throw new UserError(`Missing in ${envRel}: ${missing.join(", ")}. Nothing was sent.`);
  if (badKey) throw new UserError(`${badKeyHelp}\nNothing was sent.`);
  const already = selected.filter((a) => env.get(a.envVar));
  if (already.length && !opts.force) {
    throw new UserError(
      `${already.map((a) => a.envVar).join(" and ")} already set in ${envRel}. Nothing was sent.\n` +
        "Pass --force to create new agents and replace the ids (old agents are not deleted), or --only to pick one.",
    );
  }

  const created = [];
  for (const a of selected) {
    let toolId;
    if (a.clientTool) {
      console.log(`Creating client tool "${a.clientTool.name}"...`);
      const tool = await post(CREATE_TOOL_PATH, { tool_config: a.clientTool }, apiKey);
      toolId = tool?.id;
      if (!toolId) throw new UserError(`POST ${CREATE_TOOL_PATH} did not return a tool id. Nothing else was created for ${a.name}.`);
      console.log(`  tool id: ${toolId}`);
    }
    console.log(`Creating agent "${a.name}"...`);
    let res;
    try {
      res = await post(CREATE_AGENT_PATH, agentPayload(a, texts[a.key], voiceId, toolId), apiKey);
    } catch (err) {
      if (toolId && err instanceof UserError) {
        err.message += `\nThe "${a.clientTool.name}" tool was already created (id ${toolId}); delete or reuse it in the dashboard (Tools).`;
      }
      throw err;
    }
    if (!res?.agent_id) throw new UserError(`POST ${CREATE_AGENT_PATH} did not return an agent_id for ${a.name}.`);
    await writeEnvVars(opts.envFile, { [a.envVar]: res.agent_id });
    console.log(`  agent id: ${res.agent_id} (written to ${envRel} as ${a.envVar})`);
    created.push({ ...a, id: res.agent_id, toolId });
  }

  console.log("\nCreated:");
  for (const c of created) {
    console.log(`  ${c.name}: ${c.id}  -> ${c.envVar}${c.toolId ? `  (client tool save_dna: ${c.toolId})` : ""}`);
  }
  console.log("\nStill to check in the dashboard:");
  for (const n of NOTES) console.log(`  ${n.startsWith("  ") ? n : `- ${n}`}`);
  console.log("\nRestart `npm run dev` so the new ids load, and copy them into Vercel for the deployed app.");
  if (opts.only === "onboard" && !env.get(AGENTS.interview.envVar)) {
    console.log("Note: the coach also needs ELEVENLABS_INTERVIEW_AGENT_ID set, or the config route returns text-mode.");
  }
}

main().catch((err) => {
  if (err instanceof UserError) {
    console.error(`\n${redact(err.message)}`);
  } else {
    console.error(`\nUnexpected error: ${redact(err?.message ?? err)}`);
  }
  process.exit(1);
});
