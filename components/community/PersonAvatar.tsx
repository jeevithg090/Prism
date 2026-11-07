"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/lib/types";
import { displayName } from "./help";

/** Avatar with alt text and initials fallback. */
export function PersonAvatar({ userId, profile }: { userId: string; profile?: Profile }) {
  const name = displayName(userId, profile);
  const initials = name.split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join("").toUpperCase();
  return (
    <Avatar size="lg">
      {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={`${name}'s avatar`} />}
      <AvatarFallback className="bg-muted text-sm font-semibold text-foreground" aria-hidden>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
