import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStore } from "@/lib/store";
import { joinWaitlist, type WaitlistEntry } from "./waitlist";

async function clearWaitlist() {
  const store = getStore();
  const rows = await store.list<WaitlistEntry>("waitlist");
  await Promise.all(rows.map((r) => store.remove("waitlist", r.id)));
}

describe("joinWaitlist", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearWaitlist();
  });

  it.each(["", "   ", "not-an-email", "aisha@", "@manchester.ac.uk", "aisha@@uni.ac.uk", "a b@uni.ac.uk"])(
    "rejects the invalid email %j and stores nothing",
    async (email) => {
      const res = await joinWaitlist(email, true);
      expect(res.ok).toBe(false);
      expect(res.field).toBe("email");
      expect(res.error).toMatch(/valid email/i);
      expect(await getStore().list("waitlist")).toHaveLength(0);
    },
  );

  it("rejects a valid email when consent is missing", async () => {
    const res = await joinWaitlist("aisha@student.manchester.ac.uk", false);
    expect(res).toMatchObject({ ok: false, field: "consent" });
    expect(res.error).toMatch(/tick the box/i);
    expect(await getStore().list("waitlist")).toHaveLength(0);
  });

  it("rejects a non-boolean consent value sent by a tampered client", async () => {
    const res = await joinWaitlist("aisha@student.manchester.ac.uk", "yes" as unknown as boolean);
    expect(res.ok).toBe(false);
    expect(res.field).toBe("consent");
  });

  it("stores a valid signup under the trimmed, lowercased email", async () => {
    const res = await joinWaitlist("  Aisha.Khan@Student.Manchester.ac.uk ", true);
    expect(res).toEqual({ ok: true });
    const row = await getStore().get<WaitlistEntry>("waitlist", "aisha.khan@student.manchester.ac.uk");
    expect(row).toMatchObject({
      id: "aisha.khan@student.manchester.ac.uk",
      email: "aisha.khan@student.manchester.ac.uk",
      consent: true,
      role: "student",
    });
    expect(Number.isNaN(Date.parse(row!.createdAt))).toBe(false);
  });

  it("does not create duplicates and never downgrades an ambassador", async () => {
    await joinWaitlist("sam@uni.ac.uk", true, "ambassador");
    const first = await getStore().get<WaitlistEntry>("waitlist", "sam@uni.ac.uk");
    await joinWaitlist("SAM@uni.ac.uk", true, "student");
    const rows = await getStore().list<WaitlistEntry>("waitlist");
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("ambassador");
    expect(rows[0].createdAt).toBe(first!.createdAt);
  });

  it("falls back to the student role for an unknown role", async () => {
    await joinWaitlist("lee@uni.ac.uk", true, "admin" as unknown as "student");
    expect((await getStore().get<WaitlistEntry>("waitlist", "lee@uni.ac.uk"))?.role).toBe("student");
  });

  it("returns a kind error instead of throwing when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(getStore(), "upsert").mockRejectedValueOnce(new Error("db down"));
    const res = await joinWaitlist("aisha@uni.ac.uk", true);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/try again/i);
  });
});
