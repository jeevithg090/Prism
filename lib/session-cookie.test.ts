import { describe, expect, it } from "vitest";
import { DEMO_UID, UID_COOKIE, UID_MAX_AGE_S, safeUserId, uidCookie } from "./session-cookie";

describe("safeUserId", () => {
  it("accepts plain ids", () => {
    expect(safeUserId("aisha")).toBe("aisha");
    expect(safeUserId("user_01-B")).toBe("user_01-B");
  });

  it("rejects missing, empty and malformed values", () => {
    for (const v of [undefined, null, "", "%E0%A4%A", "-leading-dash", "a".repeat(65)]) expect(safeUserId(v)).toBeNull();
  });

  it("rejects anything that could escape a file path or URL segment, even when percent-encoded", () => {
    for (const v of ["../etc/passwd", "..%2F..%2Fsecret", "a/b", "a b", "a%00b", "<script>", "a.json"]) expect(safeUserId(v)).toBeNull();
  });

  it("decodes a percent-encoded but otherwise safe id", () => {
    expect(safeUserId(encodeURIComponent("ben_2"))).toBe("ben_2");
  });
});

describe("uidCookie", () => {
  it("builds a lax, site-wide cookie that round-trips through safeUserId", () => {
    const c = uidCookie(DEMO_UID);
    expect(c).toBe(`${UID_COOKIE}=${DEMO_UID}; path=/; max-age=${UID_MAX_AGE_S}; samesite=lax`);
    const value = c.split(";")[0].split("=")[1];
    expect(safeUserId(value)).toBe(DEMO_UID);
  });
});
