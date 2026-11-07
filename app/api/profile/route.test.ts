import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "./route";
import { GET, PUT } from "./[id]/route";
import profile from "@/data/fixtures/profile.aisha.json";

const req = (body: unknown, method = "POST") => new Request("http://x/api/profile", { method, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const { id: _id, ...noId } = profile;

describe("profile routes", () => {
  it("creates then gets the same profile, and sets the ks_uid cookie", async () => {
    const res = await POST(req({ ...noId, id: "newkid" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("ks_uid=newkid");
    const got = await (await GET(new Request("http://x"), ctx("newkid"))).json();
    expect(got.data.name).toBe(profile.name);
  });
  it("generates an id when none is given", async () => {
    const body = await (await POST(req(noId))).json();
    expect(body.data.id).toHaveLength(8);
  });
  it("PUT merges dna without wiping other dna fields", async () => {
    await POST(req({ ...noId, id: "mergeme" }));
    const res = await PUT(req({ dna: { theoryPractice: 20 } }, "PUT"), ctx("mergeme"));
    const { data } = await res.json();
    expect(data.dna.theoryPractice).toBe(20);
    expect(data.dna.hoursPerWeek).toBe(8);
  });
  it("400 on invalid body, 404 on unknown id", async () => {
    expect((await POST(req({ name: "x" }))).status).toBe(400);
    expect((await GET(new Request("http://x"), ctx("nobody"))).status).toBe(404);
    expect((await PUT(req({ year: 2 }, "PUT"), ctx("nobody"))).status).toBe(404);
  });
});
