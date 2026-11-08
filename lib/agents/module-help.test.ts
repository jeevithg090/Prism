import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadGraph } = vi.hoisted(() => ({ loadGraph: vi.fn() }));
const storeList = vi.fn();
const getStoreMock = vi.hoisted(() => ({ getStore: () => ({ list: storeList }) }));
const { createHelpRequest } = vi.hoisted(() => ({ createHelpRequest: vi.fn() }));

vi.mock("@/lib/graph/build", () => ({ loadGraph }));
vi.mock("@/lib/store", () => getStoreMock);
vi.mock("@/lib/community/help", () => ({ createHelpRequest }));

import { suggestHelpersForModule, createModuleHelpRequest } from "./module-help";
import type { HelpRequest } from "@/lib/types";

const map = (nodes: unknown[]) => ({
  userId: "aisha",
  roleId: "se",
  nodes,
  edges: [],
  readinessNow: 0,
  readinessProjected: 0,
  generatedAt: "2026-11-08T00:00:00.000Z",
});

const node = (
  skillId: string,
  name: string,
  level: number,
  status: "proven" | "gap" | "degree-done" = "proven",
  moduleCodes: string[] = [],
) => ({
  skillId,
  name,
  category: "data",
  status,
  demand: 0.5,
  level,
  evidenceIds: [],
  moduleCodes,
});

beforeEach(() => {
  vi.clearAllMocks();
  createHelpRequest.mockReset();
  storeList.mockReset();
  loadGraph.mockReset();
});

describe("suggestHelpersForModule", () => {
  it("returns proven candidates for a module code, sorted by level desc, excluding the viewer", async () => {
    loadGraph.mockImplementation(async (uid: string) => {
      if (uid === "aisha") return map([node("hash-maps", "Hash maps", 3, "proven", ["COMP1xxx1"])]);
      if (uid === "tom") return map([node("hash-maps", "Hash maps", 3, "proven")]);
      if (uid === "mei") return map([node("hash-maps", "Hash maps", 2, "proven")]);
      if (uid === "leo") return map([node("hash-maps", "Hash maps", 1, "degree-done")]);
      return null;
    });
    storeList.mockResolvedValue([
      { id: "aisha", name: "Aisha Rahman" },
      { id: "tom", name: "Tom Baker" },
      { id: "mei", name: "Mei Chen" },
      { id: "leo", name: "Leo Park" },
    ]);

    const out = await suggestHelpersForModule("aisha", "se", "COMP1xxx1");
    expect(out).toEqual([
      {
        skillId: "hash-maps",
        skillName: "Hash maps",
        moduleCode: "COMP1xxx1",
        helperCandidates: [
          { userId: "tom", name: "Tom Baker", provenLevel: 3 },
          { userId: "mei", name: "Mei Chen", provenLevel: 2 },
        ],
      },
    ]);
    // The viewer's own map was loaded once; every other profile's map was checked.
    expect(loadGraph).toHaveBeenCalledWith("aisha", "se");
    expect(loadGraph).toHaveBeenCalledWith("tom", "se");
    expect(loadGraph).toHaveBeenCalledWith("mei", "se");
    expect(loadGraph).toHaveBeenCalledWith("leo", "se");
  });

  it("returns [] when no node matches the module code or concept", async () => {
    loadGraph.mockResolvedValue(map([node("sql", "SQL", 0, "gap")]));
    storeList.mockResolvedValue([{ id: "aisha", name: "Aisha" }, { id: "tom", name: "Tom" }]);

    const out = await suggestHelpersForModule("aisha", "se", "ZZZ999");
    expect(out).toEqual([]);
  });

  it("matches by concept (skill name) not just module code", async () => {
    loadGraph.mockImplementation(async (uid: string) => {
      if (uid === "aisha") return map([node("sql-joins", "SQL joins", 3, "proven", ["DBS101"])]);
      if (uid === "tom") return map([node("sql-joins", "SQL joins", 3, "proven")]);
      return null;
    });
    storeList.mockResolvedValue([{ id: "aisha", name: "Aisha" }, { id: "tom", name: "Tom" }]);

    const out = await suggestHelpersForModule("aisha", "se", "joins");
    expect(out[0]?.skillId).toBe("sql-joins");
    expect(out[0]?.helperCandidates).toEqual([{ userId: "tom", name: "Tom", provenLevel: 3 }]);
  });

  it("degrades to [] when the viewer has no map", async () => {
    loadGraph.mockResolvedValue(null);
    storeList.mockResolvedValue([{ id: "tom", name: "Tom" }]);

    expect(await suggestHelpersForModule("aisha", "se", "COMP1xxx1")).toEqual([]);
  });
});

describe("createModuleHelpRequest", () => {
  it("delegates to createHelpRequest with kind question and a module/concept-prefixed message", async () => {
    const created: HelpRequest = {
      id: "help_1",
      fromUserId: "aisha",
      kind: "question",
      message: "[COMP1xxx1] help me — hash maps",
      status: "open",
      createdAt: "2026-11-08T00:00:00.000Z",
    };
    createHelpRequest.mockResolvedValue(created);

    const out = await createModuleHelpRequest({
      fromUserId: "aisha",
      moduleCode: "COMP1xxx1",
      concept: "hash maps",
      message: "help me",
    });

    expect(createHelpRequest).toHaveBeenCalledWith({
      fromUserId: "aisha",
      kind: "question",
      message: "[COMP1xxx1] help me — hash maps",
    });
    expect(out).toBe(created);
  });

  it("omits absent moduleCode/concept from the message", async () => {
    createHelpRequest.mockResolvedValue({
      id: "help_2",
      fromUserId: "aisha",
      kind: "question",
      message: "help me",
      status: "open",
      createdAt: "t",
    });

    await createModuleHelpRequest({ fromUserId: "aisha", message: "help me" });
    expect(createHelpRequest).toHaveBeenCalledWith({
      fromUserId: "aisha",
      kind: "question",
      message: "help me",
    });
  });

  it("never throws when createHelpRequest fails", async () => {
    createHelpRequest.mockRejectedValue(new Error("store down"));

    const out = await createModuleHelpRequest({ fromUserId: "aisha", message: "help me" });
    expect(out.kind).toBe("question");
    expect(out.fromUserId).toBe("aisha");
    expect(out.status).toBe("open");
  });
});
