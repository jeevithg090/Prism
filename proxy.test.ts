import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, decide, isOpenPath, proxy } from "./proxy";

describe("decide (pure proxy policy)", () => {
  it("?demo=1 signs in as Aisha on any path, with or without a cookie", () => {
    expect(decide({ pathname: "/dashboard", demo: "1", uid: undefined })).toEqual({ kind: "demo" });
    expect(decide({ pathname: "/pods", demo: "1", uid: "priya" })).toEqual({ kind: "demo" });
    expect(decide({ pathname: "/", demo: "1", uid: undefined })).toEqual({ kind: "demo" });
  });

  it("sends app pages without a session to /onboard", () => {
    for (const p of ["/dashboard", "/map", "/roadmap", "/pods/pod_other", "/community"]) {
      expect(decide({ pathname: p, demo: null, uid: undefined })).toEqual({ kind: "redirect", to: "/onboard" });
    }
  });

  it("a shared deep link to the demo pod opens the demo session instead of onboarding", () => {
    expect(decide({ pathname: "/pods/pod_demo01", demo: null, uid: undefined })).toEqual({ kind: "demo" });
    expect(decide({ pathname: "/pods/pod_demo01", demo: null, uid: "priya" })).toEqual({ kind: "next" });
  });

  it("lets a signed-in student through", () => {
    expect(decide({ pathname: "/dashboard", demo: null, uid: "aisha" })).toEqual({ kind: "next" });
    expect(decide({ pathname: "/map", demo: null, uid: "priya" })).toEqual({ kind: "next" });
  });

  it("never redirects the open pages, the API or static files", () => {
    for (const p of ["/", "/onboard", "/onboard/step-2", "/launch", "/lecturer", "/governance", "/profile/aisha", "/api/graph/aisha", "/favicon.ico", "/_next/static/chunks/a.js", "/logo.svg"]) {
      expect(isOpenPath(p)).toBe(true);
      expect(decide({ pathname: p, demo: null, uid: undefined })).toEqual({ kind: "next" });
    }
    expect(isOpenPath("/onboarding-tips")).toBe(false);
  });

  it("treats a malformed cookie as no session", () => {
    expect(decide({ pathname: "/dashboard", demo: null, uid: "../../etc/passwd" })).toEqual({ kind: "redirect", to: "/onboard" });
    expect(decide({ pathname: "/dashboard", demo: null, uid: "" })).toEqual({ kind: "redirect", to: "/onboard" });
  });
});

describe("proxy", () => {
  it("?demo=1 sets the cookie ks_uid=aisha (path /, 7 days) and continues", () => {
    const res = proxy(new NextRequest("http://localhost:3000/dashboard?demo=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.cookies.get("ks_uid")?.value).toBe("aisha");
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toContain("ks_uid=aisha");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=604800");
  });

  it("?demo=1 overrides another student's cookie for this request too", () => {
    const req = new NextRequest("http://localhost:3000/pods?demo=1", { headers: { cookie: "ks_uid=priya" } });
    const res = proxy(req);
    expect(res.cookies.get("ks_uid")?.value).toBe("aisha");
    expect(req.cookies.get("ks_uid")?.value).toBe("aisha");
  });

  it("redirects /map without a cookie to /onboard", () => {
    const res = proxy(new NextRequest("http://localhost:3000/map"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/onboard");
  });

  it("passes a signed-in request through untouched", () => {
    const res = proxy(new NextRequest("http://localhost:3000/map", { headers: { cookie: "ks_uid=aisha" } }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("matches pages but not the API or files", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/dashboard")).toBe(true);
    expect(re.test("/api/graph/aisha")).toBe(false);
    expect(re.test("/favicon.ico")).toBe(false);
  });
});
