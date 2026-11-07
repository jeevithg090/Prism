"use server";
// Bridge Week waitlist: stored in the `waitlist` collection only. Keystone never emails anyone from here.
import { createHash } from "node:crypto";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { CAMPUS_IDS, CAMPUSES } from "./data";

export type WaitlistState = {
  status: "idle" | "ok" | "error";
  message: string;
  fieldErrors?: { email?: string; campus?: string; consent?: string };
  campusCount?: number;
};

const WaitlistZ = z.object({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("Enter an email address like name@student.manchester.ac.uk")),
  campus: z.enum(CAMPUS_IDS, { message: "Choose your campus" }),
  ambassador: z.boolean(),
  consent: z.literal(true, { message: "Tick the box so we can keep your email on the list" }),
});

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const parsed = WaitlistZ.safeParse({
    email: form.get("email") ?? "",
    campus: form.get("campus") ?? "",
    ambassador: form.get("ambassador") === "on",
    consent: form.get("consent") === "on",
  });
  if (!parsed.success) {
    const fe: WaitlistState["fieldErrors"] = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0] as keyof NonNullable<WaitlistState["fieldErrors"]>;
      if (k && !fe[k]) fe[k] = i.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: fe };
  }
  try {
    const { email, campus, ambassador } = parsed.data;
    const id = `wl_${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;
    const store = getStore();
    await store.upsert("waitlist", id, { id, email, campus, ambassador, createdAt: new Date().toISOString() });
    const campusCount = (await store.list<{ campus?: string }>("waitlist")).filter((w) => w.campus === campus).length;
    const c = CAMPUSES.find((x) => x.id === campus);
    return {
      status: "ok", campusCount,
      message: `You're on the ${c?.city ?? "Bridge Week"} list${ambassador ? " as a Trajectory ambassador" : ""}. We'll show you here when your campus opens; we won't email you from this demo.`,
    };
  } catch {
    return { status: "error", message: "That's on us, not you. Try again in a moment." };
  }
}
