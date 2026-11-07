"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MoreHorizontal, Network, Route, Users } from "lucide-react";
const primary = [["Home", "/dashboard", LayoutDashboard], ["Map", "/map", Network], ["Roadmap", "/roadmap", Route], ["Pods", "/pods", Users]] as const;
export function MobileNav() {
  const pathname = usePathname();
  return <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card p-1 md:hidden">{primary.map(([label,href,Icon])=><Link key={href} href={href} aria-current={pathname===href?"page":undefined} className="grid min-h-12 place-items-center rounded-lg text-[11px]"><Icon size={18}/>{label}</Link>)}<details className="relative"><summary className="grid min-h-12 cursor-pointer list-none place-items-center rounded-lg text-[11px]"><MoreHorizontal size={18}/>More</summary><div className="absolute bottom-14 right-0 w-48 rounded-xl border border-border bg-card p-2 shadow-xl">{[["Industry Radar","/market"],["Trajectories","/trajectories"],["Community","/community"],["Interview","/interview"],["Passport","/profile/aisha"]].map(([label,href])=><Link key={href} href={href} className="block rounded-lg px-3 py-3 text-sm hover:bg-background">{label}</Link>)}</div></details></nav>;
}
