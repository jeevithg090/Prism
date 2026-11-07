import { Suspense } from "react";
import { Providers } from "@/app/providers";
import { Sidebar, SidebarView } from "@/components/shell/Sidebar";
import { ReadinessPill, TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { loadGraph } from "@/lib/graph/build";
import { getViewer } from "@/lib/session";

/** Server half of the readiness pill: the viewer's map from loadGraph, used until /api/graph answers. */
async function ReadinessPillSlot() {
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
        className="sr-only z-50 rounded-xl bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh w-full flex-1 max-md:[--mobile-nav-height:4rem]">
        <Suspense fallback={<SidebarView pathname={null} viewerId="aisha" />}>
          <Sidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
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
            className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none max-md:pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+2rem)] md:px-8 md:py-8"
          >
            {children}
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <MobileNav />
      </Suspense>
    </Providers>
  );
}
