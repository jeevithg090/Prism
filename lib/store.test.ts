import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { MemoryStore, getStore, defaultSeed } from "./store";

const seed = () => [{ collection: "profiles", id: "aisha", doc: { id: "aisha", name: "Aisha" }, userId: "aisha" }];

describe("MemoryStore", () => {
  it("is seeded with profiles/aisha", async () => {
    expect(await new MemoryStore(seed).get("profiles", "aisha")).toEqual({ id: "aisha", name: "Aisha" });
  });
  it("upserts, gets, filters by userId and removes", async () => {
    const s = new MemoryStore(() => []);
    await s.upsert("evidence", "e1", { id: "e1" }, "u1");
    await s.upsert("evidence", "e2", { id: "e2" }, "u2");
    expect(await s.get("evidence", "e1")).toEqual({ id: "e1" });
    expect(await s.list("evidence", { userId: "u1" })).toEqual([{ id: "e1" }]);
    expect(await s.list("evidence")).toHaveLength(2);
    await s.remove("evidence", "e1");
    expect(await s.get("evidence", "e1")).toBeNull();
  });
  it("default seed tolerates missing fixture files", () => {
    expect(() => defaultSeed()).not.toThrow();
  });
});

describe("getStore", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("returns MemoryStore when DEMO_MODE=true", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://sb");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    expect(getStore()).toBeInstanceOf(MemoryStore);
  });
  it("returns MemoryStore when Supabase env is missing", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(getStore()).toBeInstanceOf(MemoryStore);
  });
});
