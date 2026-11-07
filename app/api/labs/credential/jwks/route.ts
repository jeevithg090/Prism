// GET /api/labs/credential/jwks → { keys: [Ed25519 JWK] }: the public key Keystone signs credentials with.
// Employers pin this; a credential's issuer did:key must match it. The private key is never served.
import { publicJwks } from "@/lib/labs/credential/keys";
import { internal } from "@/lib/schemas/community";

export async function GET() {
  try {
    return Response.json(await publicJwks(), { headers: { "cache-control": "public, max-age=300" } });
  } catch {
    return internal();
  }
}
