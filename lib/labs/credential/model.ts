// Keystone Labs · Verifiable Skill Credential: shared shapes (client-safe, no server imports).
//
//  Proof Ladder rung ──hash──▶ leaf ──RFC 9162──▶ Merkle root ──eddsa-jcs-2022──▶ W3C VC 2.0
//
// The signed credential commits only to the root of the student's proof tree. A share link carries the
// credential plus the leaves the student chose to reveal, each with its inclusion proof. Hidden leaves stay
// hidden: every leaf has its own salt, so a hash can't be matched against guesses.
import { z } from "zod";

export const VC_CONTEXT = "https://www.w3.org/ns/credentials/v2";
export const CREDENTIAL_TYPE = "KeystoneSkillLedgerCredential";
export const CRYPTOSUITE = "eddsa-jcs-2022";
export const TREE_ALGORITHM = "RFC9162-SHA256";
export const SHARE_TYPE = "KeystoneSkillShare";

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, "64 hex characters");
const Short = (n: number) => z.string().max(n);

export const RungZ = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** One proof, exactly as it is hashed. `salt` is what keeps an undisclosed leaf unguessable. */
export const LeafZ = z.object({
  v: z.literal(1),
  subject: Short(120),
  skillId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64),
  skillName: Short(80),
  rung: RungZ,
  rungLabel: z.enum(["Tried it", "Built it", "Can teach it"]),
  source: Short(40),
  evidenceId: Short(160),
  url: Short(500),
  quote: Short(400),
  createdAt: Short(40),
  salt: z.string().regex(/^[0-9a-f]{32}$/, "32 hex characters"),
}).strict();
export type Leaf = z.infer<typeof LeafZ>;

export const LedgerClaimZ = z.object({
  type: z.literal("MerkleTree"),
  algorithm: z.literal(TREE_ALGORITHM),
  root: Hex64,
  size: z.number().int().min(0).max(4096),
  sequence: z.number().int().min(1),
  previous: Hex64.nullable(),
}).strict();
export type LedgerClaim = z.infer<typeof LedgerClaimZ>;

export const DataIntegrityProofZ = z.object({
  type: z.literal("DataIntegrityProof"),
  cryptosuite: z.literal(CRYPTOSUITE),
  created: Short(40),
  verificationMethod: Short(200),
  proofPurpose: z.literal("assertionMethod"),
  proofValue: z.string().regex(/^z[1-9A-HJ-NP-Za-km-z]{40,120}$/, "multibase base58btc"),
}).strict();
export type DataIntegrityProof = z.infer<typeof DataIntegrityProofZ>;

export const SkillCredentialZ = z.object({
  "@context": z.array(z.string().max(200)).min(1).max(4),
  id: Short(200),
  type: z.array(z.string().max(80)).min(1).max(4),
  name: Short(120),
  description: Short(400),
  issuer: z.object({ id: Short(200), name: Short(80) }).strict(),
  validFrom: Short(40),
  validUntil: Short(40),
  credentialSubject: z.object({
    id: Short(120),
    name: Short(120),
    programme: Short(200),
    evidenceLedger: LedgerClaimZ,
  }).strict(),
  proof: DataIntegrityProofZ,
}).strict();
export type SkillCredential = z.infer<typeof SkillCredentialZ>;
export type UnsignedCredential = Omit<SkillCredential, "proof">;

export const DisclosureZ = z.object({
  leaf: LeafZ,
  index: z.number().int().min(0),
  path: z.array(Hex64).max(16),
}).strict();
export type Disclosure = z.infer<typeof DisclosureZ>;

/** What a share link serves and what an employer pastes into the verifier. */
export const SkillShareZ = z.object({
  type: z.literal(SHARE_TYPE),
  version: z.literal(1),
  shareId: Short(64),
  credential: SkillCredentialZ,
  disclosures: z.array(DisclosureZ).max(64),
}).strict();
export type SkillShare = z.infer<typeof SkillShareZ>;

// ---------- the student's view (GET /api/labs/credential) ----------

export type TreeNodeView = { hash: string; leafIndex?: number; children?: [TreeNodeView, TreeNodeView] };

export type LedgerLeafView = {
  index: number;
  hash: string;
  skillId: string;
  skillName: string;
  rung: 1 | 2 | 3;
  rungLabel: Leaf["rungLabel"];
  source: string;
  url: string;
  quote: string;
  createdAt: string;
};

export type LedgerSkillView = { skillId: string; skillName: string; level: number; demand?: number; leafIndexes: number[] };

export type ShareSummary = { shareId: string; url: string; skills: string[]; createdAt: string; sequence: number; revoked: boolean };

export type CredentialSummary = { id: string; sequence: number; root: string; size: number; validFrom: string; previous: string | null };

export interface LedgerView {
  userId: string;
  name: string;
  programme: string;
  root: string;
  size: number;
  leaves: LedgerLeafView[];
  skills: LedgerSkillView[];
  tree: TreeNodeView | null;
  /** The newest signed credential, and whether it still covers every proof on the ladder. */
  latest: (CredentialSummary & { current: boolean }) | null;
  history: CredentialSummary[];
  shares: ShareSummary[];
  issuer: { did: string; demoKey: boolean };
}

export interface IssueResult {
  credential: SkillCredential;
  share: SkillShare;
  shareUrl: string;
  /** false when the ledger hadn't changed, so the newest credential was reused (nothing new was signed). */
  signedNew: boolean;
  disclosed: number;
  hidden: number;
}

// ---------- verification report (POST /api/labs/credential/verify) ----------

export type CheckId = "format" | "signature" | "issuer" | "validity" | "ledger" | "injection" | "status";

export interface VerifyCheck { id: CheckId; ok: boolean; label: string; detail: string }

export interface VerifiedProof {
  index: number;
  rung: number;
  rungLabel: string;
  source: string;
  quote: string;
  /** Only http(s) links and Keystone paths; anything else (javascript:, data:) is dropped. */
  url: string | null;
  createdAt: string;
  ok: boolean;
  reason?: string;
  pathLength: number;
  injection: "none" | "low" | "high";
}

export interface VerifiedSkill { skillId: string; skillName: string; ok: boolean; level: number; proofs: VerifiedProof[] }

export interface VerificationReport {
  verdict: "valid" | "invalid";
  headline: string;
  checks: VerifyCheck[];
  subject: { name: string; programme: string } | null;
  issuer: { did: string; name: string; trusted: boolean } | null;
  ledger: { root: string; size: number; sequence: number } | null;
  skills: VerifiedSkill[];
  disclosed: number;
  hidden: number;
}

/** Only links an employer can safely open: https?:// or a Keystone path. */
export function safeLink(url: string | undefined | null): string | null {
  if (!url) return null;
  const u = url.trim();
  if (/^https?:\/\/[^\s]+$/i.test(u)) return u;
  if (/^\/(?!\/)[\w\-./?=&%#]*$/.test(u)) return u;
  return null;
}

export const shortHash = (hex: string, n = 8) => (hex.length > n ? `${hex.slice(0, n)}…` : hex);
