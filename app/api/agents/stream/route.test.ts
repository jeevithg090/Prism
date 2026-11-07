import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const base = { runId: "r1", ts: "t" };
vi.mock("@/lib/agents/events", () => ({
  subscribe: (_: string, cb: (e: unknown) => void) => {
    cb({ ...base, agent: "syllabus", status: "started", message: "a" });
    cb({ ...base, agent: "syllabus", status: "done", message: "b" });
    cb({ ...base, agent: "orchestrator", status: "done", message: "c" });
    return () => {};
  },
  getLog: () => [{ ...base, agent: "syllabus", status: "done", message: "a" }],
}));
import { GET } from "./route";

describe("GET /api/agents/stream", () => {
  it("streams events and closes after orchestrator done", async () => {
    const res = await GET(new Request("http://x/api/agents/stream?runId=r1"));
    const text = await res.text(); // resolves only if the stream closed
    expect(text.match(/event: agent/g)).toHaveLength(3);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });
  it("returns 400 without runId", async () => {
    const res = await GET(new Request("http://x/api/agents/stream"));
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });
  it("poll mode returns logged events as JSON", async () => {
    const res = await GET(new Request("http://x/api/agents/stream?runId=r1&poll=1"));
    expect((await res.json()).data).toHaveLength(1);
  });
});
