import { z } from "zod";
const EnvZ = z.object({
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  OPENAI_API_KEY: z.string().optional(), LLM_MODEL: z.string().optional(), LLM_MODEL_FAST: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(), ADZUNA_APP_ID: z.string().optional(), ADZUNA_APP_KEY: z.string().optional(),
  REED_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(), GITHUB_ORG: z.string().optional(), GITHUB_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(), NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(), SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(), ELEVENLABS_INTERVIEW_AGENT_ID: z.string().optional(), ELEVENLABS_ONBOARD_AGENT_ID: z.string().optional(), ELEVENLABS_VOICE_ID: z.string().optional(),
  N8N_WEBHOOK_BASE_URL: z.string().optional(), KEYSTONE_SHARED_SECRET: z.string().optional(), NEXT_PUBLIC_APP_URL: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().optional(),
});
export const env = EnvZ.parse(process.env);
export function isDemo() { return process.env.DEMO_MODE === "true"; }
