"use client";
import { BadgePill, SkillChip } from "@/components/keystone";
import { skillName } from "@/lib/schemas/community";
import type { PodMember } from "@/lib/types";
import { MemberAvatar } from "./MemberAvatar";
import type { MemberInfo } from "./members";

/** One pod member: avatar, name, badges, then what they learn and what they teach. Render inside a <ul>. */
export function MemberRow({ member, info, isViewer = false }: { member: PodMember; info: MemberInfo; isViewer?: boolean }) {
  return (
    <li data-testid="member-row" className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <MemberAvatar member={info} size="lg" className={isViewer ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : undefined} />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-lg leading-tight font-semibold">{info.name}</p>
          {isViewer && (
            <span className="inline-flex h-6 items-center rounded-md border border-primary/45 px-1.5 text-xs font-medium text-primary">
              You
            </span>
          )}
          {info.year !== undefined && <span className="text-sm text-muted-foreground">Year {info.year}</span>}
          {info.badges.map((b) => (
            <BadgePill key={b} badge={b} />
          ))}
        </div>
        <dl className="grid grid-cols-1 items-start gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-y-2 lg:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_minmax(0,1fr)]">
          <dt className="font-medium text-muted-foreground sm:pt-1">Learns:</dt>
          <dd className="flex flex-wrap gap-2">
            {member.learns.length ? (
              member.learns.map((s) => <SkillChip key={`l-${s}`} skillId={s} name={skillName(s)} status="gap" />)
            ) : (
              <span className="pt-1 text-muted-foreground">Nothing yet</span>
            )}
          </dd>
          <dt className="mt-1.5 font-medium text-muted-foreground sm:mt-0 sm:pt-1">Teaches:</dt>
          <dd className="flex flex-wrap gap-2">
            {member.teaches.length ? (
              member.teaches.map((s) => <SkillChip key={`t-${s}`} skillId={s} name={skillName(s)} status="proven" />)
            ) : (
              <span className="pt-1 text-muted-foreground">Nothing yet</span>
            )}
          </dd>
        </dl>
      </div>
    </li>
  );
}
