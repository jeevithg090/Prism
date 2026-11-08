"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { avatarTone, initials, type MemberInfo } from "./members";

const SIZE = { xs: "size-7", sm: "size-8", md: "size-10", lg: "size-12", xl: "size-16" } as const;
const TEXT = { xs: "text-xs", sm: "text-xs", md: "text-sm", lg: "text-base", xl: "text-xl" } as const;

export type AvatarSize = keyof typeof SIZE;

/** A member's photo, or their initials in a coloured circle. Always announced by name. */
export function MemberAvatar({ member, size = "md", className }: { member: MemberInfo; size?: AvatarSize; className?: string }) {
  return (
    <Avatar role="img" aria-label={member.name} title={member.name} className={cn(SIZE[size], className)}>
      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.name} />}
      <AvatarFallback aria-hidden className={cn("font-semibold", TEXT[size], avatarTone(member.id))}>
        {initials(member.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Overlapping avatars for a pod, labelled with everyone's names. */
export function AvatarStack({ members, size = "md", className, label }: { members: MemberInfo[]; size?: AvatarSize; className?: string; label?: string }) {
  const names = members.map((m) => m.firstName).join(", ");
  return (
    <div role="group" aria-label={label ?? `Pod members: ${names}`} className={cn("flex -space-x-2", className)}>
      {members.map((m) => (
        <MemberAvatar key={m.id} member={m} size={size} className="ring-2 ring-card" />
      ))}
    </div>
  );
}
