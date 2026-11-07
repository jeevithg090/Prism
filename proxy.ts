// Next 16 Proxy (formerly middleware): the demo session.
// - `?demo=1` on any page signs in as Aisha (cookie ks_uid=aisha, path /, 7 days).
// - The demo pod's deep link (/pods/pod_demo01) without a session also signs in as Aisha.
// - Other app pages without a session go to /onboard. The landing, onboarding, the launch campaign,
//   staff pages (lecturer, governance), shareable Skill Passports, the API and static files stay open.
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_UID, UID_COOKIE, UID_MAX_AGE_S, safeUserId } from "@/lib/session-cookie";

const OPEN_PATHS = ["/onboard", "/launch", "/lecturer", "/governance", "/profile", "/api", "/_next"];
const STATIC_FILE = /\.[a-z0-9]+$/i;
/** The seeded demo pod: a shared deep link to it opens Aisha's demo session, never the onboarding wizard. */
const DEMO_POD_PATH = "/pods/pod_demo01";

export function isOpenPath(pathname: string): boolean {
  if (pathname === "/" || STATIC_FILE.test(pathname)) return true;
  return OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type ProxyDecision =
  | { kind: "demo" } // set ks_uid=aisha and continue
  | { kind: "redirect"; to: string }
  | { kind: "next" };

/** The whole proxy policy as a pure function (unit-tested in proxy.test.ts). */
export function decide({ pathname, demo, uid }: { pathname: string; demo: string | null; uid: string | undefined }): ProxyDecision {
  if (demo === "1") return { kind: "demo" };
  if (safeUserId(uid) || isOpenPath(pathname)) return { kind: "next" };
  if (pathname === DEMO_POD_PATH || pathname.startsWith(`${DEMO_POD_PATH}/`)) return { kind: "demo" };
  return { kind: "redirect", to: "/onboard" };
}

export function proxy(request: NextRequest) {
  const d = decide({
    pathname: request.nextUrl.pathname,
    demo: request.nextUrl.searchParams.get("demo"),
    uid: request.cookies.get(UID_COOKIE)?.value,
  });
  if (d.kind === "redirect") return NextResponse.redirect(new URL(d.to, request.url));
  if (d.kind === "demo") {
    // Rewrite the incoming cookie too, so this very render already sees Aisha.
    request.cookies.set(UID_COOKIE, DEMO_UID);
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.cookies.set(UID_COOKIE, DEMO_UID, { path: "/", maxAge: UID_MAX_AGE_S, sameSite: "lax" });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: skip the API, Next internals and files with an extension.
  matcher: ["/((?!api/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
