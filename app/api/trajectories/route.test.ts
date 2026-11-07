import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trajectory } from "@/lib/types";

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
vi.mock("@/lib/store", () => ({ getStore: () => ({ list: listMock, get: vi.fn(), upsert: vi.fn(), remove: vi.fn() }) }));
vi.mock("@/lib/llm", () => ({ embed: vi.fn(), cosine: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_test" }));

import { GET } from "./route";

const t = (id: string, programmeId: string): Trajectory => ({
  id, userId: id, name: id, programmeId, outcomeRole: "PhD in ML", advice: "Ask early.", isDemo: true, openToChat: true,
  steps: [{ year: 1, kind: "society", label: "Joined the AI society" }],
});

describe("GET /api/trajectories", () => {
  beforeEach(() => { listMock.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); delete process.env.DEMO_MODE; });

  it("returns store trajectories filtered by programmeId", async () => {
    listMock.mockResolvedValue([t("a", "uom-bsc-cs"), t("b", "uom-bsc-maths")]);
    const res = await GET(new Request("http://x/api/trajectories?programmeId=uom-bsc-cs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.map((x: Trajectory) => x.id)).toEqual(["a"]);
    expect(listMock).toHaveBeenCalledWith("trajectories");
  });

  it("returns everything without a programmeId", async () => {
    listMock.mockResolvedValue([t("a", "uom-bsc-cs"), t("b", "uom-bsc-maths")]);
    const body = await (await GET(new Request("http://x/api/trajectories"))).json();
    expect(body.data).toHaveLength(2);
  });

  it("falls back to the seed file when the store is empty", async () => {
    listMock.mockResolvedValue([]);
    const spy = vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([t("seed1", "uom-bsc-cs"), { bad: true }]));
    const body = await (await GET(new Request("http://x/api/trajectories"))).json();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("trajectories.json"), "utf8");
    expect(body.data.map((x: Trajectory) => x.id)).toEqual(["seed1"]);
  });

  it("serves seed data instantly in DEMO_MODE without touching the store", async () => {
    process.env.DEMO_MODE = "true";
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([t("seed1", "uom-bsc-cs")]));
    const body = await (await GET(new Request("http://x/api/trajectories"))).json();
    expect(body.data).toHaveLength(1);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty programmeId", async () => {
    const res = await GET(new Request("http://x/api/trajectories?programmeId="));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });

  it("returns 500 with the envelope when the store throws", async () => {
    listMock.mockImplementation(async () => { throw new Error("db down"); });
    const res = await GET(new Request("http://x/api/trajectories"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});
