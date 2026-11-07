import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_test" }));
import { GET } from "./route";
import { TrendSeriesZ } from "@/lib/schemas/data";

const call = (qs = "") => GET(new Request(`http://localhost/api/trends${qs}`));
afterEach(() => { delete process.env.DEMO_MODE; vi.restoreAllMocks(); });

describe("GET /api/trends", () => {
  it("?skills=docker returns exactly 1 series", async () => {
    const json = await (await call("?skills=docker")).json();
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(TrendSeriesZ.parse(json.data[0]).skillId).toBe("docker");
  });

  it("filters several skills and returns all without a filter", async () => {
    const two = await (await call("?skills=docker,%20Python")).json();
    expect(two.data.map((s: { skillId: string }) => s.skillId).sort()).toEqual(["docker", "python"]);
    const all = await (await call()).json();
    expect(all.data.length).toBeGreaterThanOrEqual(12);
  });

  it("labels LLM evaluation rising and TensorFlow declining", async () => {
    const json = await (await call("?skills=llm-evaluation,tensorflow&demo=1")).json();
    const by = Object.fromEntries(json.data.map((s: { skillId: string; label: string }) => [s.skillId, s.label]));
    expect(by).toEqual({ "llm-evaluation": "rising", tensorflow: "declining" });
  });

  it("400s malformed skill ids", async () => {
    const res = await call("?skills=Docker!!");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });

  it("is instant in DEMO_MODE", async () => {
    process.env.DEMO_MODE = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await (await call("?skills=llm-apps")).json()).data).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
