// Keystone Labs · Verifiable Skill Credential: the Evidence Agent's credential workflow.
//
//   Proof Ladder (getPassport → every proven rung, with its evidence link)
//     → one salted leaf per rung → RFC 9162 Merkle tree → W3C VC 2.0 signed with Ed25519 (eddsa-jcs-2022)
//     → the student picks skills → a share link that reveals only those leaves, each with its inclusion proof
//     → an employer verifies the signature, the issuer key, the dates and every Merkle path.
//
// Reads: profiles, evidence, proofs, pod_progress, maps (all through the Proof Ladder / Skill Passport).
// Writes: credentials (the signed chain), credential_shares (links), coach_memory (a "win" note the Coach
// reads back), agent_runs (via runAgent) and Activity events with real numbers.
// Deterministic workflow, no LLM: nothing here needs a model, so nothing can hallucinate a credential.
import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { runAgent, type Guardrail } from "@/lib/agents/harness";
import { noOutboundMessaging } from "@/lib/agents/guardrails";
import { getPassport, NotFoundError } from "@/lib/agents/ladder";
import { addMemory } from "@/lib/agents/coach/memory";
import { getStore } from "@/lib/store";
import { toHex } from "./encoding";
import { getIssuerKey, isDemoMode, KEY_COLLECTION } from "./keys";
import { treeShape } from "./merkle";
import {
  SkillShareZ, type CredentialSummary, type IssueResult, type Leaf, type LedgerView, type ShareSummary,
  type SkillCredential, type SkillShare, type VerificationReport,
} from "./model";
import {
  buildCredential, buildShare, credentialDigest, discloseSkills, ledgerRoot, sortLeaves, subjectId, verifyDocument,
} from "./vc";

export const CREDENTIALS = "credentials";
export const SHARES = "credential_shares";
export const SHARE_PATH = "/labs/credential?share=";
/** Fixed issuance time in DEMO_MODE (the hackathon morning), so the demo signs identical bytes every run. */
export const DEMO_ISSUED_AT = "2026-11-07T09:00:00.000Z";
const YEAR_MS = 365 * 24 * 3600 * 1000;

export class CredentialError extends Error {
  constructor(message: string, readonly code: "not_found" | "no_proofs" | "forbidden" | "bad_request") {
    super(message);
    this.name = "CredentialError";
  }
}

type CredentialDoc = { id: string; userId: string; sequence: number; credential: SkillCredential; leaves: Leaf[]; createdAt: string };
type ShareDoc = { id: string; userId: string; credentialId: string; sequence: number; skills: string[]; share: SkillShare; createdAt: string; revoked: boolean };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- salts: one secret per student, one HMAC per leaf ----------

async function saltKey(userId: string): Promise<Buffer> {
  if (isDemoMode()) return createHash("sha256").update(`keystone-demo-salt|${userId}`).digest();
  const store = getStore();
  const id = `salt:${userId}`;
  const doc = await store.get<{ id: string; keyHex: string }>(KEY_COLLECTION, id);
  if (doc && /^[0-9a-f]{64}$/.test(doc.keyHex)) return Buffer.from(doc.keyHex, "hex");
  const keyHex = randomBytes(32).toString("hex");
  await store.upsert(KEY_COLLECTION, id, { id, keyHex });
  return Buffer.from(keyHex, "hex");
}

// ---------- the ledger: one leaf per proven rung of the Proof Ladder ----------

export interface Ledger {
  userId: string;
  name: string;
  programme: string;
  leaves: Leaf[];
  root: string;
  hashes: Uint8Array[];
  skills: { skillId: string; skillName: string; level: number; demand?: number }[];
}

export async function buildLedger(userId: string): Promise<Ledger> {
  let passport;
  try {
    passport = await getPassport(userId, userId);
  } catch (e) {
    if (e instanceof NotFoundError) throw new CredentialError(`We couldn't find a student called ${userId}.`, "not_found");
    throw e;
  }
  const key = await saltKey(userId);
  const subject = subjectId(userId);
  const raw: Leaf[] = [];
  for (const s of passport.skills) {
    for (const r of s.rungs) {
      if (r.status !== "done" || !r.evidence) continue; // implied rungs have no proof of their own
      const ev = r.evidence;
      const salt = createHmac("sha256", key).update(`${s.skillId}|${r.rung}|${ev.id}`).digest("hex").slice(0, 32);
      raw.push({
        v: 1, subject, skillId: s.skillId, skillName: clip(s.skillName, 80), rung: r.rung, rungLabel: r.label,
        source: clip(ev.source, 40), evidenceId: clip(ev.id, 160), url: clip(ev.url ?? "", 500), quote: clip(ev.quote ?? "", 400),
        // A completed module or a map-derived proof has no event time of its own (it's the map's build time),
        // so it's left out: otherwise the root would change every time the map is rebuilt.
        createdAt: ev.source === "degree" || ev.url === "/map" ? "" : clip(ev.createdAt ?? "", 40), salt,
      });
    }
  }
  const leaves = sortLeaves(raw);
  const { root, hashes } = ledgerRoot(leaves);
  return {
    userId, name: passport.name, programme: passport.programme, leaves, root, hashes,
    skills: passport.skills.map((s) => ({ skillId: s.skillId, skillName: s.skillName, level: s.level, ...(s.demand !== undefined ? { demand: s.demand } : {}) })),
  };
}

// ---------- store reads ----------

async function credentialsOf(userId: string): Promise<CredentialDoc[]> {
  const rows = await getStore().list<CredentialDoc>(CREDENTIALS, { userId });
  return rows.filter((r) => r?.userId === userId && Number.isInteger(r.sequence)).sort((a, b) => b.sequence - a.sequence);
}

async function sharesOf(userId: string): Promise<ShareDoc[]> {
  const rows = await getStore().list<ShareDoc>(SHARES, { userId });
  return rows.filter((r) => r?.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id)));
}

const summary = (d: CredentialDoc): CredentialSummary => ({
  id: d.credential.id, sequence: d.sequence, root: d.credential.credentialSubject.evidenceLedger.root,
  size: d.credential.credentialSubject.evidenceLedger.size, validFrom: d.credential.validFrom,
  previous: d.credential.credentialSubject.evidenceLedger.previous,
});

const shareSummary = (d: ShareDoc): ShareSummary => ({
  shareId: d.id, url: `${SHARE_PATH}${d.id}`, skills: d.skills, createdAt: d.createdAt, sequence: d.sequence, revoked: d.revoked,
});

/** The student's own view: every proof as a leaf, the tree, the signed chain and their links. Read only. */
export async function getLedgerView(userId: string): Promise<LedgerView> {
  const [ledger, creds, shares, key] = await Promise.all([buildLedger(userId), credentialsOf(userId), sharesOf(userId), getIssuerKey()]);
  const latest = creds[0];
  const byLeaf = new Map<string, number[]>();
  ledger.leaves.forEach((l, i) => byLeaf.set(l.skillId, [...(byLeaf.get(l.skillId) ?? []), i]));
  return {
    userId, name: ledger.name, programme: ledger.programme, root: ledger.root, size: ledger.leaves.length,
    leaves: ledger.leaves.map((l, i) => ({
      index: i, hash: toHex(ledger.hashes[i]), skillId: l.skillId, skillName: l.skillName, rung: l.rung, rungLabel: l.rungLabel,
      source: l.source, url: l.url, quote: l.quote, createdAt: l.createdAt,
    })),
    skills: ledger.skills.filter((s) => byLeaf.has(s.skillId)).map((s) => ({ ...s, leafIndexes: byLeaf.get(s.skillId) ?? [] })),
    tree: treeShape(ledger.hashes),
    latest: latest ? { ...summary(latest), current: summary(latest).root === ledger.root } : null,
    history: creds.map(summary),
    shares: shares.map(shareSummary),
    issuer: { did: key.did, demoKey: key.demoKey },
  };
}

// ---------- issue + share (the student decides) ----------

/** Fails closed if a share would reveal a skill the student didn't choose. */
function onlyChosenSkills(chosen: string[]): Guardrail<IssueResult> {
  const allowed = new Set(chosen);
  return {
    name: "disclosureMatchesConsent",
    apply(output) {
      const extra = [...new Set(output.share.disclosures.map((d) => d.leaf.skillId))].filter((s) => !allowed.has(s));
      return extra.length
        ? { output, action: "blocked", detail: `would reveal skills the student didn't choose: ${extra.join(", ")}` }
        : { output, action: "pass", detail: `reveals ${output.disclosed} proofs, hides ${output.hidden}` };
    },
  };
}

/**
 * A link id that never reuses a revoked one. DEMO_MODE derives it from the credential and the skills, so a
 * fresh demo makes the same link every run; if that link was revoked, a counter moves on to a new id rather
 * than bringing the old one back. An active link for the same skills is reused as it is.
 */
async function allocateShare(userId: string, credentialId: string, skillIds: string[]): Promise<{ id: string; existing: ShareDoc | null }> {
  const store = getStore();
  for (let n = 0; n < 1000; n++) {
    const id = isDemoMode()
      ? createHash("sha256").update(n === 0 ? `${credentialId}|${skillIds.join(",")}` : `${credentialId}|${skillIds.join(",")}|${n}`).digest("hex").slice(0, 24)
      : randomBytes(12).toString("hex");
    const doc = await store.get<ShareDoc>(SHARES, id);
    if (!doc) return { id, existing: null };
    if (isDemoMode() && doc.userId === userId && !doc.revoked && SkillShareZ.safeParse(doc.share).success) return { id, existing: doc };
    // Revoked, someone else's, or (outside the demo) a collision: never overwrite it, try the next id.
  }
  throw new Error("could not allocate a credential link id");
}

export interface IssueInput { userId: string; skillIds: string[]; runId?: string }

/**
 * Signs the student's current proof ledger (reusing the newest credential if nothing changed) and creates a
 * link that discloses only `skillIds`. The caller must have the student's explicit approval: this is the
 * human checkpoint. Nothing is sent to anyone; the student shares the link themselves.
 * Everything is built in memory and checked by the consent guardrail before the first write, so a blocked
 * disclosure leaves nothing behind (no credential, no link, no Coach note).
 */
export async function issueCredential(input: IssueInput): Promise<IssueResult> {
  const skillIds = [...new Set(input.skillIds)].sort();
  const consent = onlyChosenSkills(skillIds);
  const { output } = await runAgent<IssueResult>({
    agent: "evidence",
    runId: input.runId,
    purpose: "Sign the student's Proof Ladder as a verifiable credential and create a link that reveals only the skills they chose",
    input: { userId: input.userId, skillIds },
    startData: { skillsChosen: skillIds.length },
    checkpoint: { kind: "student-approval", who: input.userId, note: "The student chose which skills the link reveals and approved signing" },
    guardrails: [consent, noOutboundMessaging<IssueResult>()],
    run: async (ctx) => {
      const ledger = await ctx.step("hash-proofs", () => buildLedger(input.userId), (l) => ({
        message: `Hashed ${l.leaves.length} proofs from the Proof Ladder across ${new Set(l.leaves.map((x) => x.skillId)).size} skills`,
        data: { leaves: l.leaves.length, root: l.root.slice(0, 12) },
      }));
      if (!ledger.leaves.length) throw new CredentialError("You don't have any proofs on your ladder yet. Try a micro-challenge first.", "no_proofs");
      const known = new Set(ledger.leaves.map((l) => l.skillId));
      const unknown = skillIds.filter((s) => !known.has(s));
      if (unknown.length) throw new CredentialError(`You don't have a proof for ${unknown.join(", ")} yet, so it can't go in a link.`, "bad_request");

      const key = await getIssuerKey();
      const prior = await credentialsOf(input.userId);
      const latest = prior[0];
      let doc: CredentialDoc;
      let signedNew = false;
      if (latest && latest.credential.credentialSubject.evidenceLedger.root === ledger.root) {
        doc = latest;
        ctx.emit("progress", `Your ledger hasn't changed since credential #${latest.sequence}, so it was reused`, { sequence: latest.sequence });
      } else {
        const issuedAt = isDemoMode() ? DEMO_ISSUED_AT : new Date().toISOString();
        const sequence = (latest?.sequence ?? 0) + 1;
        const credential = await ctx.step("sign", () => buildCredential({
          signer: key, userId: input.userId, name: ledger.name, programme: ledger.programme, leaves: ledger.leaves,
          sequence, previous: latest ? credentialDigest(latest.credential) : null,
          issuedAt, validUntil: new Date(Date.parse(issuedAt) + YEAR_MS).toISOString(),
        }), (vc) => ({
          message: `Signed credential #${sequence} with Ed25519 over a ${ledger.leaves.length}-proof Merkle root`,
          data: { sequence, root: vc.credentialSubject.evidenceLedger.root.slice(0, 12), chained: !!latest },
        }));
        doc = { id: `${input.userId}:${sequence}`, userId: input.userId, sequence, credential, leaves: ledger.leaves, createdAt: issuedAt };
        signedNew = true;
      }

      const disclosures = discloseSkills(doc.leaves, skillIds);
      const { id: shareId, existing } = await allocateShare(input.userId, doc.credential.id, skillIds);
      const createdAt = existing?.createdAt ?? (isDemoMode() ? DEMO_ISSUED_AT : new Date().toISOString());
      const share = existing?.share ?? buildShare(shareId, doc.credential, disclosures, key, createdAt);
      // Mid-run checkpoint: the consent guardrail sees the exact link before anything is stored or published.
      const candidate = ctx.guard<IssueResult>({
        credential: doc.credential, share, shareUrl: `${SHARE_PATH}${shareId}`, signedNew,
        disclosed: share.disclosures.length, hidden: doc.leaves.length - share.disclosures.length,
      }, [consent]);

      const result = await ctx.step("share", async () => {
        if (signedNew) await getStore().upsert(CREDENTIALS, doc.id, doc, input.userId);
        if (!existing) {
          const shareDoc: ShareDoc = { id: shareId, userId: input.userId, credentialId: doc.credential.id, sequence: doc.sequence, skills: skillIds, share, createdAt, revoked: false };
          await getStore().upsert(SHARES, shareId, shareDoc, input.userId);
        }
        return candidate;
      }, (r) => ({
        message: existing ? `Your active link for these skills still stands: it reveals ${r.disclosed} proofs and hides ${r.hidden}` : `Sealed a link that reveals ${r.disclosed} proofs and hides ${r.hidden}`,
        data: { disclosed: r.disclosed, hidden: r.hidden, reused: !!existing },
      }));

      // Write-back the Coach reads (visible and deletable in the Coach's memory panel).
      try {
        const names = [...new Set(share.disclosures.map((d) => d.leaf.skillName))];
        await addMemory({ userId: input.userId, kind: "win", text: `You made a verifiable credential link for ${names.join(", ")} (credential #${doc.sequence}). Share it yourself when you apply.`, source: "credential" });
      } catch { /* memory is a nicety; the credential stands without it */ }

      ctx.done(`Credential #${doc.sequence} ready: ${result.disclosed} of ${doc.leaves.length} proofs disclosed`, { sequence: doc.sequence, disclosed: result.disclosed, hidden: result.hidden });
      return result;
    },
  });
  return output;
}

// ---------- links ----------

export async function getShare(shareId: string): Promise<SkillShare> {
  const doc = await getStore().get<ShareDoc>(SHARES, shareId);
  if (!doc) throw new CredentialError("That credential link doesn't exist.", "not_found");
  if (doc.revoked) throw new CredentialError("The student revoked this credential link.", "not_found");
  const parsed = SkillShareZ.safeParse(doc.share);
  if (!parsed.success) throw new CredentialError("That credential link is damaged.", "not_found");
  return parsed.data;
}

export async function revokeShare(userId: string, shareId: string): Promise<ShareSummary> {
  const doc = await getStore().get<ShareDoc>(SHARES, shareId);
  if (!doc) throw new CredentialError("That credential link doesn't exist.", "not_found");
  if (doc.userId !== userId) throw new CredentialError("Only the student who made this link can revoke it.", "forbidden");
  const next = { ...doc, revoked: true };
  await getStore().upsert(SHARES, shareId, next, userId);
  return shareSummary(next);
}

// ---------- verification (anyone; the employer) ----------

/**
 * Anyone (the employer) can check a credential or a link. The link's revocation status is looked up by its
 * share id, which verifyDocument trusts only once Keystone's seal over (id, credential, revealed positions)
 * holds, so editing the id, or trimming a revoked link's disclosures, can't dodge a revocation.
 */
export async function verifyCredential(document: unknown, opts: { runId?: string; now?: Date } = {}): Promise<VerificationReport> {
  const key = await getIssuerKey();
  const parsed = SkillShareZ.safeParse(document);
  let revoked = false;
  if (parsed.success) {
    try { revoked = (await getStore().get<ShareDoc>(SHARES, parsed.data.shareId))?.revoked === true; } catch { revoked = false; }
  }
  const sealedId = parsed.success ? parsed.data.shareId : null;
  const { output } = await runAgent<VerificationReport>({
    agent: "evidence",
    runId: opts.runId,
    purpose: "Verify a Keystone skill credential for an employer: signature, issuer key, dates, link seal and every Merkle proof",
    input: document,
    run: async (ctx) => {
      const report = await ctx.step("verify", () => verifyDocument(document, {
        trustedIssuers: [key.did], now: opts.now ?? new Date(), isRevoked: (id) => id === sealedId && revoked,
      }), (r) => ({
        message: r.verdict === "valid" ? `Credential valid: ${r.disclosed} proofs checked, ${r.hidden} hidden` : `Credential rejected: ${r.checks.filter((c) => !c.ok).map((c) => c.label).join(", ")}`,
        data: { verdict: r.verdict, disclosed: r.disclosed, hidden: r.hidden, failed: r.checks.filter((c) => !c.ok).length },
      }));
      ctx.done(report.headline, { verdict: report.verdict });
      return report;
    },
  });
  return output;
}
