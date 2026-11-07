// P5 · POST /api/webhooks/github: HMAC-verified GitHub webhook.
// pull_request opened/synchronize → Socratic PR review; closed+merged on a pod repo → proof of skill.
import { proofFromPullRequestEvent } from "@/lib/agents/proof";
import { reviewPullRequest, verifySignature } from "@/lib/agents/techlead";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), process.env.GITHUB_WEBHOOK_SECRET ?? "")) {
      return fail(401, "unauthorized", "The webhook signature didn't match.");
    }
    if (req.headers.get("x-github-event") !== "pull_request") return ok({ reviewed: false });
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return badRequest("Body must be JSON");
    }
    // A merged PR on a pod repo becomes proof (which also writes the pr-merged momentum event, once).
    // Anything else, including merged PRs we can't map to a pod issue, goes to the Tech Lead as before.
    let proof = null;
    try {
      proof = await proofFromPullRequestEvent(payload);
    } catch {
      proof = null;
    }
    if (proof) return ok({ reviewed: false, proof });
    return ok(await reviewPullRequest(payload));
  } catch {
    return internal();
  }
}
