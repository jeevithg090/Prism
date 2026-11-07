import "server-only";
import { cookies } from "next/headers";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { DEMO_UID, UID_COOKIE, safeUserId } from "@/lib/session-cookie";

export { DEMO_UID, UID_COOKIE } from "@/lib/session-cookie";

/** The signed-in student's id from the `ks_uid` cookie (the demo user when there is none). Server only. */
export async function getCurrentUserId(): Promise<string> {
  const jar = await cookies();
  return safeUserId(jar.get(UID_COOKIE)?.value) ?? DEMO_UID;
}

export const DEFAULT_ROLE_ID = "ml-engineer";

/** The student's primary target role (first of `dna.targetRoles`), sanitised like a user id. */
export function primaryRoleId(profile: Profile | null | undefined): string {
  return safeUserId(profile?.dna?.targetRoles?.[0]) ?? DEFAULT_ROLE_ID;
}

export type Viewer = { userId: string; profile: Profile | null; roleId: string };

/** The current student, their profile from the store (null if unknown) and their primary role. */
export async function getViewer(): Promise<Viewer> {
  const userId = await getCurrentUserId();
  let profile: Profile | null = null;
  try { profile = (await getStore().get<Profile>("profiles", userId)) ?? null; } catch { profile = null; }
  return { userId, profile, roleId: primaryRoleId(profile) };
}
