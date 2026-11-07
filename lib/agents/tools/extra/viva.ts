// Keystone Labs · Coach/MCP tool: start_viva. Writes a Viva Check (three oral-exam questions from the student's own
// PR diff) and returns where to answer them. It never grades: the student answers on /labs/viva, where a pass
// writes Proof Ladder rung 3 evidence and a weak answer goes to their pod reviewer.
import "server-only";
import { z } from "zod";
import { startViva, VivaError } from "@/lib/labs/viva/agent";
import { KIND_LABEL, type VivaSession } from "@/lib/labs/viva/model";
import { ToolError } from "../errors";
import type { AnyTool, KeystoneTool } from "../types";

const InputZ = z.object({
  podId: z.string().min(1).max(64).optional().describe("Pod id, e.g. \"pod_demo01\". Give it with issueIndex; omit both to use the student's newest merged PR."),
  issueIndex: z.number().int().min(0).max(50).optional().describe("0-based issue index in that pod's project (the student's own issue)."),
});

interface StartVivaOutput {
  sessionId: string;
  url: string;
  prNumber: number;
  prTitle: string;
  skill: string;
  merged: boolean;
  reviewer: string | null;
  questions: { kind: string; topic: string; prompt: string; fromReview: boolean }[];
}

const MAX = 400;
const clip = (t: string) => {
  const one = t.replace(/\s+/g, " ").trim();
  return one.length <= MAX ? one : `${one.slice(0, MAX - 1).replace(/[\s,;:(]+\S*$/, "")}…`;
};

const startVivaTool: KeystoneTool<typeof InputZ, StartVivaOutput> = {
  name: "start_viva",
  title: "Start a Viva Check on your PR",
  description:
    "Use when the student has merged or opened a pod PR and wants to prove they understand it, or asks for a viva, oral check or \"quiz me on my code\". Writes three questions anchored to real lines of that PR's diff. Returns the questions and a /labs/viva link to answer by voice or text. It does not grade; never answer the questions for the student.",
  input: InputZ,
  effect: "write",
  requiresApproval: false,
  agent: "voice",
  async run(input, ctx) {
    if ((input.podId === undefined) !== (input.issueIndex === undefined)) {
      throw new ToolError("Give both podId and issueIndex, or neither to use the student's newest PR.", "invalid_input");
    }
    let s: VivaSession;
    try {
      s = await startViva(ctx.userId, input.podId !== undefined && input.issueIndex !== undefined ? { kind: "pod-issue", podId: input.podId, issueIndex: input.issueIndex } : undefined, ctx.runId);
    } catch (e) {
      if (e instanceof VivaError) throw new ToolError(`${e.message} Try start_viva with no arguments to use the student's newest PR.`, e.code === "forbidden" ? "forbidden" : "not_found");
      throw e;
    }
    return {
      sessionId: s.id, url: `/labs/viva?session=${encodeURIComponent(s.id)}`, prNumber: s.source.prNumber, prTitle: s.source.prTitle,
      skill: s.source.skillName, merged: s.source.merged, reviewer: s.source.reviewerName ?? null,
      questions: s.questions.map((q) => ({ kind: KIND_LABEL[q.kind], topic: q.topic, prompt: q.prompt, fromReview: q.fromReview })),
    };
  },
  summarize(o) {
    const topics = o.questions.map((q) => q.topic.toLowerCase()).join(", ");
    const review = o.questions.filter((q) => q.fromReview).length;
    return clip(
      `Viva ready on PR #${o.prNumber} '${o.prTitle}' (${o.skill}): ${o.questions.length} questions on ${topics}${review ? `, ${review} raised in the Tech Lead's review` : ""}. ` +
      `The student answers at ${o.url}; a pass lights Proof Ladder rung 3${o.reviewer ? `, a weak answer goes to ${o.reviewer} for a re-viva` : ""}. Don't answer for them.`,
    );
  },
};

/** Approval-free: it only writes a practice session, and the human checkpoints sit on grading and the re-viva. */
export const tool: AnyTool = {
  ...(startVivaTool as unknown as AnyTool),
  summarize: (o: unknown) => startVivaTool.summarize(o as StartVivaOutput) || "Viva ready.",
};
