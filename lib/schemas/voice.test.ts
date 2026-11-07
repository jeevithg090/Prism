import { describe, expect, it } from "vitest";
import feedback from "@/data/fixtures/interview.feedback.aisha.json";
import briefing from "@/data/fixtures/briefing.aisha.json";
import { BriefingZ, FeedbackReqZ, InterviewFeedbackZ, TtsReqZ } from "./voice";

describe("voice schemas", () => {
  it("parses the interview feedback and briefing fixtures", () => {
    expect(InterviewFeedbackZ.parse(feedback).fillerWordsPerMin).toBe(6.2);
    expect(BriefingZ.parse(briefing).topTasks).toHaveLength(3);
  });
  it("rejects an empty transcript and over-long TTS text", () => {
    expect(FeedbackReqZ.safeParse({ userId: "aisha", roleId: "ml-engineer", transcript: "", durationSec: 60 }).success).toBe(false);
    expect(TtsReqZ.safeParse({ text: "x".repeat(2501) }).success).toBe(false);
  });
});
