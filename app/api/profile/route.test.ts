import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { POST } from "./route";
import { GET, PATCH, PUT } from "./[id]/route";
import type { Profile } from "@/lib/types";

const aisha = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/profile.aisha.json"), "utf8")) as Profile;
const { id: _omit, ...newProfile } = { ...aisha, isDemo: undefined };
void _omit;
const json = (method: string, url: string, body: unknown) => new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/profile", () => {
  it("creates a profile with an id from the first name, sets ks_uid, and GET returns it", async () => {
    const res = await POST(json("POST", "http://x/api/profile", { ...newProfile, name: "Aisha Khan" }));
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: Profile };
    expect(data.id).toBe("aisha-2"); // "aisha" is the seeded demo profile
    expect(data.name).toBe("Aisha Khan");
    expect(res.headers.get("set-cookie")).toMatch(/^ks_uid=aisha-2; Path=\/; Max-Age=\d+; SameSite=Lax/);
    const got = await GET(new Request("http://x"), params("aisha-2"));
    expect(got.status).toBe(200);
    expect(((await got.json()) as { data: Profile }).data).toEqual(data);

    const again = await POST(json("POST", "http://x/api/profile", { ...newProfile, name: "Aisha Begum" }));
    expect(((await again.json()) as { data: Profile }).data.id).toBe("aisha-3");
  });

  it("makes a safe id from any name and ignores a client-sent id", async () => {
    const res = await POST(json("POST", "http://x/api/profile", { ...newProfile, id: "aisha", name: "  Zoë O'Neill " }));
    const { data } = (await res.json()) as { data: Profile };
    expect(data.id).toBe("zoe");
    const odd = await POST(json("POST", "http://x/api/profile", { ...newProfile, name: "李雷" }));
    expect(((await odd.json()) as { data: Profile }).data.id).toMatch(/^student(-\d+)?$/);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await POST(json("POST", "http://x/api/profile", { name: "No DNA" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
    expect((await POST(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
  });
});

describe("PUT /api/profile/[id]", () => {
  it("merges dna.theoryPractice without wiping other dna fields (PATCH is the same)", async () => {
    const created = (await (await POST(json("POST", "http://x/api/profile", { ...newProfile, name: "Priyanka Shah" }))).json()) as { data: Profile };
    const id = created.data.id;
    const res = await PUT(json("PUT", "http://x", { dna: { theoryPractice: 30 }, githubLogin: "priyanka-codes" }), params(id));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Profile };
    expect(data.dna.theoryPractice).toBe(30);
    expect(data.dna.hoursPerWeek).toBe(aisha.dna.hoursPerWeek);
    expect(data.dna.targetRoles).toEqual(aisha.dna.targetRoles);
    expect(data.githubLogin).toBe("priyanka-codes");
    expect(data.id).toBe(id);
    expect(PATCH).toBe(PUT);
  });

  it("returns 404 for an unknown id and 400 for invalid fields", async () => {
    expect((await PUT(json("PUT", "http://x", { name: "x" }), params("nobody"))).status).toBe(404);
    expect((await PUT(json("PUT", "http://x", { dna: { hoursPerWeek: 99 } }), params("aisha"))).status).toBe(400);
    expect((await GET(new Request("http://x"), params("nobody"))).status).toBe(404);
  });
});
