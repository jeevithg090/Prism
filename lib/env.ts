import { z } from "zod";
const EnvZ = z.object({
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  OPENAI_API_KEY: z.string().optional(), LLM_MODEL: z.string().optional(), LLM_MODEL_FAST: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(), GITHUB_ORG: z.string().optional(), GITHUB_WEBHOOK_SECRET: z.string().optional(),
  N8N_WEBHOOK_BASE_URL: z.string().optional(), KEYSTONE_SHARED_SECRET: z.string().optional(), NEXT_PUBLIC_APP_URL: z.string().optional(),
});
export const env = EnvZ.parse(process.env);
export function isDemo() { return process.env.DEMO_MODE === "true"; }
