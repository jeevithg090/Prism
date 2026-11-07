// Keystone Labs tool: record_skill_credential. The Coach (and MCP clients) can turn the student's Proof Ladder
// into a signed, selectively disclosed credential link. It writes (a signed credential and a public link), so a
// human approves every call; it never sends the link to anyone.
import "server-only";
import { z } from "zod";
import { SkillIdZ, skillName } from "@/lib/schemas/community";
import { CredentialError, getLedgerView, issueCredential } from "@/lib/labs/credential/service";
import { ToolError } from "../errors";
import type { AnyTool, KeystoneTool } from "../types";

const InputZ = z.object({
  skillIds: z.array(SkillIdZ).min(1).max(10).optional()
    .describe("Skill ids the link may reveal, e.g. [\"docker\", \"python\"]. Only skills with a proof on the student's ladder; every other proof stays hidden. Omit to reveal only their strongest skill."),
});

type Output = { shareUrl: string; sequence: number; signedNew: boolean; disclosed: number; hidden: number; skills: string[]; root: string };

const MAX = 400;
const clip = (t: string) => (t.length <= MAX ? t : `${t.slice(0, MAX - 1)}…`);

const credentialTool: KeystoneTool<typeof InputZ, Output> = {
  name: "record_skill_credential",
  title: "Issue a verifiable skill credential",
  description:
    "Signs the student's Proof Ladder as a W3C Verifiable Credential (Ed25519 over a Merkle root of every proof) and creates a link that reveals only the chosen skills. Use when the student wants to show an employer proof of specific skills. Returns the link, the credential number and how many proofs it reveals and hides. Never sends it to anyone.",
  input: InputZ,
  effect: "write",
  requiresApproval: true,
  agent: "evidence",
  async run(input, ctx) {
    if (!ctx.approved) {
      throw new ToolError("Issuing a credential link needs the student's approval first (they choose what it reveals). Ask them, then call it again once approved.", "needs_approval");
    }
    try {
      let skillIds = input.skillIds;
      if (!skillIds?.length) {
        const top = (await getLedgerView(ctx.userId)).skills[0];
        if (!top) throw new CredentialError("You don't have any proofs on your ladder yet. Try a micro-challenge first.", "no_proofs");
        skillIds = [top.skillId];
      }
      const r = await issueCredential({ userId: ctx.userId, skillIds, runId: ctx.runId });
      return {
        shareUrl: r.shareUrl, sequence: r.credential.credentialSubject.evidenceLedger.sequence, signedNew: r.signedNew,
        disclosed: r.disclosed, hidden: r.hidden, skills: [...new Set(r.share.disclosures.map((d) => d.leaf.skillId))],
        root: r.credential.credentialSubject.evidenceLedger.root.slice(0, 12),
      };
    } catch (e) {
      if (e instanceof CredentialError) throw new ToolError(e.message, e.code === "not_found" ? "not_found" : e.code === "forbidden" ? "forbidden" : "invalid_input");
      throw new ToolError("Signing the credential failed. It's safe to try again.", "failed");
    }
  },
  summarize(o) {
    return clip(
      `Credential #${o.sequence}${o.signedNew ? " signed" : " reused (ledger unchanged)"}: the link ${o.shareUrl} reveals ${o.disclosed} proof${o.disclosed === 1 ? "" : "s"} for ${o.skills.map(skillName).join(", ")} and hides ${o.hidden}. Root ${o.root}…. The student shares it themselves; nothing was sent.`,
    );
  },
};

export const tool: AnyTool = credentialTool as unknown as AnyTool;
