import "server-only";
// Story Mode write-back: once a student has watched the story and says so, the Keystone Coach remembers it
// (collection `coach_memory`, which the Coach reads into every brief), so it skips the product tour and
// starts from this week's proof. Opt-in, visible and deletable on the Coach page, like every memory note.
import { runAgent } from "@/lib/agents/harness";
import { addMemory } from "@/lib/agents/coach/memory";
import { piiRedactor } from "@/lib/agents/guardrails";
import type { MemoryNote } from "@/lib/schemas/coach";

export const REMEMBER_CHECKPOINT = {
  kind: "student-approval" as const,
  who: "the student",
  note: "Saved only when the student ticks it; they can delete the note on the Coach page",
};

export function rememberText(beatsSeen: number): string {
  return `You've watched Keystone's Story Mode (${beatsSeen} beats), so skip the product tour and start from this week's proof.`;
}

export async function rememberStory(userId: string, beatsSeen: number, runId?: string): Promise<MemoryNote> {
  const { output } = await runAgent<MemoryNote>({
    agent: "orchestrator",
    runId,
    quiet: !runId,
    purpose: "Tell the Coach the student has watched Story Mode (only after they agreed)",
    input: { userId, beatsSeen },
    checkpoint: REMEMBER_CHECKPOINT,
    guardrails: [piiRedactor<MemoryNote>({ skipKeys: ["id", "userId", "createdAt"] })],
    run: async (ctx) => {
      const note = await ctx.step("save memory note", () => addMemory({ userId, kind: "preference", text: rememberText(beatsSeen), source: "story mode" }));
      ctx.done(`The Coach will remember you've seen the story (note ${note.id})`, { noteId: note.id });
      return note;
    },
  });
  return output;
}
