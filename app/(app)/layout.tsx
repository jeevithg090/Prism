import { Suspense } from "react";
import { connection } from "next/server";
import { Providers } from "@/app/providers";
import { Sidebar, SidebarView } from "@/components/shell/Sidebar";
import { ReadinessPill, TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { CoachLauncher } from "@/components/coach/CoachLauncher";
import { loadGraph } from "@/lib/graph/build";
import { getViewer } from "@/lib/session";

/**
 * Server half of the readiness pill: the viewer's map from loadGraph, used until /api/graph answers.
 * connection() first: loadGraph reads the clock, and cacheComponents rejects new Date() while prerendering.
 */
async function ReadinessPillSlot() {
  await connection();
  const { userId, roleId } = await getViewer();
  let initial = null;
  try { initial = await loadGraph(userId, roleId); } catch { initial = null; }
  return <ReadinessPill userId={userId} roleId={roleId} initial={initial} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-xl bg-board px-4 py-2 text-board-type focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh w-full flex-1 max-md:[--mobile-nav-height:4rem]">
        <Suspense fallback={<SidebarView pathname={null} viewerId="aisha" />}>
          <Sidebar />
        </Suspense>
        {/* The sidebar is fixed, so the column reserves its width instead of a second sticky top:0. */}
        <div className="flex min-w-0 flex-1 flex-col md:pl-(--sidebar-rail) lg:pl-(--sidebar-width)">
          <TopBar
            readiness={
              <Suspense fallback={null}>
                <ReadinessPillSlot />
              </Suspense>
            }
          />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none max-md:pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+6rem)] md:px-8 md:pt-8 md:pb-24"
          >
            {children}
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <MobileNav />
      </Suspense>
      {/* Ask Keystone on every app page; under 768px it rides above the bottom tab bar. */}
      <div className="max-md:[&>button]:bottom-[calc(var(--mobile-nav-height,4rem)+env(safe-area-inset-bottom)+1rem)]">
        {/* CoachLauncher reads usePathname(), so it streams in after prerender instead of blocking it. */}
        <Suspense fallback={null}>
          <CoachLauncher />
        </Suspense>
      </div>
    </Providers>
  );
}
