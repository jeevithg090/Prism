"use client";
import { BadgePill, SkillChip } from "@/components/keystone";
import { skillName } from "@/lib/schemas/community";
import type { PodMember } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./MemberAvatar";
import type { MemberInfo } from "./members";

/** One pod member: avatar, name, badges, and "Learns: … · Teaches: …". Render inside a <ul>. */
export function MemberRow({ member, info, isViewer = false }: { member: PodMember; info: MemberInfo; isViewer?: boolean }) {
  return (
    <li data-testid="member-row" className={cn("flex gap-4 py-5 first:pt-0 last:pb-0")}>
      <MemberAvatar member={info} size="lg" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg leading-tight font-semibold">{info.name}</p>
          {isViewer && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[13px] font-medium text-primary">You</span>
          )}
          {info.year !== undefined && <span className="text-sm text-muted-foreground">Year {info.year}</span>}
          {info.badges.map((b) => (
            <BadgePill key={b} badge={b} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          <span className="font-medium text-muted-foreground">Learns:</span>
          {member.learns.length ? (
            member.learns.map((s) => <SkillChip key={`l-${s}`} skillId={s} name={skillName(s)} status="gap" />)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          <span aria-hidden className="px-1 text-muted-foreground">·</span>
          <span className="font-medium text-muted-foreground">Teaches:</span>
          {member.teaches.length ? (
            member.teaches.map((s) => <SkillChip key={`t-${s}`} skillId={s} name={skillName(s)} status="proven" />)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>
    </li>
  );
}
