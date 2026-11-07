// Keystone Labs tool: get_lab_pulse (Live Lab Pulse). Read-only: it never opens a session or records a decision;
// the lecturer does both on /labs/pulse (the decision is a human checkpoint, "lecturer-decision").
import "server-only";
import { z } from "zod";
import { peekPulse, PulseNotFoundError } from "@/lib/labs/pulse/agent";
import { PULSE_ANONYMITY_MIN, type PulseSnapshot } from "@/lib/labs/pulse/model";
import { ToolError } from "../errors";
import type { AnyTool, KeystoneTool } from "../types";

const InputZ = z.object({
  sessionId: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/).optional()
    .describe("Lab session id, e.g. \"pulse_ab12cd34ef\". Omit for the newest lab."),
  minute: z.number().min(0).max(120).optional()
    .describe("Lab minute to read a simulated lab at. Omit for the minute the lecturer's board last showed."),
});

const MAX = 400;
const clip = (t: string) => (t.length <= MAX ? t : `${t.slice(0, MAX - 1).replace(/\s+\S*$/, "")}…`);
const m = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** ≤ 400 chars: the lab, the sticking point with its numbers, and the suggestion. */
export function summarizePulse(s: PulseSnapshot): string {
  const lab = `${s.skillName} lab, minute ${m(s.minute)} of ${s.labMinutes}${s.source === "simulated" ? " (simulated cohort)" : ""}`;
  if (s.suppressed) return clip(`${lab}: ${s.cohortSize} students, below the anonymity threshold of ${PULSE_ANONYMITY_MIN}, so nothing is shown.`);
  const room = `${s.cohortSize} students, ${s.passed} passed`;
  const hot = s.hotspot ? ` Most stuck: ${s.hotspot.concept}, ${s.hotspot.stuck} of ${s.cohortSize} (${s.hotspot.stuckPct}%); ${s.hotspot.met} have it.` : " Nobody is stuck.";
  const next = s.suggestion ? ` Suggestion: ${s.suggestion.action}` : "";
  return clip(`${lab}: ${room}.${hot}${next} Anonymous aggregate; the lecturer decides.`);
}

const getLabPulse: KeystoneTool<typeof InputZ, PulseSnapshot> = {
  name: "get_lab_pulse",
  title: "Read the live lab pulse",
  description:
    "Use when a lecturer asks how the room is doing in a live lab on a micro-challenge. Returns an anonymous aggregate " +
    "(groups of 10+ only): students passed, the rubric criterion most students are stuck on with counts, and the suggested " +
    "intervention. Read-only: it never names a student and never records the lecturer's decision.",
  input: InputZ,
  effect: "read",
  requiresApproval: false,
  agent: "techlead",
  async run(input) {
    try {
      return await peekPulse(input);
    } catch (e) {
      if (e instanceof PulseNotFoundError) throw new ToolError(`${e.message} Open /labs/pulse to start one.`, "not_found");
      throw new ToolError("Couldn't read the lab pulse right now. Try again in a moment.", "failed");
    }
  },
  summarize: summarizePulse,
};

export const tool = getLabPulse as unknown as AnyTool;
