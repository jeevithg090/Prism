import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; embeddings = { create: vi.fn() }; } }));
const emit = vi.fn();
vi.mock("@/lib/agents/events", () => ({ emit }));

import {
  canonicalJSON, defaultRunMode, fillFromCookieHeader, hasRecording, listRecordings, looseReplayKey, modeFromCookieHeader, normaliseVolatile, replayKey,
  replayOrRecord, replayOrRecordBinary, replayStats, strictFromCookieHeader, withReplayInfo, withReplayTrace,
} from "./replay";
import { replayInfoOf, replayNoteText } from "./replay-info";

let bundle: string;
let tmp: string;

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ks-replay-test-"));
  bundle = path.join(root, "bundle");
  tmp = path.join(root, "tmp");
  vi.stubEnv("KEYSTONE_REPLAY_DIR", bundle);
  vi.stubEnv("KEYSTONE_REPLAY_TMP", tmp);
  vi.stubEnv("KEYSTONE_DEFAULT_MODE", "live");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("FIRECRAWL_API_KEY", "");
  create.mockReset();
  emit.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const files = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

describe("replay keys", () => {
  it("ignore ISO timestamps, run ids, dates, times, random ids and durations", () => {
    const a = { user: "Run run_a1B2c3D4e5 at 2026-11-07T14:02:11.123Z (week of 2026-11-02, 7 Nov 2026, 14:02). Pod pod_x8Kd02Q. {\"durationMs\":812}", n: 3 };
    const b = { n: 3, user: "Run run_Zz9Yy8Xx7w at 2026-12-01T09:15:00Z (week of 2026-11-30, 1 Dec 2026, 09:15). Pod pod_Q7mm3Pz. {\"durationMs\":40}" };
    expect(replayKey(a)).toBe(replayKey(b));
    expect(replayKey(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(replayKey({ user: "Why Docker?" })).not.toBe(replayKey({ user: "Find me a pod" }));
  });

  it("keep words that only look like ids (tool names) and sort object keys", () => {
    expect(normaliseVolatile("Action: start_pod_project then review_my_pr")).toBe("Action: start_pod_project then review_my_pr");
    expect(canonicalJSON({ b: 1, a: [2, "x"] })).toBe('{"a":[2,"x"],"b":1}');
  });

  it("normalise long prefixed ids, challenge ids, short weekdays and epoch seconds; trailing spaces don't matter loosely", () => {
    expect(normaliseVolatile("att_aisha_ch_docker_aisha_mh3k2j1x_abcdefghijklmnopqrstuvwxyz0123")).toBe("att_<id>");
    expect(normaliseVolatile("challenge ch_docker_aisha_mhabcdef done")).toBe("challenge ch_<id> done");
    expect(normaliseVolatile("Sat 8 Nov, due Mon")).toBe("<day> <date>, due <day>");
    expect(normaliseVolatile("at 1762524000 seconds")).toBe("at <epoch> seconds");
    expect(normaliseVolatile("help_V1StGXR8_Z5jdHi6B-")).toBe("help_<id>");
    expect(looseReplayKey({ user: "Why Docker? " })).toBe(looseReplayKey({ user: "why docker?" }));
  });

  it("the loose key ignores numbers, case and whitespace; the exact key does not", () => {
    expect(replayKey({ user: "You are 38% ready" })).not.toBe(replayKey({ user: "You are 41% ready" }));
    expect(looseReplayKey({ user: "You are 38% ready" })).toBe(looseReplayKey({ user: "you are  41% Ready" }));
  });

  it("reads the mode from a cookie header, else the default", () => {
    expect(modeFromCookieHeader("ks_uid=aisha; ks_mode=demo")).toBe("demo");
    expect(modeFromCookieHeader("ks_mode=live")).toBe("live");
    expect(modeFromCookieHeader("ks_mode=nope")).toBe("live"); // KEYSTONE_DEFAULT_MODE in this test
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "");
    expect(modeFromCookieHeader(null)).toBe("demo"); // no OpenAI key
  });
});

describe("replayOrRecord", () => {
  it("live mode calls fn and records {key, ns, recordedAt, meta, value}", async () => {
    const fn = vi.fn(async () => ({ answer: "Learn Docker" }));
    const out = await replayOrRecord("llm", { user: "Why Docker?" }, fn, { meta: { agent: "orchestrator", schemaName: "coach_step", model: "gpt-4.1-mini" } });
    expect(out).toEqual({ answer: "Learn Docker" });
    expect(fn).toHaveBeenCalledTimes(1);
    const key = replayKey({ user: "Why Docker?" });
    const rec = JSON.parse(fs.readFileSync(path.join(bundle, "llm", `${key}.json`), "utf8"));
    expect(rec).toMatchObject({ key, ns: "llm", meta: { agent: "orchestrator", schemaName: "coach_step", model: "gpt-4.1-mini" }, value: { answer: "Learn Docker" } });
    expect(Date.parse(rec.recordedAt)).not.toBeNaN();
  });

  it("live mode keeps the first recording of a key unless KEYSTONE_REPLAY_OVERWRITE=true", async () => {
    await replayOrRecord("llm", { user: "same" }, async () => "first");
    await expect(replayOrRecord("llm", { user: "same" }, async () => "second")).resolves.toBe("second");
    const file = path.join(bundle, "llm", `${replayKey({ user: "same" })}.json`);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).value).toBe("first");
    vi.stubEnv("KEYSTONE_REPLAY_OVERWRITE", "true");
    await replayOrRecord("llm", { user: "same" }, async () => "third");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).value).toBe("third");
  });

  it("demo mode returns the recorded value without calling fn, even for a later run id and timestamp", async () => {
    await replayOrRecord("llm", { user: "plan for run_aaaaaaa1 at 2026-11-07T10:00:00Z" }, async () => "the real answer");
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    const fn = vi.fn(async () => "a different answer");
    const traced = await withReplayTrace(() => replayOrRecord("llm", { user: "plan for run_bbbbbbb2 at 2026-11-08T16:30:00Z" }, fn));
    expect(traced.value).toBe("the real answer");
    expect(traced.replayed).toBe(true);
    expect(traced.events[0]).toMatchObject({ ns: "llm", kind: "replayed" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("a demo miss without the key throws not_recorded so the caller's fallback runs", async () => {
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    const fn = vi.fn(async () => ["x"]);
    await expect(replayOrRecord("firecrawl", { op: "search", query: "never recorded" }, fn, { requires: ["FIRECRAWL_API_KEY"] })).rejects.toThrow("not_recorded");
    expect(fn).not.toHaveBeenCalled();
  });

  it("a demo miss with the key calls live and records it", async () => {
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    const fn = vi.fn(async () => [{ url: "https://example.com", title: "Example" }]);
    await expect(replayOrRecord("firecrawl", { op: "search", query: "q" }, fn, { requires: ["FIRECRAWL_API_KEY"] })).resolves.toHaveLength(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(hasRecording("firecrawl", { op: "search", query: "q" })).toBe(true);
  });

  it("replays through the loose key only when allowed, and never replays a value the caller rejects", async () => {
    await replayOrRecord("llm", { user: "You are 38% ready" }, async () => "recorded at 38%");
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    await expect(replayOrRecord("llm", { user: "You are 41% ready" }, async () => "live")).resolves.toBe("recorded at 38%");
    const offline = { requires: ["OPENAI_API_KEY"] }; // unset here, so a miss can't call live
    await expect(replayOrRecord("llm", { user: "You are 41% ready" }, async () => "live", { ...offline, loose: false })).rejects.toThrow("not_recorded");
    await expect(replayOrRecord("llm", { user: "You are 38% ready" }, async () => "live", { ...offline, validate: () => false })).rejects.toThrow("not_recorded");
  });

  it("strict Demo (KEYSTONE_REPLAY_STRICT) never calls live, even with the key, and reports the miss", async () => {
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    vi.stubEnv("KEYSTONE_REPLAY_STRICT", "true");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    const fn = vi.fn(async () => ["live"]);
    const onMiss = vi.fn();
    const traced = withReplayTrace(() => replayOrRecord("firecrawl", { op: "search", query: "strict" }, fn, { requires: ["FIRECRAWL_API_KEY"], onMiss }));
    await expect(traced).rejects.toThrow("not_recorded");
    expect(fn).not.toHaveBeenCalled();
    expect(onMiss).toHaveBeenCalledWith(false);
    expect(strictFromCookieHeader(null)).toBe(true);
  });

  it("the dev-only ks_replay=strict / ks_replay=fill cookies only count outside production", () => {
    expect(strictFromCookieHeader("ks_mode=demo; ks_replay=strict")).toBe(true);
    expect(strictFromCookieHeader("ks_mode=demo")).toBe(false);
    expect(fillFromCookieHeader("ks_mode=demo; ks_replay=fill; ks_uid=aisha")).toBe(true);
    expect(fillFromCookieHeader("ks_mode=demo; ks_replay=strict")).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(strictFromCookieHeader("ks_mode=demo; ks_replay=strict")).toBe(false);
    expect(fillFromCookieHeader("ks_mode=demo; ks_replay=fill")).toBe(false);
  });

  it("an alt key replays the same question recorded in another app state, only in Demo and only as a last resort", async () => {
    await replayOrRecord("llm", { system: "pod: none", user: "Find me a pod" }, async () => "recorded before the pod", { alt: { user: "Find me a pod" } });
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    const offline = { requires: ["OPENAI_API_KEY"] };
    const traced = await withReplayTrace(() =>
      replayOrRecord("llm", { system: "pod: Pod Orbit, 2 merged", user: "Find me a pod" }, async () => "live", { ...offline, alt: { user: "Find me a pod" } }));
    expect(traced.value).toBe("recorded before the pod");
    expect(traced.events[0]).toMatchObject({ kind: "replayed", match: "alt" });
    await expect(replayOrRecord("llm", { system: "pod: Pod Orbit", user: "Find me a pod" }, async () => "live", offline)).rejects.toThrow("not_recorded");
    await expect(replayOrRecord("llm", { system: "x", user: "Why Docker?" }, async () => "live", { ...offline, alt: { user: "Why Docker?" } })).rejects.toThrow("not_recorded");
  });

  it("withReplayInfo adds where the answer came from to a JSON envelope and the x-keystone-replay header", async () => {
    await replayOrRecord("llm", { user: "Plan my week" }, async () => "real plan", { meta: { model: "gpt-4.1-mini" } });
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    const route = withReplayInfo(async (q: string) => Response.json({ ok: true, data: await replayOrRecord("llm", { user: q }, async () => "live", { requires: ["OPENAI_API_KEY"] }).catch(() => "template") }));
    const hit = await route("Plan my week");
    expect(hit.headers.get("x-keystone-replay")).toBe("replayed");
    const j = await hit.json();
    expect(j).toMatchObject({ ok: true, data: "real plan", replay: { mode: "demo", source: "replayed", replayed: 1, missed: 0, model: "gpt-4.1-mini" } });
    expect(replayNoteText(replayInfoOf(j))).toMatch(/^Replayed from a real run · gpt-4\.1-mini · /);
    const miss = await route("Never recorded");
    expect(miss.headers.get("x-keystone-replay")).toBe("template");
    expect((await miss.json()).replay).toMatchObject({ source: "template", missed: 1 });
    const plain = await withReplayInfo(async () => Response.json({ ok: true, data: 1 }))();
    expect(plain.headers.get("x-keystone-replay")).toBeNull();
  });

  it("defaults to Demo on Vercel unless KEYSTONE_DEFAULT_MODE says otherwise", () => {
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(defaultRunMode()).toBe("live");
    vi.stubEnv("VERCEL", "1");
    expect(defaultRunMode()).toBe("demo");
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "live");
    expect(defaultRunMode()).toBe("live");
  });

  it("skips recording when shouldRecord rejects the value", async () => {
    await replayOrRecord("firecrawl", { op: "search", query: "empty" }, async () => [], { shouldRecord: (v) => v.length > 0 });
    expect(files(path.join(bundle, "firecrawl"))).toEqual([]);
  });

  it("records to /tmp when the bundled folder is read-only", async () => {
    const blocker = path.join(path.dirname(bundle), "a-file");
    fs.writeFileSync(blocker, "not a folder");
    vi.stubEnv("KEYSTONE_REPLAY_DIR", path.join(blocker, "replay")); // mkdir under a file fails like EROFS
    await replayOrRecord("llm", { user: "read-only" }, async () => "ok");
    expect(files(path.join(tmp, "llm"))).toEqual([`${replayKey({ user: "read-only" })}.json`]);
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    await expect(replayOrRecord("llm", { user: "read-only" }, async () => "live")).resolves.toBe("ok");
  });

  it("stores binary values as a file next to the JSON and replays the bytes", async () => {
    const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x44]).buffer;
    await replayOrRecordBinary("tts", { text: "Hello Aisha" }, async () => audio, { ext: "mp3", contentType: "audio/mpeg" });
    const key = replayKey({ text: "Hello Aisha" });
    expect(files(path.join(bundle, "tts")).sort()).toEqual([`${key}.json`, `${key}.mp3`]);
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    const fn = vi.fn(async () => new ArrayBuffer(1));
    const out = await replayOrRecordBinary("tts", { text: "Hello Aisha" }, fn, { ext: "mp3", contentType: "audio/mpeg" });
    expect(new Uint8Array(out)).toEqual(new Uint8Array([0xff, 0xfb, 0x90, 0x44]));
    expect(fn).not.toHaveBeenCalled();
  });

  it("lists recordings and counts them by namespace", async () => {
    await replayOrRecord("llm", { user: "one" }, async () => 1);
    await replayOrRecord("llm", { user: "two" }, async () => 2);
    await replayOrRecord("firecrawl", { url: "https://x.test" }, async () => "# page");
    const all = listRecordings();
    expect(all).toHaveLength(3);
    expect(all.every((r) => r.source === "bundle")).toBe(true);
    const s = replayStats();
    expect(s).toMatchObject({ total: 3, byNamespace: { llm: 2, firecrawl: 1 } });
    expect(s.first && s.last && s.first <= s.last).toBe(true);
  });
});

describe("llm.ts through the replay store", () => {
  const Schema = z.object({ skill: z.string() });
  const reply = (content: string) => ({ choices: [{ message: { content } }] });
  const call = { agent: "roadmap" as const, runId: "run_test01", system: "s", user: "Plan my week", schema: Schema, schemaName: "plan" };

  async function fresh() {
    vi.resetModules();
    (globalThis as { __ksOpenAI?: unknown; __ksLLMCache?: unknown }).__ksOpenAI = undefined;
    (globalThis as { __ksLLMCache?: unknown }).__ksLLMCache = undefined;
    return import("./llm");
  }

  it("records a live answer, then replays it in demo mode without a key and tells the Activity panel", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    let llm = await fresh();
    create.mockResolvedValueOnce(reply('{"skill":"docker"}'));
    await expect(llm.llmJSON(call)).resolves.toEqual({ skill: "docker" });
    expect(create).toHaveBeenCalledTimes(1);

    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    llm = await fresh();
    await expect(llm.llmJSON({ ...call, runId: "run_test02" })).resolves.toEqual({ skill: "docker" });
    expect(create).toHaveBeenCalledTimes(1);
    const msgs = emit.mock.calls.map(([e]) => e as { runId: string; message: string; data?: { replay?: boolean } });
    expect(msgs.find((e) => e.runId === "run_test02")).toMatchObject({ message: expect.stringContaining("replayed from a real run"), data: { replay: true } });
  });

  it("a demo miss without a key still throws no_key, and DEMO_MODE=true never touches the store", async () => {
    vi.stubEnv("KEYSTONE_DEFAULT_MODE", "demo");
    let llm = await fresh();
    await expect(llm.llmText({ agent: "techlead", system: "s", user: "never recorded" })).rejects.toThrow("no_key");
    vi.stubEnv("DEMO_MODE", "true");
    llm = await fresh();
    await expect(llm.llmText({ agent: "techlead", system: "s", user: "never recorded" })).rejects.toThrow("demo_mode");
    expect(files(bundle)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});
