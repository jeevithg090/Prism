import "server-only";
import { FeedbackReqZ } from "@/lib/schemas/voice";
import { badRequest, internal, ok } from "@/lib/voice/http";
import { scoreInterview } from "@/lib/voice/interviewScoring";


// A 6-minute interview is a few thousand characters; this only stops absurd payloads from being stored.
const MAX_TRANSCRIPT_CHARS = 50_000;

// POST /api/interview/feedback { userId, roleId, transcript, durationSec } -> InterviewFeedback.
// Without an LLM key (e.g. DEMO_MODE) scoring falls back to neutral scores, so this always answers.
export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Body must be JSON");
    }
    const parsed = FeedbackReqZ.safeParse(body);
    if (!parsed.success || !parsed.data.transcript.trim()) {
      return badRequest("Expected { userId, roleId, transcript (not empty), durationSec > 0 }");
    }
    if (parsed.data.transcript.length > MAX_TRANSCRIPT_CHARS) return badRequest("Transcript is too long");

    return ok(await scoreInterview(parsed.data));
  } catch {
    return internal();
  }
}
