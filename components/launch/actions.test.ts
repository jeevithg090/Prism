import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => h.docs.get(`${c}/${id}`) ?? null,
    list: async (c: string) => [...h.docs.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, d]) => d),
    upsert: async (c: string, id: string, doc: unknown) => { h.docs.set(`${c}/${id}`, doc); return doc; },
    remove: async () => {},
  }),
}));

import { joinWaitlist } from "./actions";

const form = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };
const idle = { status: "idle" as const, message: "" };
beforeEach(() => h.docs.clear());

describe("joinWaitlist", () => {
  it("rejects an invalid email and a missing consent without storing anything", async () => {
    const r = await joinWaitlist(idle, form({ email: "not-an-email", campus: "manchester" }));
    expect(r.status).toBe("error");
    expect(r.fieldErrors?.email).toMatch(/email/i);
    expect(r.fieldErrors?.consent).toBeTruthy();
    expect(h.docs.size).toBe(0);
  });
  it("rejects an unknown campus", async () => {
    const r = await joinWaitlist(idle, form({ email: "a@b.ac.uk", campus: "atlantis", consent: "on" }));
    expect(r.fieldErrors?.campus).toBeTruthy();
  });
  it("stores a normalised email once per address and counts the campus", async () => {
    const r1 = await joinWaitlist(idle, form({ email: "  Aisha@Student.Manchester.ac.uk ", campus: "manchester", consent: "on", ambassador: "on" }));
    expect(r1).toMatchObject({ status: "ok", campusCount: 1 });
    expect(r1.message).toContain("Manchester");
    expect(r1.message).toContain("ambassador");
    const r2 = await joinWaitlist(idle, form({ email: "aisha@student.manchester.ac.uk", campus: "manchester", consent: "on" }));
    expect(r2.campusCount).toBe(1);
    const rows = [...h.docs.values()] as { email: string; campus: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "aisha@student.manchester.ac.uk", campus: "manchester" });
  });
});
