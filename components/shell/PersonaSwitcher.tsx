"use client";
// Demo persona switcher: Aisha plus the 12 seeded students. Choosing one sets the ks_uid cookie and refreshes.
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import aisha from "@/data/fixtures/profile.aisha.json";
import students from "@/data/seed/students.json";
import { BadgePill } from "@/components/keystone";
import { MemberAvatar } from "@/components/pods/MemberAvatar";
import { useViewerId } from "@/components/community/useViewerId";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uidCookie } from "@/lib/session-cookie";
import type { BadgeId } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Persona = { id: string; name: string; firstName: string; year?: number; badges: BadgeId[]; avatarUrl?: string };

type RawProfile = { id: string; name: string; year?: number; badges?: string[]; avatarUrl?: string };
function toPersona(p: RawProfile): Persona {
  return { id: p.id, name: p.name, firstName: p.name.split(/\s+/)[0] || p.name, year: p.year, badges: (p.badges ?? []) as BadgeId[], avatarUrl: p.avatarUrl };
}

/** Aisha first, then the seeded cast in seed order. */
export const PERSONAS: Persona[] = (() => {
  try {
    return [aisha as RawProfile, ...(students as RawProfile[])].map(toPersona);
  } catch {
    return [toPersona(aisha as RawProfile)];
  }
})();

export function personaById(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? { id, name: id[0]?.toUpperCase() + id.slice(1), firstName: id[0]?.toUpperCase() + id.slice(1), badges: [] };
}

export function PersonaSwitcher({ className }: { className?: string }) {
  const viewerId = useViewerId();
  const router = useRouter();
  const me = personaById(viewerId);

  const choose = (id: string) => {
    if (id === viewerId) return;
    document.cookie = uidCookie(id);
    // ?demo=1 would sign straight back in as Aisha, so drop it and reload without it.
    const url = new URL(window.location.href);
    if (url.searchParams.has("demo")) {
      url.searchParams.delete("demo");
      window.location.replace(url.pathname + url.search + url.hash);
      return;
    }
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-12 min-w-0 cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl px-2 text-left outline-none transition-[background-color] duration-(--dur-short) hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-expanded:bg-muted",
          className,
        )}
      >
        <span className="sr-only">Viewing as</span>{" "}
        <span aria-hidden className="shrink-0"><MemberAvatar member={me} size="sm" /></span>
        <span className="min-w-0 sm:shrink-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            <span className="sm:hidden">{me.firstName}</span>
            <span className="hidden sm:inline">{me.name}</span>
          </span>{" "}
          <span className="hidden truncate text-xs text-muted-foreground sm:block">{me.year ? `Year ${me.year}, switch student` : "Switch student"}</span>
        </span>{" "}
        {me.badges.length > 0 && (
          <span className="hidden shrink-0 items-center gap-1 xl:flex">
            {me.badges.slice(0, 2).map((b) => <React.Fragment key={b}><BadgePill badge={b} />{" "}</React.Fragment>)}
          </span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-1.5 shadow-lg">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs">View Keystone as a demo student</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={viewerId} onValueChange={(v) => choose(String(v))}>
            {PERSONAS.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id} className="min-h-11 gap-2.5 rounded-lg py-1.5 pl-2">
                <span aria-hidden className="shrink-0"><MemberAvatar member={p} size="sm" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>{" "}
                  {(p.year || p.badges.length > 0) && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {p.year && <span>Year {p.year}</span>}{" "}
                      {p.badges.map((b) => <React.Fragment key={b}><BadgePill badge={b} />{" "}</React.Fragment>)}
                    </span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
