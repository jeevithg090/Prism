// Keystone Labs · Story Mode tool: the Coach (and any MCP client) can ask Keystone to explain itself with the
// student's real data instead of a generic product description.
import { z } from "zod";
import { compileStory, SubjectNotFoundError, summarizeStory } from "@/lib/labs/story/director";
import type { Story } from "@/lib/labs/story/schema";
import { ToolError } from "../errors";
import type { AnyTool, KeystoneTool } from "../types";

const Input = z.object({
  about: z.enum(["me", "demo"]).default("me").describe('"me" tells the story with the current student\'s data; "demo" uses Aisha, the seeded first-year.'),
}).strict();

export const STORY_TOOL: KeystoneTool<typeof Input, Story> = {
  name: "get_keystone_story",
  title: "Show how Keystone works",
  description:
    "Use when someone asks how Keystone works, how the agents connect, or wants a tour. Returns up to 10 beats of a " +
    "student's first six weeks (onboard, Bridge Map, roadmap, pod, project, review, proof, ladder, lecturer, next term): " +
    "the agent that acted, its receipt, the human checkpoint and the API behind every number. Not for this week's tasks: use get_week_plan.",
  input: Input,
  effect: "read",
  requiresApproval: false,
  agent: "orchestrator",
  async run(input, ctx) {
    try {
      return await compileStory({ studentId: input.about === "demo" ? "aisha" : ctx.userId, runId: ctx.runId });
    } catch (e) {
      if (e instanceof SubjectNotFoundError) throw new ToolError(`${e.message} Call this tool again with about: "demo" to tell Aisha's story instead.`, "not_found");
      throw new ToolError("The story couldn't be compiled just now. Try again, or open /labs/story.", "failed");
    }
  },
  summarize: summarizeStory,
};

export const tool = STORY_TOOL as unknown as AnyTool;
