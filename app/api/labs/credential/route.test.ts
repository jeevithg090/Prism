import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";

const h = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/agents/events", () => ({ emit: h.emit, newRunId: () => "run_cred", subscribe: () => () => {} }));
vi.mock("@/lib/graph/build", () => ({ loadGraph: async (u: string) => (u === "aisha" ? structuredClone(mapFixture) : null) }));

import { testStore } from "@/tests/seededStore";
import { recordMergedPR } from "@/lib/agents/proof";
import { listRuns } from "@/lib/agents/harness";
import { listMemory } from "@/lib/agents/coach/memory";
import { resetIssuerKeyCache } from "@/lib/labs/credential/keys";
import { resetVerifyLimits, VERIFY_LIMIT } from "@/lib/labs/credential/http";
import { GET as ledgerGET, POST as issuePOST } from "./route";
import { POST as verifyPOST } from "./verify/route";
import { GET as jwksGET } from "./jwks/route";
import { DELETE as shareDELETE, GET as shareGET } from "./share/[id]/route";

const req = (url: string, init: RequestInit & { uid?: string } = {}) =>
  new Request(`http://localhost${url}`, { ...init, headers: { "content-type": "application/json", ...(init.uid ? { cookie: `ks_uid=${init.uid}` } : {}) } });
const post = (url: string, body: unknown, uid?: string) => req(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), uid });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => { process.env.DEMO_MODE = "true"; });
afterAll(() => { delete process.env.DEMO_MODE; });
beforeEach(() => {
  testStore().reset();
  resetIssuerKeyCache();
  resetVerifyLimits();
  h.emit.mockClear();
});

async function issue(skillIds: string[], uid?: string) {
  const res = await issuePOST(post("/api/labs/credential", { skillIds, approved: true }, uid));
  return { status: res.status, body: await res.json() };
}

describe("GET /api/labs/credential", () => {
  it("hashes every proven rung of Aisha's Proof Ladder into one Merkle tree", async () => {
    const body = await (await ledgerGET(req("/api/labs/credential"))).json();
    expect(body.ok).toBe(true);
    const v = body.data;
    expect(v.userId).toBe("aisha");
    expect(v.size).toBe(v.leaves.length);
    expect(v.size).toBeGreaterThanOrEqual(8); // 4 GitHub proofs + 4 completed modules on the seeded map
    expect(v.root).toMatch(/^[0-9a-f]{64}$/);
    expect(v.tree.hash).toBe(v.root);
    expect(v.skills.map((s: { skillId: string }) => s.skillId)).toContain("python");
    expect(v.latest).toBeNull();
    expect(v.issuer.did).toMatch(/^did:key:z6Mk/);
    expect(v.issuer.demoKey).toBe(true);
  });

  it("404s an unknown student", async () => {
    const res = await ledgerGET(req("/api/labs/credential", { uid: "nobody" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/labs/credential (the student decides)", () => {
  it("400s without explicit approval, with an empty or malformed skill list", async () => {
    expect((await issuePOST(post("/api/labs/credential", { skillIds: ["python"] }))).status).toBe(400);
    expect((await issuePOST(post("/api/labs/credential", { skillIds: [], approved: true }))).status).toBe(400);
    expect((await issuePOST(post("/api/labs/credential", { skillIds: ["Not A Skill"], approved: true }))).status).toBe(400);
    expect((await issuePOST(post("/api/labs/credential", "{oops"))).status).toBe(400);
  });

  it("400s a skill with no proof (nothing to disclose)", async () => {
    const r = await issue(["kubernetes"]);
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/Kubernetes|kubernetes/);
  });

  it("signs once, discloses only the chosen skills, chains the next credential and writes back to the Coach", async () => {
    const first = await issue(["python"]);
    expect(first.status).toBe(201);
    const d = first.body.data;
    expect(d.signedNew).toBe(true);
    expect(d.credential.credentialSubject.evidenceLedger).toMatchObject({ sequence: 1, previous: null });
    expect(d.share.disclosures.every((x: { leaf: { skillId: string } }) => x.leaf.skillId === "python")).toBe(true);
    expect(JSON.stringify(d.share)).not.toMatch(/"skillId":"git"/);
    expect(d.shareUrl).toMatch(/^\/labs\/credential\?share=[a-f0-9]{24}$/);

    // Same ledger → the newest credential is reused (deterministic in DEMO_MODE).
    const again = await issue(["git", "python"]);
    expect(again.body.data.signedNew).toBe(false);
    expect(again.body.data.credential.proof.proofValue).toBe(d.credential.proof.proofValue);

    // A merged pod PR (the proof engine) changes the ledger → credential #2, chained to #1.
    await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8" });
    const next = await issue(["docker"]);
    expect(next.body.data.signedNew).toBe(true);
    expect(next.body.data.credential.credentialSubject.evidenceLedger.sequence).toBe(2);
    expect(next.body.data.credential.credentialSubject.evidenceLedger.previous).toMatch(/^[0-9a-f]{64}$/);
    expect(next.body.data.share.disclosures[0].leaf).toMatchObject({ skillId: "docker", rung: 2, source: "keystone-pod" });

    const view = (await (await ledgerGET(req("/api/labs/credential"))).json()).data;
    expect(view.history.map((c: { sequence: number }) => c.sequence)).toEqual([2, 1]);
    expect(view.latest).toMatchObject({ sequence: 2, current: true });
    expect(view.shares).toHaveLength(3);

    const notes = await listMemory("aisha");
    expect(notes.some((n) => n.source === "credential" && n.kind === "win" && /Docker/.test(n.text))).toBe(true);

    const runs = await listRuns({ agent: "evidence" });
    const signed = runs.find((r) => /verifiable credential/.test(r.purpose));
    expect(signed?.checkpoint?.kind).toBe("student-approval");
    expect(signed?.guardrails.map((g) => g.name)).toEqual(expect.arrayContaining(["disclosureMatchesConsent", "noOutboundMessaging"]));
    expect(h.emit).toHaveBeenCalledWith(expect.objectContaining({ agent: "evidence", status: "progress", message: expect.stringMatching(/Hashed \d+ proofs/) }));
  });
});

describe("share links, verification and the JWKS", () => {
  it("an employer opens the link and it verifies; tampering is caught; the student can revoke it", async () => {
    const { body } = await issue(["python"]);
    const id = body.data.shareUrl.split("=")[1];

    const shared = await (await shareGET(req(`/api/labs/credential/share/${id}`), idCtx(id))).json();
    expect(shared.data.shareId).toBe(id);

    const ok = await (await verifyPOST(post("/api/labs/credential/verify", { document: shared.data }, "recruiter"))).json();
    expect(ok.data.verdict).toBe("valid");
    expect(ok.data.issuer.trusted).toBe(true);
    expect(ok.data.disclosed).toBeGreaterThan(0);
    expect(ok.data.hidden).toBeGreaterThan(0);

    const pasted = await (await verifyPOST(post("/api/labs/credential/verify", { document: JSON.stringify(shared.data) }))).json();
    expect(pasted.data.verdict).toBe("valid");

    const forged = structuredClone(shared.data);
    forged.disclosures[0].leaf.rung = 3;
    forged.disclosures[0].leaf.rungLabel = "Can teach it";
    const bad = await (await verifyPOST(post("/api/labs/credential/verify", { document: forged }))).json();
    expect(bad.data.verdict).toBe("invalid");

    expect((await shareDELETE(req(`/api/labs/credential/share/${id}`, { method: "DELETE", uid: "tom" }), idCtx(id))).status).toBe(403);
    expect((await shareDELETE(req(`/api/labs/credential/share/${id}`, { method: "DELETE" }), idCtx(id))).status).toBe(200);
    expect((await shareGET(req(`/api/labs/credential/share/${id}`), idCtx(id))).status).toBe(404);
    const revoked = await (await verifyPOST(post("/api/labs/credential/verify", { document: shared.data }))).json();
    expect(revoked.data.verdict).toBe("invalid");
    expect(revoked.data.checks.find((c: { id: string }) => c.id === "status").ok).toBe(false);

    // The verifier's finding: renaming the share id in a saved copy used to dodge the revocation.
    for (const shareId of ["ffffffffffffffffffffffff", "x"]) {
      const renamed = await (await verifyPOST(post("/api/labs/credential/verify", { document: { ...shared.data, shareId } }))).json();
      expect(renamed.data.verdict).toBe("invalid");
      expect(renamed.data.checks.find((c: { id: string }) => c.id === "status")?.detail ?? "").not.toBe("Not revoked.");
    }
    // Trimming the revoked link's disclosures into a "smaller" link fails too.
    const trimmed = { ...structuredClone(shared.data), disclosures: shared.data.disclosures.slice(1) };
    expect((await (await verifyPOST(post("/api/labs/credential/verify", { document: trimmed }))).json()).data.verdict).toBe("invalid");
  });

  it("re-creating a link after revoking it in DEMO_MODE makes a new link and never revives the old one", async () => {
    const first = (await issue(["git", "python"])).body.data;
    const oldId = first.shareUrl.split("=")[1];
    // Same skills while the link is active: the same link comes back (no duplicate rows).
    expect((await issue(["python", "git"])).body.data.shareUrl).toBe(first.shareUrl);
    expect((await shareDELETE(req(`/api/labs/credential/share/${oldId}`, { method: "DELETE" }), idCtx(oldId))).status).toBe(200);

    const again = (await issue(["git", "python"])).body.data;
    const newId = again.shareUrl.split("=")[1];
    expect(newId).toMatch(/^[a-f0-9]{24}$/);
    expect(newId).not.toBe(oldId);
    expect((await shareGET(req(`/api/labs/credential/share/${oldId}`), idCtx(oldId))).status).toBe(404);
    const oldCheck = await (await verifyPOST(post("/api/labs/credential/verify", { document: first.share }))).json();
    expect(oldCheck.data.verdict).toBe("invalid");
    const newCheck = await (await verifyPOST(post("/api/labs/credential/verify", { document: again.share }))).json();
    expect(newCheck.data.verdict).toBe("valid");

    const view = (await (await ledgerGET(req("/api/labs/credential"))).json()).data;
    const byId = new Map(view.shares.map((x: { shareId: string; revoked: boolean }) => [x.shareId, x.revoked]));
    expect(byId.get(oldId)).toBe(true);
    expect(byId.get(newId)).toBe(false);
  });

  it("validates the verify body and the share id", async () => {
    expect((await verifyPOST(post("/api/labs/credential/verify", "not json"))).status).toBe(400);
    expect((await verifyPOST(post("/api/labs/credential/verify", { document: "{nope" }))).status).toBe(400);
    expect((await verifyPOST(post("/api/labs/credential/verify", { nothing: 1 }))).status).toBe(400);
    expect((await verifyPOST(post("/api/labs/credential/verify", { document: "x".repeat(10) + "y".repeat(200_001) }))).status).toBe(413);
    // Counted in bytes, not characters: 70k three-byte characters is 210 kB.
    expect((await verifyPOST(post("/api/labs/credential/verify", { document: "€".repeat(70_000) }))).status).toBe(413);
    // A declared Content-Length over the cap is refused before the body is read.
    const declared = new Request("http://localhost/api/labs/credential/verify", { method: "POST", body: "{}", headers: { "content-type": "application/json", "content-length": "5000000" } });
    expect((await verifyPOST(declared)).status).toBe(413);
    const junk = await (await verifyPOST(post("/api/labs/credential/verify", { document: { hello: "world" } }))).json();
    expect(junk.data.verdict).toBe("invalid");
    expect((await shareGET(req("/api/labs/credential/share/../../etc"), idCtx("../../etc"))).status).toBe(400);
    expect((await shareGET(req(`/api/labs/credential/share/${"0".repeat(24)}`), idCtx("0".repeat(24)))).status).toBe(404);
  });

  it("rate-limits anonymous checks per caller", async () => {
    const from = (ip: string) => new Request("http://localhost/api/labs/credential/verify", {
      method: "POST", body: JSON.stringify({ document: { hello: "world" } }), headers: { "content-type": "application/json", "x-forwarded-for": ip },
    });
    for (let i = 0; i < VERIFY_LIMIT; i++) expect((await verifyPOST(from("203.0.113.7"))).status).toBe(200);
    const limited = await verifyPOST(from("203.0.113.7"));
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("rate_limited");
    expect((await verifyPOST(from("198.51.100.2"))).status).toBe(200); // someone else is unaffected
  });

  it("publishes the Ed25519 public key (never the private one)", async () => {
    const res = await jwksGET();
    const jwks = await res.json();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });
    expect(jwks.keys[0].kid).toMatch(/^did:key:z6Mk.+#z6Mk/);
    expect(jwks.keys[0]).not.toHaveProperty("d");
    expect(res.headers.get("cache-control")).toContain("max-age");
  });
});
