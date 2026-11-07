"use server";
// P5 · server action: draft a short "ask for 15 minutes" message. Nothing is ever sent from here.
import { llmText } from "@/lib/llm";
import { getStore } from "@/lib/store";
import type { Profile, Trajectory, TrajectoryStep } from "@/lib/types";

const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer", "software-engineer": "software engineer", "data-analyst": "data analyst",
};
const STEP_PRIORITY: TrajectoryStep["kind"][] = ["placement", "internship", "project", "hackathon", "society", "module-choice", "first-role"];
const MAX_WORDS = 60;

/** The most concrete, ask-about-able step of a journey (placements and projects before societies). */
function concreteStep(t: Trajectory): TrajectoryStep | undefined {
  for (const kind of STEP_PRIORITY) {
    const s = t.steps.find((x) => x.kind === kind);
    if (s) return s;
  }
  return t.steps[0];
}

/** "an ML engineer", "a software engineer": acronyms starting with a vowel sound take "an". */
const withArticle = (role: string) => `${/^([aeiou]|ml\b|nlp\b)/i.test(role) ? "an" : "a"} ${role}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Deterministic fallback draft (≤ 60 words) that names one concrete step from their journey. */
export async function templateDraft(trajectory: Trajectory, viewer?: Pick<Profile, "year" | "dna"> | null): Promise<string> {
  const step = concreteStep(trajectory);
  const yearWord = viewer ? ["first", "second", "third", "fourth"][viewer.year - 1] ?? "first" : "first";
  const role = viewer ? ROLE_NAMES[viewer.dna.targetRoles[0] ?? ""] : undefined;
  const hope = role ? ` hoping to become ${withArticle(role)}` : "";
  const label = step ? step.label.split(/\s+/).slice(0, 10).join(" ") : "";
  const stepText = step ? `Your year ${step.year} step, "${label}", really stood out to me. ` : "";
  return (
    `Hi ${firstName(trajectory.name)}, I'm a ${yearWord}-year student${hope}. ${stepText}` +
    `Could I ask you a few questions about it in a 15-minute chat? Totally fine if you're busy. Thank you!`
  );
}

/** Draft the request with the LLM; on any failure, return the template draft. */
export async function draftChatRequest(input: { viewerId: string; trajectory: Trajectory }): Promise<{ draft: string; source: "llm" | "template" }> {
  const { viewerId, trajectory } = input;
  let viewer: Profile | null = null;
  try {
    viewer = await getStore().get<Profile>("profiles", viewerId);
  } catch {
    viewer = null;
  }
  const path = trajectory.steps.map((s) => `Y${s.year} ${s.kind}: ${s.label}`).join("; ");
  const yearWord = viewer ? ["first", "second", "third", "fourth"][viewer.year - 1] ?? "first" : "first";
  try {
    const text = await llmText({
      agent: "trajectories",
      system:
        "You help university students write kind, specific, plain-text messages to near-peer mentors inside a learning app. " +
        "No subject line, no placeholders, no emojis, no links.",
      user:
        `Draft a short, specific, polite message from a ${yearWord}-year asking a senior for a 15-minute chat about their path ` +
        `(${path}; now: ${trajectory.outcomeRole}); ≤ 60 words; mention one concrete step from their journey. ` +
        `The senior's first name is ${firstName(trajectory.name)}.` +
        (viewer?.dna.targetRoles[0] ? ` The student hopes to become ${withArticle(ROLE_NAMES[viewer.dna.targetRoles[0]] ?? viewer.dna.targetRoles[0])}.` : ""),
    });
    const draft = text.trim().replace(/^["']|["']$/g, "");
    if (!draft || wordCount(draft) > MAX_WORDS) throw new Error("draft too long or empty");
    return { draft, source: "llm" };
  } catch {
    return { draft: await templateDraft(trajectory, viewer), source: "template" };
  }
}
