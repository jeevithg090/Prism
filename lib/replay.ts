import "server-only";
// The Demo toggle ("Demo" / "Live AI"). Every real AI and connector call (OpenAI, Firecrawl, ElevenLabs, the
// Hacker News backfill) goes through replayOrRecord():
//  - Live: call the service, then record exactly what it returned: data/replay/<ns>/<key>.json when that folder
//    is writable (the Mac), else /tmp/keystone-replay/<ns>/<key>.json (Vercel's filesystem is read-only).
//    The first recording of a key is kept, so a replayed chain of calls stays consistent.
//  - Demo: return the recording of that same call from a real run (bundled data/replay first, then /tmp).
//    On a miss, call the service live when its key exists (and record it); otherwise throw
//    LLMError("not_recorded") so the caller's existing fallback runs. Demo never invents data.
//    KEYSTONE_REPLAY_STRICT=true (or, outside production, the ks_replay=strict cookie): Demo never calls live.
//  - Every value is reported to the request scope (withReplayInfo) as replayed / recorded / live / miss, so a
//    story route can tell the UI where its answer came from (`replay` in the envelope, x-keystone-replay).
// The key is sha256 of the call's inputs as canonical JSON, with volatile text (ISO timestamps, dates, times,
// run ids, random ids, durations) normalised, so the same question asked later replays the same answer.
// DEMO_MODE=true is separate and unchanged: that instant deterministic path never reaches this module.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { LLMError } from "@/lib/llm-error";
import { REPLAY_HEADER, type ReplayInfo, type ReplayMatch } from "@/lib/replay-info";

export type { ReplayInfo, ReplayMatch };

export type RunMode = "demo" | "live";
export const MODE_COOKIE = "ks_mode";
export const MODE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export const isRunMode = (v: unknown): v is RunMode => v === "demo" || v === "live";

/**
 * KEYSTONE_DEFAULT_MODE ("demo" | "live"), else Demo on Vercel (judges land on the recorded real runs), else
 * Live when an OpenAI key is set, else Demo.
 */
export function defaultRunMode(): RunMode {
  const env = process.env.KEYSTONE_DEFAULT_MODE?.trim();
  if (isRunMode(env)) return env;
  if (process.env.VERCEL === "1") return "demo";
  return process.env.OPENAI_API_KEY?.trim() ? "live" : "demo";
}

export const STRICT_COOKIE = "ks_replay";

/** Demo never calls a service live: KEYSTONE_REPLAY_STRICT=true, or (outside production) the ks_replay=strict cookie. */
export function strictFromEnv(): boolean {
  return process.env.KEYSTONE_REPLAY_STRICT === "true";
}
function strictCookieAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.KEYSTONE_ALLOW_STRICT_COOKIE === "true";
}
/** Strict Demo from a raw Cookie header (route handlers that hold the request). */
export function strictFromCookieHeader(header: string | null | undefined): boolean {
  if (strictFromEnv()) return true;
  return strictCookieAllowed() && /(?:^|;\s*)ks_replay=strict(?:;|$)/.test(header ?? "");
}

/** The mode in a raw Cookie header (for route handlers that hold the request), else the default. */
export function modeFromCookieHeader(header: string | null | undefined): RunMode {
  const m = (header ?? "").match(/(?:^|;\s*)ks_mode=([^;]*)/);
  const v = m?.[1]?.trim();
  return isRunMode(v) ? v : defaultRunMode();
}

// ---------- request scope: a forced mode for this async call tree, and which values were replayed ----------

export type ReplayMeta = { agent?: string; schemaName?: string; model?: string; kind?: string; label?: string };
export type ReplayEvent = {
  ns: string; key: string; mode: RunMode;
  /** replayed from a recording · recorded now · called live (not recorded) · miss: no value, the caller's fallback ran. */
  kind: "replayed" | "recorded" | "live" | "miss";
  /** How a replayed value matched: the exact call, numbers/case ignored (loose), or the same question in another state (alt). */
  match?: ReplayMatch;
  recordedAt?: string; meta?: ReplayMeta;
};
type Scope = { mode?: RunMode; events: ReplayEvent[] };

type G = { __ksReplayALS?: AsyncLocalStorage<Scope>; __ksReplayHeaders?: Map<string, Header | null>; __ksReplayUnwritable?: Set<string> };
const g = globalThis as unknown as G;
const als: AsyncLocalStorage<Scope> = (g.__ksReplayALS ??= new AsyncLocalStorage<Scope>());

/**
 * Runs `fn` and reports which of its AI / connector values were replayed from a real run, recorded now, or
 * called live (so a response or the Activity panel can say "replayed from a real run"). `mode` forces the mode.
 */
export async function withReplayTrace<T>(fn: () => Promise<T>, opts: { mode?: RunMode } = {}): Promise<{ value: T; events: ReplayEvent[]; replayed: boolean }> {
  const scope: Scope = { mode: opts.mode, events: [] };
  const value = await als.run(scope, fn);
  return { value, events: scope.events, replayed: scope.events.some((e) => e.kind === "replayed") };
}

/** Replay events so far in the current withReplayTrace scope ([] outside one). */
export function currentReplayEvents(): ReplayEvent[] {
  return [...(als.getStore()?.events ?? [])];
}

/** The viewer's mode and whether Demo is strict (never calls live), from the scope, cookies and env. */
async function runContext(): Promise<{ mode: RunMode; strict: boolean }> {
  const forced = als.getStore()?.mode;
  let mode: RunMode | undefined = forced;
  let strict = strictFromEnv();
  try {
    const jar = await cookies();
    if (!mode) {
      const v = jar.get(MODE_COOKIE)?.value;
      if (isRunMode(v)) mode = v;
    }
    if (!strict && strictCookieAllowed() && jar.get(STRICT_COOKIE)?.value === "strict") strict = true;
  } catch {
    /* no request scope (tests, scripts, a cache scope): fall back */
  }
  return { mode: mode ?? defaultRunMode(), strict };
}

/** The viewer's mode: a forced scope mode, else the ks_mode cookie, else the default (outside a request too). */
export async function getRunMode(): Promise<RunMode> {
  return (await runContext()).mode;
}

// ---------- keys ----------

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
type Rule = [RegExp, string | ((m: string, ...groups: string[]) => string)];
const VOLATILE: Rule[] = [
  [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, "<ts>"],
  [/\b\d{4}-\d{2}-\d{2}\b/g, "<date>"],
  [new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?(?:,?\\s+\\d{4})?\\b`, "gi"), "<date>"],
  [new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi"), "<date>"],
  [/\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/gi, "<day>"],
  [/\b(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\b/g, "<day>"],
  [/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]m)?\b/gi, "<time>"],
  [/\b1[6-9]\d{11}\b/g, "<epoch>"],
  [/\b1[6-9]\d{8}\b/g, "<epoch>"],
  // Challenge ids end in Date.now().toString(36), which may have no digit: ch_<skill>_<user>_<base36>.
  [/\bch_[a-z0-9-]+_[a-z0-9-]+_[a-z0-9]{6,10}(?![A-Za-z0-9_-])/g, "ch_<id>"],
  [/\brun_[A-Za-z0-9_-]{4,}/g, "run_<id>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
  // Prefixed random ids (pod_x8Kd02, help_V1StGX…): only when the tail has a digit or a capital, so
  // snake_case words such as tool names (start_pod_project) keep the key specific.
  [/\b([a-z]{2,12})_([A-Za-z0-9_-]{6,64})(?![A-Za-z0-9_-])/g, (m, prefix, id) => (/[0-9A-Z]/.test(id) ? `${prefix}_<id>` : m)],
  [/(?<![\w"])("?(?:durationMs|elapsedMs|latencyMs|tookMs|ms|ts|createdAt|updatedAt|startedAt|finishedAt|recordedAt|timestamp)"?\s*[:=]\s*)-?\d+(?:\.\d+)?/g, (_m, field) => `${field}0`],
  [/\b\d+(?:\.\d+)?\s?(?:ms|milliseconds)\b/gi, "<ms>"],
];

/** Volatile text → stable placeholders (timestamps, dates, times, run ids, random ids, durations). */
export function normaliseVolatile(s: string): string {
  let out = s;
  for (const [re, to] of VOLATILE) out = typeof to === "string" ? out.replace(re, to) : out.replace(re, to);
  return out;
}

function canonical(v: unknown): unknown {
  if (typeof v === "string") return normaliseVolatile(v);
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined && typeof x !== "function") out[k] = canonical(x);
    }
    return out;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
  if (typeof v === "boolean") return v;
  return null;
}

/** Canonical JSON of the key parts: sorted object keys, volatile text normalised. */
export function canonicalJSON(parts: unknown): string {
  return JSON.stringify(canonical(parts));
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** sha256 of the canonical, normalised key parts. */
export function replayKey(parts: unknown): string {
  return sha256(canonicalJSON(parts));
}

const looseText = (parts: unknown) =>
  canonicalJSON(parts).toLowerCase().replace(/\d+(?:[.,]\d+)*/g, "#").replace(/\\n/g, " ").replace(/\s+/g, " ").replace(/ +(?=["\]}])/g, "").replace(/(?<=["[{]) +/g, "");

/** A looser key (case, whitespace and every number ignored), used only when the exact key has no recording. */
export function looseReplayKey(parts: unknown): string {
  return sha256(looseText(parts));
}

/**
 * The coarsest key: the caller's `alt` parts (e.g. the coach step without the student-context system prompt),
 * loose. Demo uses it last, so the same question still replays a real answer when the app's state differs.
 */
export function altReplayKey(parts: unknown): string {
  return sha256(`alt:${looseText(parts)}`);
}

// ---------- the store ----------

export type ReplayRecord<T = unknown> = {
  key: string; ns: string; loose?: string; alt?: string; recordedAt: string; meta: ReplayMeta;
  /** Binary values (audio) live in a file next to the JSON: data/replay/tts/<key>.mp3. */
  file?: string; bytes?: number; contentType?: string;
  value: T;
};
type Header = Omit<ReplayRecord, "value">;

const NS_RE = /^[a-z0-9-]{1,32}$/;
const KEY_RE = /^[a-f0-9]{64}$/;
const FILE_RE = /^[a-f0-9]{64}\.[a-z0-9]{2,5}$/;
const HEAD_BYTES = 4096;

/** Unit tests never read or write real recordings unless they point the store at their own folder. */
function enabled(): boolean {
  if (process.env.KEYSTONE_REPLAY === "off") return false;
  if (process.env.VITEST && !process.env.KEYSTONE_REPLAY_DIR) return false;
  return true;
}

/** Recordings that ship with the app (bundled to every server function via outputFileTracingIncludes). */
// turbopackIgnore: data/** already ships via outputFileTracingIncludes, so these dynamic paths needn't be traced.
export const replayDir = () => process.env.KEYSTONE_REPLAY_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "replay");
/** Where recordings go when the bundled folder is read-only (Vercel). */
export const replayTmpDir = () => process.env.KEYSTONE_REPLAY_TMP || "/tmp/keystone-replay";

const headers: Map<string, Header | null> = (g.__ksReplayHeaders ??= new Map());
const unwritable: Set<string> = (g.__ksReplayUnwritable ??= new Set());

function isHeader(h: unknown): h is Header {
  const r = h as Header | null;
  return !!r && typeof r === "object" && typeof r.key === "string" && KEY_RE.test(r.key) && typeof r.ns === "string" && typeof r.recordedAt === "string";
}

function readRecord(file: string): ReplayRecord | null {
  try {
    const rec = JSON.parse(fs.readFileSync(file, "utf8")) as ReplayRecord;
    return isHeader(rec) ? { ...rec, meta: rec.meta ?? {} } : null;
  } catch {
    return null;
  }
}

/** The record without its value, from the first few KB (the value is always written last). */
function readHeader(file: string): Header | null {
  if (headers.has(file)) return headers.get(file) ?? null;
  let h: Header | null = null;
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    const text = buf.subarray(0, n).toString("utf8");
    const at = text.indexOf(',"value":');
    const parsed: unknown = at >= 0 ? JSON.parse(`${text.slice(0, at)}}`) : readRecord(file);
    if (isHeader(parsed)) {
      const { value: _value, ...rest } = parsed as ReplayRecord;
      void _value;
      h = { ...rest, meta: rest.meta ?? {} };
    }
  } catch {
    h = null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* already closed */ }
  }
  headers.set(file, h);
  return h;
}

function atomicWrite(file: string, data: string | Buffer) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

type Codec<T> = {
  /** Writes any sidecar file into nsDir and returns the record fields that describe the value. */
  write: (nsDir: string, key: string, value: T) => Record<string, unknown>;
  /** The value from a record whose JSON sits in nsDir (undefined when it can't be read back). */
  read: (nsDir: string, rec: ReplayRecord) => T | undefined;
  valid: (value: T) => boolean;
};

const jsonCodec = <T>(): Codec<T> => ({
  write: (_dir, _key, value) => ({ value }),
  read: (_dir, rec) => (rec.value === undefined ? undefined : (rec.value as T)),
  valid: () => true,
});

const binaryCodec = (ext: string, contentType: string): Codec<ArrayBuffer> => ({
  write: (dir, key, value) => {
    const file = `${key}.${ext}`;
    const buf = Buffer.from(new Uint8Array(value));
    atomicWrite(path.join(/*turbopackIgnore: true*/ dir, file), buf);
    return { file, bytes: buf.byteLength, contentType, value: null };
  },
  read: (dir, rec) => {
    if (!rec.file || !FILE_RE.test(rec.file)) return undefined;
    try {
      const buf = fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, rec.file));
      return buf.byteLength ? (new Uint8Array(buf).buffer as ArrayBuffer) : undefined;
    } catch {
      return undefined;
    }
  },
  valid: (v) => v.byteLength > 0,
});

function nsFiles(ns: string): string[] {
  const out: string[] = [];
  for (const dir of [replayDir(), replayTmpDir()]) {
    const nsDir = path.join(/*turbopackIgnore: true*/ dir, ns);
    try {
      for (const f of fs.readdirSync(nsDir)) if (f.endsWith(".json") && KEY_RE.test(f.slice(0, -5))) out.push(path.join(/*turbopackIgnore: true*/ nsDir, f));
    } catch {
      /* no recordings there */
    }
  }
  return out;
}

type Hit<T> = ReplayRecord<T> & { match: ReplayMatch };

function lookup<T>(
  ns: string, key: string, loose: string | undefined, alt: string | undefined, codec: Codec<T>, validate?: (v: unknown) => boolean,
): Hit<T> | null {
  const take = (file: string): ReplayRecord<T> | null => {
    const rec = readRecord(file);
    if (!rec || rec.ns !== ns) return null;
    const value = codec.read(path.dirname(file), rec);
    if (value === undefined || !codec.valid(value)) return null;
    if (validate && !validate(value)) return null;
    return { ...rec, value };
  };
  for (const dir of [replayDir(), replayTmpDir()]) {
    const hit = take(path.join(/*turbopackIgnore: true*/ dir, ns, `${key}.json`));
    if (hit) return { ...hit, match: "exact" };
  }
  if (!loose && !alt) return null;
  const headersOf = nsFiles(ns)
    .map((file) => ({ file, h: readHeader(file) }))
    .filter((c): c is { file: string; h: Header } => !!c.h)
    .sort((a, b) => b.h.recordedAt.localeCompare(a.h.recordedAt));
  const tiers: [ReplayMatch, (h: Header) => boolean][] = [];
  if (loose) tiers.push(["loose", (h) => h.loose === loose]);
  if (alt) tiers.push(["alt", (h) => h.alt === alt]);
  for (const [match, ok] of tiers) {
    for (const c of headersOf) {
      if (!ok(c.h)) continue;
      const hit = take(c.file);
      if (hit) return { ...hit, match };
    }
  }
  return null;
}

const exists = (ns: string, key: string) => [replayDir(), replayTmpDir()].some((dir) => fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, ns, `${key}.json`)));

function cleanMeta(meta: ReplayMeta): ReplayMeta {
  const out: ReplayMeta = {};
  for (const k of ["agent", "schemaName", "model", "kind"] as const) if (typeof meta[k] === "string" && meta[k]) out[k] = meta[k]!.slice(0, 80);
  if (meta.label) out.label = normaliseVolatile(meta.label).replace(/\s+/g, " ").trim().slice(0, 160);
  return out;
}

function record<T>(ns: string, key: string, loose: string | undefined, alt: string | undefined, value: T, meta: ReplayMeta, codec: Codec<T>): string | null {
  const recordedAt = new Date().toISOString();
  const dirs = unwritable.has(replayDir()) ? [replayTmpDir()] : [replayDir(), replayTmpDir()];
  for (const dir of dirs) {
    const nsDir = path.join(/*turbopackIgnore: true*/ dir, ns);
    try {
      fs.mkdirSync(nsDir, { recursive: true });
      const fields = codec.write(nsDir, key, value);
      const { value: v, ...rest } = fields;
      // Field order matters: the value goes last so listings can read just the header.
      const rec = { key, ns, ...(loose ? { loose } : {}), ...(alt ? { alt } : {}), recordedAt, meta: cleanMeta(meta), ...rest, value: v ?? null };
      const file = path.join(/*turbopackIgnore: true*/ nsDir, `${key}.json`);
      atomicWrite(file, JSON.stringify(rec));
      headers.delete(file);
      return recordedAt;
    } catch {
      if (dir === replayDir()) unwritable.add(dir); // read-only bundle (Vercel): use /tmp from now on
    }
  }
  return null;
}

export type ReplayOptions<T> = {
  /** Stored with the recording (agent, schemaName, model, a short label) for listings. Never put secrets here. */
  meta?: ReplayMeta;
  /** Env vars the live call needs. A Demo miss calls live only when all are set; otherwise it throws. */
  requires?: string[];
  /** The error a Demo miss throws when it can't call live (default LLMError("not_recorded")). */
  missError?: () => Error;
  /** Also match recordings whose inputs differ only in numbers, case or whitespace (default true). */
  loose?: boolean;
  /**
   * Demo-only last resort: coarser key parts that leave out state-dependent context (e.g. the coach step
   * without its student-context system prompt, or a briefing by user). Stored with every recording.
   */
  alt?: unknown;
  /** A recording is only replayed when this accepts its value (e.g. it still matches the zod schema). */
  validate?: (value: unknown) => boolean;
  /** Live values are recorded only when this accepts them (e.g. skip empty search results). */
  shouldRecord?: (value: T) => boolean;
  /** Called when a value is replayed from a recording (match: exact, loose or alt). */
  onReplay?: (rec: ReplayRecord<T>, match: ReplayMatch) => void;
  /** Called on a Demo miss: `live` is true when the service is called live instead, false when the caller's fallback runs. */
  onMiss?: (live: boolean) => void;
  /** A failing live call is not reported as a miss (the caller has another real path, e.g. the sample PR). */
  quietErrors?: boolean;
};

function note(e: ReplayEvent) {
  als.getStore()?.events.push(e);
}

async function run<T>(ns: string, keyParts: unknown, fn: () => Promise<T>, opts: ReplayOptions<T>, codec: Codec<T>): Promise<T> {
  if (!enabled() || !NS_RE.test(ns)) return fn();
  const { mode, strict } = await runContext();
  const key = replayKey(keyParts);
  const loose = opts.loose === false ? undefined : looseReplayKey(keyParts);
  const alt = opts.alt === undefined ? undefined : altReplayKey({ ns, alt: opts.alt });
  const meta = cleanMeta(opts.meta ?? {});
  if (mode === "demo") {
    const hit = lookup(ns, key, loose, alt, codec, opts.validate);
    if (hit) {
      note({ ns, key, mode, kind: "replayed", match: hit.match, recordedAt: hit.recordedAt, meta: hit.meta });
      try { opts.onReplay?.(hit, hit.match); } catch { /* reporting never breaks the replay */ }
      return hit.value;
    }
    const canLive = !strict && (opts.requires ?? []).every((k) => process.env[k]?.trim());
    try { opts.onMiss?.(canLive); } catch { /* reporting never breaks the call */ }
    if (!canLive) {
      note({ ns, key, mode, kind: "miss", meta });
      throw opts.missError?.() ?? new LLMError("not_recorded");
    }
  }
  let value: T;
  try {
    value = await fn();
  } catch (e) {
    if (!opts.quietErrors) note({ ns, key, mode, kind: "miss", meta }); // the service failed or has no key: the caller's fallback runs
    throw e;
  }
  let recordedAt: string | null = null;
  try {
    // The first recording of a key is kept (KEYSTONE_REPLAY_OVERWRITE=true replaces it): later answers in a
    // replayed chain were recorded from that first answer, so replacing it would break the chain.
    const keep = process.env.KEYSTONE_REPLAY_OVERWRITE !== "true" && exists(ns, key);
    if (!keep && (!opts.shouldRecord || opts.shouldRecord(value))) recordedAt = record(ns, key, loose, alt, value, opts.meta ?? {}, codec);
  } catch {
    recordedAt = null; // recording is best-effort; the live value still goes back
  }
  note({ ns, key, mode, kind: recordedAt ? "recorded" : "live", ...(recordedAt ? { recordedAt } : {}), meta });
  return value;
}

/**
 * Demo: the recorded value of this call from a real run (a miss calls live when the key exists, else throws
 * LLMError("not_recorded")). Live: calls `fn` and records what it returns. JSON-serialisable values only.
 */
export function replayOrRecord<T>(ns: string, keyParts: unknown, fn: () => Promise<T>, opts: ReplayOptions<T> = {}): Promise<T> {
  return run(ns, keyParts, fn, opts, jsonCodec<T>());
}

/** replayOrRecord for binary values (audio): stored as data/replay/<ns>/<key>.<ext> next to the JSON. */
export function replayOrRecordBinary(
  ns: string, keyParts: unknown, fn: () => Promise<ArrayBuffer>,
  opts: ReplayOptions<ArrayBuffer> & { ext: string; contentType: string },
): Promise<ArrayBuffer> {
  return run(ns, keyParts, fn, opts, binaryCodec(opts.ext.replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin", opts.contentType));
}

/** True when the store is on and the viewer is in Demo mode (so a recording may stand in for a missing key). */
export async function canReplay(): Promise<boolean> {
  return enabled() && (await getRunMode()) === "demo";
}

/** True when a recording exists for these key parts (exact, or loose unless `loose: false`). */
export function hasRecording(ns: string, keyParts: unknown, opts: { loose?: boolean } = {}): boolean {
  if (!enabled() || !NS_RE.test(ns)) return false;
  if (exists(ns, replayKey(keyParts))) return true;
  if (opts.loose === false) return false;
  const loose = looseReplayKey(keyParts);
  return nsFiles(ns).some((file) => readHeader(file)?.loose === loose);
}

/** True when the namespace holds any recording at all (e.g. "github": was GitHub part of the recorded run?). */
export function hasAnyRecording(ns: string): boolean {
  return enabled() && NS_RE.test(ns) && nsFiles(ns).length > 0;
}

// ---------- provenance for API responses ----------

/** Summarises a request's replay events for the UI (see lib/replay-info.ts). */
export function replayInfo(events: ReplayEvent[]): ReplayInfo {
  const count = (k: ReplayEvent["kind"]) => events.filter((e) => e.kind === k).length;
  const replayed = count("replayed"), recorded = count("recorded"), live = count("live"), missed = count("miss");
  const mode: RunMode = events.some((e) => e.mode === "demo") ? "demo" : "live";
  const got = replayed + recorded + live;
  const source: ReplayInfo["source"] = missed ? (got ? "mixed" : "template") : replayed ? (recorded + live ? "mixed" : "replayed") : "live";
  const rep = events.filter((e) => e.kind === "replayed");
  const recordedAt = rep.map((e) => e.recordedAt).filter((x): x is string => !!x).sort().at(-1);
  const model = [...rep, ...events].map((e) => e.meta?.model).find((m): m is string => !!m);
  return {
    mode, source, replayed, recorded, live, missed,
    ...(recordedAt ? { recordedAt } : {}),
    ...(model ? { model } : {}),
    ...(rep.some((e) => e.match && e.match !== "exact") ? { similar: true } : {}),
    kinds: [...new Set(events.map((e) => e.ns))],
  };
}

/**
 * Wraps a route handler: its AI / connector values are traced, and a JSON envelope gains
 * `replay: ReplayInfo` (plus the x-keystone-replay header: replayed | live | template | mixed).
 * A response with no traced values is returned unchanged.
 */
export function withReplayInfo<A extends unknown[]>(handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const scope: Scope = { events: [] };
    const res = await als.run(scope, () => handler(...args));
    if (!scope.events.length) return res;
    try {
      const info = replayInfo(scope.events);
      const headers = new Headers(res.headers);
      headers.set(REPLAY_HEADER, info.source);
      if (!(headers.get("content-type") ?? "").includes("application/json")) {
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
      const json = (await res.clone().json()) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json) || !("ok" in json)) {
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
      headers.delete("content-length");
      return new Response(JSON.stringify({ ...(json as Record<string, unknown>), replay: info }), { status: res.status, statusText: res.statusText, headers });
    } catch {
      return res; // provenance is best-effort
    }
  };
}

// ---------- listings for the UI ----------

export type RecordingInfo = { ns: string; key: string; recordedAt: string; meta: ReplayMeta; source: "bundle" | "tmp"; bytes?: number };

/** Every recording (bundled, then /tmp; newest first). Reads only each file's header. */
export function listRecordings(ns?: string): RecordingInfo[] {
  if (!enabled()) return [];
  const out: RecordingInfo[] = [];
  const seen = new Set<string>();
  for (const [source, dir] of [["bundle", replayDir()], ["tmp", replayTmpDir()]] as const) {
    let namespaces: string[];
    try {
      namespaces = ns ? [ns] : fs.readdirSync(/*turbopackIgnore: true*/ dir).filter((n) => NS_RE.test(n));
    } catch {
      continue;
    }
    for (const n of namespaces) {
      let files: string[];
      try {
        files = fs.readdirSync(path.join(/*turbopackIgnore: true*/ dir, n));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".json") || !KEY_RE.test(f.slice(0, -5))) continue;
        const h = readHeader(path.join(/*turbopackIgnore: true*/ dir, n, f));
        if (!h || h.ns !== n || seen.has(`${n}/${h.key}`)) continue;
        seen.add(`${n}/${h.key}`);
        out.push({ ns: n, key: h.key, recordedAt: h.recordedAt, meta: h.meta ?? {}, source, ...(h.bytes ? { bytes: h.bytes } : {}) });
      }
    }
  }
  return out.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export type ReplayStats = { total: number; byNamespace: Record<string, number>; first: string | null; last: string | null };

/** Recording counts by namespace and the recordedAt range, for the mode switch and /api/mode. */
export function replayStats(): ReplayStats {
  const all = listRecordings();
  const byNamespace: Record<string, number> = {};
  for (const r of all) byNamespace[r.ns] = (byNamespace[r.ns] ?? 0) + 1;
  return { total: all.length, byNamespace, first: all.at(-1)?.recordedAt ?? null, last: all[0]?.recordedAt ?? null };
}

/** "7 Nov, 14:02" (UK time) for "replayed from a real run recorded …". */
export function formatRecordedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(d);
}
