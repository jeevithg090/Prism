// P5 · GET /api/tools → ToolManifestEntry[]: every Keystone tool with its JSON Schema, effect and approval flag.
// Used by the governance page and the Coach UI.
import { toolManifest } from "@/lib/agents/tools/jsonSchema";
import { internal, ok } from "@/lib/schemas/community";

export async function GET() {
  try {
    return ok(toolManifest());
  } catch {
    return internal();
  }
}
