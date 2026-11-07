// The error Keystone's AI and connector boundaries throw so callers use their deterministic fallbacks
// ("demo_mode", "no_key", "not_recorded", "invalid_json: …"). Re-exported by lib/llm.ts; kept on its own so
// lib/replay.ts can throw it without importing the OpenAI client.
export class LLMError extends Error {
  constructor(msg: string, public cause?: unknown) {
    super(msg);
    this.name = "LLMError";
  }
}
