import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MomentumEvent } from "@/lib/schemas/community";

const mocks = vi.hoisted(() => ({ llmText: vi.fn(), loadBuildLog: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmText: mocks.llmText, LLMError: class extends Error {} }));
vi.mock("./server", () => ({ loadBuildLog: mocks.loadBuildLog }));

import { turnIntoCvBullets } from "./actions";
import { parseBullets, templateBullets } from "./cv";
import fixture from "@/data/fixtures/momentum-events.aisha.json";

const EVENTS = fixture as MomentumEvent[];

beforeEach(() => { mocks.llmText.mockReset(); mocks.loadBuildLog.mockReset(); });

describe("turnIntoCvBullets", () => {
  it("returns 3 LLM bullets when available", async () => {
    mocks.loadBuildLog.mockResolvedValue(EVENTS);
    mocks.llmText.mockResolvedValue("Here you go:\n- Shipped A.\n• Built B.\n3. Led C.\n- Extra D.");
    const r = await turnIntoCvBullets("aisha");
    expect(r).toEqual({ bullets: ["Shipped A.", "Built B.", "Led C."], source: "ai" });
    expect(mocks.llmText.mock.calls[0][0].user).toContain("Completed Week 2: Docker");
  });

  it("falls back to deterministic template bullets when llmText throws", async () => {
    mocks.loadBuildLog.mockResolvedValue(EVENTS);
    mocks.llmText.mockRejectedValue(new Error("no_key"));
    const r = await turnIntoCvBullets("aisha");
    expect(r.source).toBe("template");
    expect(r.bullets).toHaveLength(3);
    expect(r.bullets[0]).toContain("pod-vision-demo");
    expect(r.bullets[0]).toContain("merging 5 pull requests");
    expect(r.bullets[1]).toContain("Docker");
    expect(r).toEqual(await turnIntoCvBullets("aisha")); // deterministic
  });

  it("returns no bullets for a user without events", async () => {
    mocks.loadBuildLog.mockResolvedValue([]);
    expect(await turnIntoCvBullets("newbie")).toEqual({ bullets: [], source: "template" });
    expect(mocks.llmText).not.toHaveBeenCalled();
  });
});

describe("cv helpers", () => {
  it("parseBullets strips markers and headings", () => {
    expect(parseBullets("Bullets:\n\n- a\n* b\n1) c")).toEqual(["a", "b", "c"]);
  });
  it("templateBullets lists milestone topics oldest first", () => {
    const b = templateBullets(EVENTS.filter((e) => e.kind === "roadmap-milestone"));
    expect(b).toEqual([expect.stringContaining("(Linux and the command line, Docker, SQL foundations and PyTorch basics)")]);
  });
});
