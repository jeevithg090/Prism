// Where an API answer came from under the Demo toggle (lib/replay.ts), in a shape the browser can read.
// Story routes add it to their envelope as `replay` and to the `x-keystone-replay` header (lib/replay.ts,
// withReplayInfo). Pure and client-safe: components/mode/ReplayNote renders it.

export type ReplayMatch = "exact" | "loose" | "alt";

/**
 * - replayed: every AI / connector value was replayed from a real run.
 * - live: Live AI called the services now (and recorded what they returned).
 * - template: Demo had no recording, so Keystone's deterministic template / rules answered instead.
 * - mixed: some values were replayed and some were not (called live, or a template filled the gap).
 */
export type ReplaySource = "replayed" | "live" | "template" | "mixed";

export type ReplayInfo = {
  mode: "demo" | "live";
  source: ReplaySource;
  /** Counts of values replayed, recorded now, called live without recording, and missed in Demo. */
  replayed: number;
  recorded: number;
  live: number;
  missed: number;
  /** The newest recordedAt among the replayed values (ISO), when anything was replayed. */
  recordedAt?: string;
  /** The model of the replayed or live AI answers, when one is known. */
  model?: string;
  /** True when at least one value came from a similar run (numbers or context differed), not the exact same call. */
  similar?: boolean;
  /** Namespaces involved (llm, embed, firecrawl, tts, hn, github, market). */
  kinds: string[];
};

export const REPLAY_HEADER = "x-keystone-replay";

/** "7 Nov, 14:02" (UK time). */
export function formatReplayTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(d);
}

/** One plain line for the UI: "Replayed from a real run · gpt-4.1-mini · 7 Nov, 15:20". */
export function replayNoteText(info: ReplayInfo | null | undefined): string | null {
  if (!info) return null;
  const at = formatReplayTime(info.recordedAt);
  const tail = [info.model, at].filter(Boolean).join(" · ");
  switch (info.source) {
    case "replayed":
      return `${info.similar ? "Replayed from a similar real run" : "Replayed from a real run"}${tail ? ` · ${tail}` : ""}`;
    case "mixed":
      return info.missed
        ? `Partly replayed from a real run${tail ? ` · ${tail}` : ""}; ${info.missed} part${info.missed === 1 ? " wasn't" : "s weren't"} recorded, so Keystone's template filled ${info.missed === 1 ? "it" : "them"}`
        : `Partly replayed from a real run${tail ? ` · ${tail}` : ""}; the rest ran live now`;
    case "template":
      return info.mode === "demo" ? "Not recorded yet, so Keystone's template answered" : "AI unavailable, so Keystone's template answered";
    case "live":
      return `Live AI${info.model ? ` · ${info.model}` : ""}${info.recorded ? " · recorded for Demo" : ""}`;
    default:
      return null;
  }
}

/** The `replay` field of an API envelope, if it has a valid one. */
export function replayInfoOf(json: unknown): ReplayInfo | null {
  const r = (json as { replay?: unknown } | null)?.replay as Partial<ReplayInfo> | undefined;
  if (!r || typeof r !== "object") return null;
  if (r.mode !== "demo" && r.mode !== "live") return null;
  if (!["replayed", "live", "template", "mixed"].includes(String(r.source))) return null;
  return {
    mode: r.mode, source: r.source as ReplaySource,
    replayed: Number(r.replayed) || 0, recorded: Number(r.recorded) || 0, live: Number(r.live) || 0, missed: Number(r.missed) || 0,
    ...(typeof r.recordedAt === "string" ? { recordedAt: r.recordedAt } : {}),
    ...(typeof r.model === "string" ? { model: r.model } : {}),
    ...(r.similar ? { similar: true } : {}),
    kinds: Array.isArray(r.kinds) ? r.kinds.filter((k): k is string => typeof k === "string") : [],
  };
}
