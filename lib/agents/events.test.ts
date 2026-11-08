import { describe, expect, it, vi } from "vitest";
import { emit, emitIf, getRunEvents, newRunId, subscribe } from "@/lib/agents/events";

describe("agent event bus", () => {
  it("stamps ts, keeps the run log and replays it to late subscribers in order", () => {
    const runId = newRunId();
    emit({ runId, agent: "orchestrator", status: "started", message: "Building Aisha's bridge" });
    emit({ runId, agent: "syllabus", status: "progress", message: "Crawled 32 pages" });
    const seen: string[] = [];
    const off = subscribe(runId, (e) => seen.push(e.message));
    expect(seen).toEqual(["Building Aisha's bridge", "Crawled 32 pages"]);
    emit({ runId, agent: "market", status: "done", message: "214 ads analysed" });
    expect(seen).toHaveLength(3);
    off();
    emit({ runId, agent: "orchestrator", status: "done", message: "Bridge ready" });
    expect(seen).toHaveLength(3);
    const log = getRunEvents(runId);
    expect(log.map((e) => e.message)).toEqual(["Building Aisha's bridge", "Crawled 32 pages", "214 ads analysed", "Bridge ready"]);
    expect(log.every((e) => !Number.isNaN(Date.parse(e.ts)) && e.runId === runId)).toBe(true);
  });

  it("caps each run at 200 events and returns copies for polling", () => {
    const runId = newRunId();
    for (let i = 0; i < 230; i++) emit({ runId, agent: "market", status: "progress", message: `ad ${i}` });
    const log = getRunEvents(runId);
    expect(log).toHaveLength(200);
    expect(log[0].message).toBe("ad 30");
    log.pop();
    expect(getRunEvents(runId)).toHaveLength(200);
    expect(getRunEvents("run_unknown")).toEqual([]);
  });

  it("keeps runs separate, isolates a throwing listener and lives on globalThis", () => {
    const a = newRunId();
    const b = newRunId();
    expect(a).toMatch(/^run_[\w-]{10}$/);
    expect(a).not.toBe(b);
    const good = vi.fn();
    subscribe(a, () => { throw new Error("boom"); });
    subscribe(a, good);
    const other = vi.fn();
    subscribe(b, other);
    emit({ runId: a, agent: "trends", status: "done", message: "6 rising" });
    expect(good).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect((globalThis as { __ksEvents?: Map<string, unknown[]> }).__ksEvents?.get(a)).toHaveLength(1);
  });

  it("emitIf skips when there is no run", () => {
    const runId = newRunId();
    emitIf(undefined, "evidence", "done", "ignored");
    emitIf(runId, "evidence", "done", "Read 6 repos", { repos: 6 });
    expect(getRunEvents(runId)).toMatchObject([{ agent: "evidence", message: "Read 6 repos", data: { repos: 6 } }]);
  });
});
