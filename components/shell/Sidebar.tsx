"use client";
// App shell: the left sidebar (contract §9.4). w-64 with labels on lg, icons only on md, hidden on mobile (MobileNav takes over).
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Mic,
  Milestone,
  Network,
  Radar,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useViewerId } from "@/components/community/useViewerId";
import { cn } from "@/lib/utils";

export type NavItem = { id: string; label: string; short?: string; href: string; icon: LucideIcon; match?: string };

/** Student pages, in demo order. The Passport link points at the viewer's own passport. */
export function primaryNav(viewerId: string): NavItem[] {
  return [
    { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { id: "map", label: "Bridge Map", short: "Map", href: "/map", icon: Network },
    { id: "roadmap", label: "Roadmap", href: "/roadmap", icon: Route },
    { id: "market", label: "Industry Radar", href: "/market", icon: Radar },
    { id: "pods", label: "Pods", href: "/pods", icon: Users },
    { id: "trajectories", label: "Trajectories", href: "/trajectories", icon: Milestone },
    { id: "community", label: "Community", href: "/community", icon: HeartHandshake },
    { id: "coach", label: "Coach", href: "/coach", icon: Sparkles },
    { id: "interview", label: "Interview", href: "/interview", icon: Mic },
    { id: "passport", label: "Passport", href: `/profile/${encodeURIComponent(viewerId)}`, icon: BadgeCheck, match: "/profile" },
  ];
}

export const STAFF_NAV: NavItem[] = [
  { id: "lecturer", label: "Lecturer Insights", href: "/lecturer", icon: GraduationCap },
  { id: "governance", label: "Agents & governance", href: "/governance", icon: ShieldCheck },
];

/** A nav item is active on its own path and everything below it (/pods/pod_1 keeps Pods active). */
export function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  const base = item.match ?? item.href;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The Keystone arch: five voussoirs on two piers, the keystone at the crown in full strength. */
export function KeystoneMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground", className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-6" fill="currentColor" focusable="false">
        <g opacity="0.6">
          <path d="M4 19A12 12 0 0 1 5.99 12.38L10.58 15.41A6.5 6.5 0 0 0 9.5 19Z" />
          <path d="M6.61 11.53A12 12 0 0 1 11.8 7.76L13.72 12.91A6.5 6.5 0 0 0 10.91 14.95Z" />
          <path d="M20.2 7.76A12 12 0 0 1 25.39 11.53L21.09 14.95A6.5 6.5 0 0 0 18.28 12.91Z" />
          <path d="M26.01 12.38A12 12 0 0 1 28 19L22.5 19A6.5 6.5 0 0 0 21.42 15.41Z" />
          <path d="M4 20.5h5.5V28H4zM22.5 20.5H28V28h-5.5z" />
        </g>
        <path d="M12.79 7.44A12 12 0 0 1 19.21 7.44L17.74 12.74A6.5 6.5 0 0 0 14.26 12.74Z" />
      </svg>
    </span>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={item.label}
        className={cn(
          "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors outline-none",
          "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:justify-center lg:justify-start",
          active && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-primary" />}
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className="truncate md:sr-only lg:not-sr-only">{item.label}</span>
      </Link>
    </li>
  );
}

export function SidebarView({ pathname, viewerId }: { pathname: string | null; viewerId: string }) {
  const main = primaryNav(viewerId);
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card md:flex md:w-16 lg:w-64">
      <Link
        href="/dashboard"
        className="mx-3 mt-4 mb-2 flex h-11 items-center gap-2.5 rounded-xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring md:mx-auto md:px-0 lg:mx-3 lg:px-1"
      >
        <KeystoneMark />
        <span className="text-lg font-semibold tracking-tight md:sr-only lg:not-sr-only">Keystone</span>
      </Link>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {main.map((item) => <NavLink key={item.id} item={item} active={isActive(pathname, item)} />)}
        </ul>
        <div className="mt-6 border-t pt-4">
          <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:sr-only lg:not-sr-only">For staff &amp; judges</p>
          <ul className="space-y-1">
            {STAFF_NAV.map((item) => <NavLink key={item.id} item={item} active={isActive(pathname, item)} />)}
          </ul>
        </div>
      </nav>
      <p className="border-t px-6 py-4 text-xs font-medium text-muted-foreground md:hidden lg:block">Reply · AI on Campus</p>
    </aside>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const viewerId = useViewerId();
  return <SidebarView pathname={pathname} viewerId={viewerId} />;
}
