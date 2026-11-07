import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trajectory } from "@/lib/types";

const { llmTextMock, getMock } = vi.hoisted(() => ({ llmTextMock: vi.fn(), getMock: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmText: llmTextMock }));
vi.mock("@/lib/store", () => ({ getStore: () => ({ get: getMock }) }));

import { draftChatRequest } from "./actions";

const priya: Trajectory = {
  id: "traj_priya", userId: "priya", name: "Priya Shah", programmeId: "uom-bsc-cs", outcomeRole: "ML engineer at a Manchester health-tech startup",
  advice: "Ship small things.", isDemo: true, openToChat: true,
  steps: [
    { year: 1, kind: "society", label: "Joined the robotics society" },
    { year: 3, kind: "placement", label: "Year in industry at an ML consultancy" },
  ],
};

describe("draftChatRequest", () => {
  beforeEach(() => {
    llmTextMock.mockReset();
    getMock.mockReset().mockResolvedValue({ id: "aisha", year: 1, dna: { targetRoles: ["ml-engineer"] } });
  });

  it("falls back to a ≤ 60-word template that mentions a concrete step when the LLM throws", async () => {
    llmTextMock.mockRejectedValue(new Error("no_key"));
    const { draft, source } = await draftChatRequest({ viewerId: "aisha", trajectory: priya });
    expect(source).toBe("template");
    expect(draft).toContain("Hi Priya");
    expect(draft).toContain("hoping to become an ML engineer");
    expect(draft).toContain("Year in industry at an ML consultancy");
    expect(draft).toContain("15-minute");
    expect(draft.split(/\s+/).length).toBeLessThanOrEqual(60);
  });

  it("uses the LLM draft when it is short enough", async () => {
    llmTextMock.mockResolvedValue("Hi Priya, could we chat for 15 minutes about your ML placement?");
    const res = await draftChatRequest({ viewerId: "aisha", trajectory: priya });
    expect(res).toEqual({ draft: "Hi Priya, could we chat for 15 minutes about your ML placement?", source: "llm" });
    expect(llmTextMock.mock.calls[0][0].user).toContain("≤ 60 words");
  });

  it("rejects an over-long LLM draft", async () => {
    llmTextMock.mockResolvedValue(Array(80).fill("word").join(" "));
    expect((await draftChatRequest({ viewerId: "aisha", trajectory: priya })).source).toBe("template");
  });
});
