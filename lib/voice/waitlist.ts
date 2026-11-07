"use server";

import { z } from "zod";
import { getStore } from "@/lib/store";

// Server action for the /launch campaign (P4 PR6). Exports only async functions;
// types are erased at compile time, so exporting them is safe in a "use server" file.

export type WaitlistRole = "student" | "ambassador";

export type WaitlistResult = {
  ok: boolean;
  error?: string;
  /** Which field the error belongs to, so the form can show it inline. */
  field?: "email" | "consent";
};

export type WaitlistEntry = {
  id: string;
  email: string;
  consent: true;
  role: WaitlistRole;
  createdAt: string;
};

const EmailZ = z.string().trim().toLowerCase().pipe(z.email().max(254));
const RoleZ = z.enum(["student", "ambassador"]);

const EMAIL_ERROR = "Please enter a valid email address, like name@student.manchester.ac.uk.";
const CONSENT_ERROR = "Please tick the box so we're allowed to email you about Bridge Week.";
const SAVE_ERROR = "We couldn't save your place just now. Please try again in a moment.";

export async function joinWaitlist(
  email: string,
  consent: boolean,
  role: WaitlistRole = "student",
): Promise<WaitlistResult> {
  const parsedEmail = EmailZ.safeParse(email);
  if (!parsedEmail.success) return { ok: false, error: EMAIL_ERROR, field: "email" };
  if (consent !== true) return { ok: false, error: CONSENT_ERROR, field: "consent" };
  const parsedRole = RoleZ.safeParse(role);
  const wantedRole: WaitlistRole = parsedRole.success ? parsedRole.data : "student";

  const id = parsedEmail.data;
  try {
    const store = getStore();
    const existing = await store.get<WaitlistEntry>("waitlist", id);
    const entry: WaitlistEntry = {
      id,
      email: id,
      consent: true,
      // Signing up twice never downgrades an ambassador back to a student.
      role: existing?.role === "ambassador" ? "ambassador" : wantedRole,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await store.upsert("waitlist", id, entry);
    return { ok: true };
  } catch (err) {
    console.error("[waitlist] save failed", err);
    return { ok: false, error: SAVE_ERROR };
  }
}
