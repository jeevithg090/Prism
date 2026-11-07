"use server";

import { llmText } from "@/lib/llm";
import { NextQuestionReqZ } from "@/lib/schemas/voice";

// Text-mode interviewer (no mic, no ElevenLabs key, or a dropped voice connection).
// Same script as the ElevenLabs "Keystone Interviewer" agent, so both modes feel identical.

type Turn = { role: "ai" | "user"; text: string };

const TOTAL_QUESTIONS = 5;
const CLOSING = "That's the end of your practice interview. Your feedback is on screen.";

const SYSTEM = `You are a friendly, professional interviewer for UK graduate and internship roles. You are interviewing {{name}}, a year {{year}} Computer Science student at the University of Manchester, for a {{role}} position.
Their strongest skills: {{top_skills}}. Skills they're building: {{gaps}}. Their current team project: "{{project_title}}". This week they're focusing on {{week_focus}}.
Ask exactly 5 questions, one at a time, and wait for the answer: (1) a warm intro question, (2) a technical question on one of their strongest skills, (3) a question about their team project, specifically what they did and a challenge, (4) a question about a skill they're building and how they're learning it, (5) a behavioural question about teamwork or feedback.
Use short follow-ups when answers are vague. Never answer for them. Keep each question under 30 words. Be encouraging. After question 5, thank them and say "${CLOSING}" then end the call.`;

const FIRST_MESSAGE =
  "Hi {{name}}, thanks for joining. This is a five-minute practice interview for the {{role}} role. Ready? Tell me a little about yourself and what got you into computing.";

const QUESTION_GUIDE = [
  "a warm intro question",
  "a technical question on one of their strongest skills",
  "a question about their team project, specifically what they did and a challenge",
  "a question about a skill they're building and how they're learning it",
  "a behavioural question about teamwork or feedback",
];

const VAR_FALLBACKS: Record<string, string> = {
  name: "there",
  year: "1",
  role: "software",
  top_skills: "your strongest skill",
  gaps: "a new skill",
  project_title: "your team project",
  week_focus: "a new skill",
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k]?.trim() || VAR_FALLBACKS[k] || "");
}

const firstItem = (list: string | undefined) => list?.split(",")[0]?.trim() || undefined;

// Deterministic questions 2–5, tailored from the same dynamic variables the voice agent gets.
function fallbackQuestion(answered: number, vars: Record<string, string>): string {
  const name = vars.name?.trim() || VAR_FALLBACKS.name;
  const topSkill = firstItem(vars.top_skills) ?? "your strongest skill";
  const project = vars.project_title?.trim() || "your team project";
  const building = vars.week_focus?.trim() || firstItem(vars.gaps) || "a new skill";
  switch (answered) {
    case 1:
      return `Thanks, ${name}. Let's get technical. Tell me about something you built with ${topSkill}, and one decision you made along the way.`;
    case 2:
      return `Your team project is "${project}". What did you personally work on, and what was one challenge you hit?`;
    case 3:
      return `You're building your ${building} skills right now. How are you learning it, and what has clicked so far?`;
    default:
      return "Last question. Tell me about a time a teammate gave you feedback. What did you change afterwards?";
  }
}

function transcriptFor(history: Turn[]): string {
  return history.map((t) => `${t.role === "ai" ? "Interviewer" : "Candidate"}: ${t.text}`).join("\n");
}

export async function nextQuestion(history: Turn[], vars: Record<string, string>): Promise<{ text: string; done: boolean }> {
  const parsed = NextQuestionReqZ.safeParse({ history, vars });
  if (!parsed.success) throw new Error("Invalid interview history");
  const { history: turns, vars: v } = parsed.data;

  const answered = turns.filter((t) => t.role === "user" && t.text.trim()).length;
  if (answered >= TOTAL_QUESTIONS) return { text: CLOSING, done: true };
  // The opening line is fixed so text mode starts exactly like the voice agent.
  if (answered === 0) return { text: fill(FIRST_MESSAGE, v), done: false };

  try {
    const reply = await llmText({
      agent: "voice",
      system: fill(SYSTEM, v),
      user: `${transcriptFor(turns)}\n\nThe candidate has answered ${answered} of ${TOTAL_QUESTIONS} questions. Now ask question ${answered + 1}: ${QUESTION_GUIDE[answered]}. You may open with a brief, warm acknowledgement of their last answer. Reply with only what you say next, under 40 words, with no speaker label.`,
    });
    const text = reply
      .trim()
      .replace(/^(interviewer|ai)\s*:\s*/i, "")
      .replace(/^"([\s\S]*)"$/, "$1")
      .trim();
    if (text && text.length <= 400 && !text.includes(CLOSING)) return { text, done: false };
  } catch {
    // No key or the model timed out: use the deterministic script below.
  }
  return { text: fallbackQuestion(answered, v), done: false };
}
