import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/lib/types";

type Cb = (e: AgentEvent) => void;
const h = vi.hoisted(() => ({
  past: [] as AgentEvent[],
  live: null as null | ((e: AgentEvent) => void),
  unsubscribe: vi.fn(),
  getRunEvents: vi.fn(),
}));
vi.mock("@/lib/agents/events", () => ({
  subscribe: vi.fn((_runId: string, cb: Cb) => {
    h.past.forEach(cb);
    h.live = cb;
    return h.unsubscribe;
  }),
  getRunEvents: h.getRunEvents,
}));

import { GET } from "./route";
import { subscribe } from "@/lib/agents/events";

const ev = (agent: AgentEvent["agent"], status: AgentEvent["status"], message: string): AgentEvent => ({ runId: "run_t", agent, status, message, ts: "2026-11-07T14:00:00.000Z" });
const parse = (text: string) => text.split("\n\n").filter((b) => b.includes("event: agent")).map((b) => JSON.parse(b.split("\n").find((l) => l.startsWith("data: "))!.slice(6)) as AgentEvent);

beforeEach(() => {
  h.past = [];
  h.live = null;
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("GET /api/agents/stream", () => {
  it("returns 400 without a runId", async () => {
    const res = await GET(new Request("http://x/api/agents/stream"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });

  it("?poll=1 returns the run's events as JSON", async () => {
    h.getRunEvents.mockReturnValue([ev("syllabus", "progress", "Crawled 32 pages")]);
    const res = await GET(new Request("http://x/api/agents/stream?runId=run_t&poll=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: [ev("syllabus", "progress", "Crawled 32 pages")] });
    expect(h.getRunEvents).toHaveBeenCalledWith("run_t");
  });

  it("streams SSE with the right headers, replays past events and closes after the orchestrator is done", async () => {
    h.past = [ev("orchestrator", "started", "Building"), ev("market", "progress", "214 ads analysed")];
    const res = await GET(new Request("http://x/api/agents/stream?runId=run_t"));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(subscribe).toHaveBeenCalledWith("run_t", expect.any(Function));
    h.live!(ev("orchestrator", "done", "Bridge ready · 38% → 84%"));
    h.live!(ev("market", "progress", "after the end"));
    const text = await res.text();
    expect(text).toContain("event: agent\ndata: ");
    expect(text).toContain("id: 0\n");
    expect(parse(text).map((e) => e.message)).toEqual(["Building", "214 ads analysed", "Bridge ready · 38% → 84%"]);
    expect(h.unsubscribe).toHaveBeenCalled();
  });

  it("closes straight away when the replay already contains the end, and skips what Last-Event-ID has seen", async () => {
    h.past = [ev("orchestrator", "started", "Building"), ev("syllabus", "done", "41 units"), ev("orchestrator", "error", "Showing demo data")];
    const res = await GET(new Request("http://x/api/agents/stream?runId=run_t", { headers: { "last-event-id": "0" } }));
    const events = parse(await res.text());
    expect(events.map((e) => e.message)).toEqual(["41 units", "Showing demo data"]);
    expect(h.unsubscribe).toHaveBeenCalled();
  });

  it("sends a heartbeat every 15 seconds and unsubscribes when the client goes away", async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    const res = await GET(new Request("http://x/api/agents/stream?runId=run_t", { signal: ctrl.signal }));
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    expect(dec.decode((await reader.read()).value)).toContain(": connected");
    vi.advanceTimersByTime(15_000);
    expect(dec.decode((await reader.read()).value)).toBe(": ping\n\n");
    ctrl.abort();
    expect(h.unsubscribe).toHaveBeenCalled();
    expect((await reader.read()).done).toBe(true);
  });
});

describe("GET /api/agents/stream for runs without an orchestrator", () => {
  it("closes when the agent that started the run reports done", async () => {
    h.past = [ev("matchmaker", "started", "Comparing 12 students"), ev("matchmaker", "progress", "pod score 0.82"), ev("matchmaker", "done", "Pod Aurora is ready")];
    const res = await GET(new Request("http://x/api/agents/stream?runId=run_t"));
    expect(parse(await res.text())).toHaveLength(3);
  });
});
