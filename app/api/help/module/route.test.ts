import { beforeEach, describe, expect, it, vi } from "vitest";

const { createModuleHelpRequest } = vi.hoisted(() => ({ createModuleHelpRequest: vi.fn() }));
vi.mock("@/lib/agents/module-help", () => ({ createModuleHelpRequest }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://test/api/help/module", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  createModuleHelpRequest.mockResolvedValue({
    id: "help_1",
    fromUserId: "aisha",
    kind: "question",
    message: "[COMP1xxx1] help me — hash maps",
    status: "open",
    createdAt: "2026-11-08T00:00:00.000Z",
  });
});

describe("POST /api/help/module", () => {
  it("valid body → ok with the created request", async () => {
    const res = await post({ fromUserId: "aisha", moduleCode: "COMP1xxx1", concept: "hash maps", message: "help me" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.id).toBe("help_1");
    expect(createModuleHelpRequest).toHaveBeenCalledWith({
      fromUserId: "aisha",
      moduleCode: "COMP1xxx1",
      concept: "hash maps",
      message: "help me",
    });
  });

  it("missing message → badRequest", async () => {
    const res = await post({ fromUserId: "aisha", moduleCode: "COMP1xxx1" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("bad_request");
    expect(createModuleHelpRequest).not.toHaveBeenCalled();
  });

  it("createModuleHelpRequest throwing → internal", async () => {
    createModuleHelpRequest.mockRejectedValue(new Error("store down"));
    const res = await post({ fromUserId: "aisha", message: "help me" });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("internal");
  });

  it("non-JSON body → badRequest", async () => {
    const res = await POST(new Request("http://test/api/help/module", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });
});
