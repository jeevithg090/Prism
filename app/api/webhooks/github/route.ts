// P5 · POST /api/webhooks/github: HMAC-verified GitHub webhook → Socratic PR review → { reviewed }
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
    return ok(await reviewPullRequest(payload));
  } catch {
    return internal();
  }
}
