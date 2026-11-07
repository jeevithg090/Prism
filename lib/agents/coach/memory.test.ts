import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ api: null as null | ReturnType<typeof import("./testTools").memoryStore> }));
vi.mock("@/lib/store", async () => {
  const { memoryStore } = await import("./testTools");
  h.api = memoryStore();
  return { getStore: () => h.api!.store };
});

import { addMemory, deleteMemory, extractMemory, listMemory } from "./memory";

beforeEach(() => h.api?.rows.clear());

describe("extractMemory", () => {
  it.each([
    ["I prefer project-based learning", "preference", "you prefer project-based learning"],
    ["Honestly I'd prefer videos over docs.", "preference", "you prefer videos over docs"],
    ["I learn best by building things", "preference", "you learn best by building things"],
    ["I struggle with Linux commands, any tips?", "struggle", "you struggle with Linux commands"],
    ["I'm struggling with my statistics module", "struggle", "you struggle with your statistics module"],
    ["I find it hard to focus after lectures", "struggle", "you find it hard to focus after lectures"],
    ["My goal is to land an ML placement next summer", "goal", "your goal is to land an ML placement next summer"],
    ["I want to become an ML engineer", "goal", "you want to become an ML engineer"],
    ["I'm working part-time on weekends", "preference", "you're working part-time, so keep weekly plans light"],
    ["I have a part-time job", "preference", "you're working part-time, so keep weekly plans light"],
    ["I only have 5 hours a week", "preference", "you have about 5 hours a week"],
    ["I finally passed my Python exam!", "win", "you passed your Python exam"],
  ])("%s", (message, kind, text) => {
    expect(extractMemory(message)).toEqual([{ kind, text }]);
  });

  it("ignores ordinary questions and requests to the Coach", () => {
    for (const m of ["What should I do this week?", "Find me a pod", "I want to know why Docker", "I want to find a team", "Why Docker?"]) {
      expect(extractMemory(m)).toEqual([]);
    }
  });

  it("never remembers sensitive or contact details", () => {
    expect(extractMemory("I prefer you email me at aisha@example.com")).toEqual([]);
    expect(extractMemory("I struggle with anxiety before exams")).toEqual([]);
    expect(extractMemory("I want to call you on 07700 900123")).toEqual([]);
  });

  it("keeps at most one note per kind and two per message", () => {
    const out = extractMemory("I prefer projects. I struggle with SQL. My goal is to get a placement.");
    expect(out.map((n) => n.kind)).toEqual(["preference", "struggle"]);
  });
});

describe("memory store", () => {
  it("adds notes as userId:n, lists newest first, dedupes, and only the owner can delete", async () => {
    const a = await addMemory({ userId: "aisha", kind: "preference", text: "you prefer project-based learning" });
    expect(a).toMatchObject({ id: "aisha:1", userId: "aisha", source: "coach chat" });
    const again = await addMemory({ userId: "aisha", kind: "preference", text: "You prefer project-based learning." });
    expect(again.id).toBe("aisha:1");
    const b = await addMemory({ userId: "aisha", kind: "struggle", text: "you struggle with Linux" });
    expect(b.id).toBe("aisha:2");
    await addMemory({ userId: "tom", kind: "goal", text: "your goal is AWS" });
    expect((await listMemory("aisha")).map((n) => n.id).sort()).toEqual(["aisha:1", "aisha:2"]);

    expect(await deleteMemory("tom", "aisha:1")).toBe(false);
    expect(await deleteMemory("aisha", "aisha:1")).toBe(true);
    expect(await deleteMemory("aisha", "aisha:1")).toBe(false);
    expect((await listMemory("aisha")).map((n) => n.id)).toEqual(["aisha:2"]);
    expect((await addMemory({ userId: "aisha", kind: "win", text: "you shipped Docker" })).id).toBe("aisha:3");
  });
});
