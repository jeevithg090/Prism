import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ trigger: vi.fn(async () => true) }));
vi.mock("@/lib/n8n", async (orig) => ({ ...(await orig<typeof import("@/lib/n8n")>()), triggerWorkflow: h.trigger }));

import { POST } from "./route";

const post = (wf: string, body?: unknown) => POST(
  new Request(`http://localhost/api/n8n/trigger/${wf}`, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) }),
  { params: Promise.resolve({ workflow: wf }) },
);
beforeEach(() => h.trigger.mockClear());

describe("POST /api/n8n/trigger/[workflow]", () => {
  it("triggers a known workflow with the payload", async () => {
    const res = await post("pod-kickoff", { payload: { podId: "pod_demo01" } });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ triggered: true, workflow: "pod-kickoff" });
    expect(h.trigger).toHaveBeenCalledWith("pod-kickoff", { podId: "pod_demo01" });
  });
  it("accepts an empty body", async () => {
    expect((await post("monday-briefing")).status).toBe(200);
    expect(h.trigger).toHaveBeenCalledWith("monday-briefing", {});
  });
  it("404s on an unknown workflow and 400s on a bad payload", async () => {
    expect((await post("delete-everything", {})).status).toBe(404);
    expect((await post("pod-kickoff", { payload: "nope" })).status).toBe(400);
  });
});
