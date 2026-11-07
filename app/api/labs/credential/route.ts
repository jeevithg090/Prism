// Keystone Labs · Verifiable Skill Credential
//   GET  /api/labs/credential  → LedgerView: your proofs as Merkle leaves, the root, your signed chain and links
//   POST /api/labs/credential  { skillIds, approved: true } → IssueResult: a signed credential + a disclosure link
// POST is the human checkpoint: the student picked the skills and pressed "Sign and create link".
import { z } from "zod";
import { credentialFailure, viewerId } from "@/lib/labs/credential/http";
import { getLedgerView, issueCredential } from "@/lib/labs/credential/service";
import { badRequest, ok, SkillIdZ } from "@/lib/schemas/community";

const IssueReqZ = z.object({
  skillIds: z.array(SkillIdZ).min(1, "choose at least one skill").max(30),
  approved: z.literal(true, { message: "the student must approve signing and sharing" }),
}).strict();

export async function GET(req: Request) {
  try {
    return ok(await getLedgerView(viewerId(req)));
  } catch (e) {
    return credentialFailure(e);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Send a JSON body like { \"skillIds\": [\"docker\"], \"approved\": true }."); }
  const parsed = IssueReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await issueCredential({ userId: viewerId(req), skillIds: parsed.data.skillIds }), 201);
  } catch (e) {
    return credentialFailure(e);
  }
}
