"use client";

import { InterviewClient } from "@/components/voice/InterviewClient";

// /interview: AI mock interview (voice via ElevenLabs, text mode as fallback). All logic lives in InterviewClient.
export default function InterviewPage() {
  return <InterviewClient />;
}
