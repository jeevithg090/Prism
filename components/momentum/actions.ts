"use server";
import { llmText } from "@/lib/llm";
import { UserIdParamZ } from "@/lib/schemas/community";
import { loadBuildLog } from "./server";
import { CV_SYSTEM_PROMPT, cvUserPrompt, parseBullets, templateBullets, type CvBulletsResult } from "./cv";

/** 3 STAR-style CV bullets from the user's verified Build Log (template bullets if the LLM is unavailable). */
export async function turnIntoCvBullets(userId: string): Promise<CvBulletsResult> {
  const { userId: id } = UserIdParamZ.parse({ userId });
  const events = (await loadBuildLog(id)).slice(0, 30);
  if (events.length === 0) return { bullets: [], source: "template" };
  try {
    const text = await llmText({ agent: "evidence", system: CV_SYSTEM_PROMPT, user: cvUserPrompt(events) });
    const bullets = parseBullets(text);
    if (bullets.length >= 3) return { bullets: bullets.slice(0, 3), source: "ai" };
  } catch {
    // no key / provider error → deterministic template below
  }
  return { bullets: templateBullets(events), source: "template" };
}
