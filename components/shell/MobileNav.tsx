"use client";
// App shell under 768px: a bottom tab bar (4 primary pages + More) with 44px+ targets.
// It publishes its height as --mobile-nav-height on <body> so sticky CTAs (pods) can sit above it.
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { useViewerId } from "@/components/community/useViewerId";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { LAUNCH_NAV, STAFF_NAV, isActive, primaryNav, type NavItem } from "./Sidebar";

const TAB_IDS = ["dashboard", "map", "roadmap", "pods"];

function useMobileNavHeight(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof document === "undefined") return;
    const body = document.body;
    const publish = () => body.style.setProperty("--mobile-nav-height", `${el.offsetHeight}px`);
    publish();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
      body.style.removeProperty("--mobile-nav-height");
    };
  }, [ref]);
}

function Tab({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium text-muted-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        active && "font-semibold text-foreground",
      )}
    >
      {active && <span aria-hidden className="absolute inset-x-5 -top-2 h-[3px] rounded-b-sm bg-primary" />}
      <Icon className={cn("size-5", active && "text-primary")} aria-hidden />
      {item.short ?? item.label}
    </Link>
  );
}

export function MobileNavView({ pathname, viewerId }: { pathname: string | null; viewerId: string }) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const bar = React.useRef<HTMLDivElement>(null);
  useMobileNavHeight(bar);
  const all = primaryNav(viewerId);
  const tabs = all.filter((i) => TAB_IDS.includes(i.id));
  const rest = all.filter((i) => !TAB_IDS.includes(i.id));
  const moreActive = [...rest, ...STAFF_NAV].some((i) => isActive(pathname, i));

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-(--z-sticky-nav) border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <div ref={bar} className="grid h-16 grid-cols-5 gap-1 px-2 py-2">
        {tabs.map((item) => <Tab key={item.id} item={item} active={isActive(pathname, item)} />)}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium text-muted-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            moreActive && "font-semibold text-foreground",
          )}
        >
          {moreActive && <span aria-hidden className="absolute inset-x-5 -top-2 h-[3px] rounded-b-sm bg-primary" />}
          <Ellipsis className={cn("size-5", moreActive && "text-primary")} aria-hidden />
          More
        </button>
      </div>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-sidebar pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>More pages</SheetTitle>
            <SheetDescription>Everything else in Keystone.</SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-2 gap-2 px-4">
            {rest.map((item) => <MoreLink key={item.id} item={item} active={isActive(pathname, item)} onClick={() => setMoreOpen(false)} />)}
          </ul>
          <p className="px-4 pt-2 text-sm font-medium text-muted-foreground">For staff &amp; judges</p>
          <ul className="grid grid-cols-2 gap-2 px-4">
            {STAFF_NAV.map((item) => <MoreLink key={item.id} item={item} active={isActive(pathname, item)} onClick={() => setMoreOpen(false)} />)}
          </ul>
          <ul className="grid grid-cols-2 gap-2 px-4">
            <MoreLink item={LAUNCH_NAV} active={isActive(pathname, LAUNCH_NAV)} onClick={() => setMoreOpen(false)} />
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function MoreLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-xl bg-card px-3 text-sm font-medium text-foreground shadow-stock outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active && "font-semibold ring-1 ring-primary/50",
        )}
      >
        <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
        {item.label}
      </Link>
    </li>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const viewerId = useViewerId();
  return <MobileNavView pathname={pathname} viewerId={viewerId} />;
}
