import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard", "/map", "/roadmap", "/profile", "/market", "/pods", "/trajectories", "/community", "/interview"];
export function proxy(request: NextRequest) {
  const demo = request.nextUrl.searchParams.get("demo") === "1";
  const response = NextResponse.next();
  if (demo) response.cookies.set("ks_uid", "aisha", { path: "/", maxAge: 60 * 60 * 24 * 7 });
  const path = request.nextUrl.pathname;
  const protectedPath = protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (protectedPath && !request.cookies.has("ks_uid") && !demo) {
    const url = request.nextUrl.clone(); url.pathname = "/onboard"; url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
