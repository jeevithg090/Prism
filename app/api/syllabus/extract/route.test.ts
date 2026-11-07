import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_test" }));
vi.mock("@/lib/connectors/firecrawl", () => ({ fcSearch: vi.fn().mockResolvedValue([]) }));
import { POST } from "./route";
import { ProgrammeZ } from "@/lib/schemas/data";

const post = (body: unknown) => POST(new Request("http://localhost/api/syllabus/extract", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => { delete process.env.FIRECRAWL_API_KEY; delete process.env.DEMO_MODE; });
afterEach(() => { vi.restoreAllMocks(); delete process.env.FIRECRAWL_API_KEY; });

describe("POST /api/syllabus/extract", () => {
  it("400s an empty body, bad JSON and a bad url", async () => {
    for (const body of [{}, "not json", { url: "not a url" }, { text: "too short" }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
    }
  });

  it("returns the programme for a url (saved syllabus without a key)", async () => {
    const res = await post({ url: "https://example.com" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(ProgrammeZ.parse(json.data).id).toBe("uom-bsc-cs");
  });

  it("parses pasted text without any key", async () => {
    const text = "COMP23111 Database Systems\nSemester 1\n- The relational model and SQL\n- Transactions and recovery in databases";
    const json = await (await post({ text, programmeId: "uom-bsc-cs" })).json();
    expect(json.data.source).toBe("manual");
    expect(json.data.modules[0].code).toBe("COMP23111");
  });

  it("returns 502 firecrawl_failed when the page can't be read and nothing is saved", async () => {
    process.env.FIRECRAWL_API_KEY = "fc";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("blocked"));
    const res = await post({ url: "https://uni.example/bsc", programmeId: "other-uni-cs" });
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: { code: "firecrawl_failed", message: "Couldn't read that page. Paste the course text instead." } });
  });
});
