// P5 · Badges. Opt-in identity badges come only from the profile; earned badges come from verified activity.
// Badges are used to route help (e.g. 🌱 newcomers first), never for matching.
import type { BadgeId, HelpRequest, InterviewFeedback, Pod, Profile } from "@/lib/types";

/** Self-declared, opt-in badges that are passed through as-is. */
export const OPT_IN_BADGES: readonly BadgeId[] = ["international", "first-gen", "career-changer"];
/** 🌱 new-to-uni lasts for the first 10 weeks after starting. */
export const NEW_TO_UNI_DAYS = 70;
export const HELPER_MIN_HELPS = 2;
export const INTERVIEW_READY_AVG = 3.5;

const ORDER: BadgeId[] = ["new-to-uni", "international", "first-gen", "career-changer", "helper", "shipped", "interview-ready"];
const DAY_MS = 86_400_000;

/**
 * Builds the computeBadges ctx from stored data:
 * helpsGiven = help requests this user accepted or finished as the helper;
 * shipped = a pod with a repo that includes this user;
 * interviewAvg = mean of the user's mock-interview scores (content, structure, clarity, confidence).
 */
export function badgeContext(
  userId: string,
  data: { help: HelpRequest[]; pods: Pod[]; interviews: InterviewFeedback[] },
): { helpsGiven: number; shipped: boolean; interviewAvg?: number } {
  const helpsGiven = data.help.filter((h) => h.toUserId === userId && (h.status === "accepted" || h.status === "done")).length;
  const shipped = data.pods.some((p) => !!p.project?.repoUrl && (p.members ?? []).some((m) => m.userId === userId));
  const perInterview = data.interviews
    .map((i) => {
      const s = i.scores ? [i.scores.content, i.scores.structure, i.scores.clarity, i.scores.confidence].filter((n) => typeof n === "number" && Number.isFinite(n)) : [];
      return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
    })
    .filter((n): n is number => n !== null);
  const interviewAvg = perInterview.length ? perInterview.reduce((a, b) => a + b, 0) / perInterview.length : undefined;
  return { helpsGiven, shipped, interviewAvg };
}

export function computeBadges(
  profile: Profile,
  ctx: { helpsGiven: number; shipped: boolean; interviewAvg?: number; now?: Date },
): BadgeId[] {
  const own = new Set<BadgeId>(profile.badges ?? []);
  const out = new Set<BadgeId>();

  if (own.has("new-to-uni")) {
    const started = Date.parse(profile.startedAt);
    const now = (ctx.now ?? new Date()).getTime();
    if (!Number.isNaN(started) && (now - started) / DAY_MS <= NEW_TO_UNI_DAYS) out.add("new-to-uni");
  }
  for (const b of OPT_IN_BADGES) if (own.has(b)) out.add(b);
  if (ctx.helpsGiven >= HELPER_MIN_HELPS) out.add("helper");
  if (ctx.shipped) out.add("shipped");
  if (ctx.interviewAvg !== undefined && ctx.interviewAvg >= INTERVIEW_READY_AVG) out.add("interview-ready");

  return ORDER.filter((b) => out.has(b));
}
