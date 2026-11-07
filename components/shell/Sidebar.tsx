"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, HeartHandshake, LayoutDashboard, Mic, Milestone, Network, Radar, Route, Users } from "lucide-react";

const items = [
  ["Dashboard", "/dashboard", LayoutDashboard], ["Bridge Map", "/map", Network],
  ["Roadmap", "/roadmap", Route], ["Industry Radar", "/market", Radar], ["Pods", "/pods", Users],
  ["Trajectories", "/trajectories", Milestone], ["Community", "/community", HeartHandshake],
  ["Interview", "/interview", Mic], ["Passport", "/profile/aisha", BadgeCheck],
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="hidden w-16 shrink-0 border-r border-border bg-card md:flex md:flex-col xl:w-60">
    <Link href="/dashboard" className="flex h-16 items-center gap-3 px-4 font-semibold" aria-label="Keystone home">
      <svg viewBox="0 0 32 32" className="size-8 text-primary" aria-hidden="true"><path d="M4 28V16a12 12 0 0 1 24 0v12M10 28V16a6 6 0 0 1 12 0v12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
      <span className="hidden xl:inline">Keystone</span>
    </Link>
    <nav className="flex-1 space-y-1 px-2" aria-label="Main navigation">{items.map(([label, href, Icon]) => {
      const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} title={label} className={`relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm ${active ? "bg-primary/10 font-medium text-primary before:absolute before:inset-y-2 before:-left-2 before:w-[3px] before:rounded-full before:bg-primary" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
        <Icon size={19} aria-hidden="true"/><span className="hidden xl:inline">{label}</span>
      </Link>;
    })}</nav>
    <p className="hidden px-4 py-4 text-xs text-muted-foreground xl:block">Reply · AI on Campus</p>
  </aside>;
}
