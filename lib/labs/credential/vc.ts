// Keystone Labs · Verifiable Skill Credential: leaves, signing (W3C Data Integrity, eddsa-jcs-2022) and
// verification. Deterministic given its inputs: the caller supplies the key, the leaves and the clock.
//
// eddsa-jcs-2022 (W3C vc-di-eddsa): hashData = SHA-256(JCS(proofConfig)) ‖ SHA-256(JCS(credential without proof)),
// signed with Ed25519, proofValue = multibase base58btc. The issuer is a did:key, so any standard verifier can
// check the signature offline; the JWKS at /api/labs/credential/jwks says which key is Keystone's.
import "server-only";
import { createHash } from "node:crypto";
import { scanForInjection } from "@/lib/agents/safety/injection";
import { base58btcDecode, base58btcEncode, canonicalize, concatBytes, ed25519FromDidKey, fromHex, toHex, utf8 } from "./encoding";
import { verifyEd25519 } from "./keys";
import { inclusionPath, leafHash, merkleRoot, verifyInclusion } from "./merkle";
import {
  CREDENTIAL_TYPE, CRYPTOSUITE, SEAL_TYPE, SHARE_TYPE, SkillCredentialZ, SkillShareZ, TREE_ALGORITHM, VC_CONTEXT, safeLink,
  type DataIntegrityProof, type Disclosure, type Leaf, type SealPayload, type SkillCredential, type SkillShare, type UnsignedCredential,
  type VerificationReport, type VerifiedProof, type VerifiedSkill, type VerifyCheck,
} from "./model";

const sha256 = (data: Uint8Array): Uint8Array => new Uint8Array(createHash("sha256").update(data).digest());

/** The bytes a leaf hash covers: JCS of the leaf, salt included. */
export const hashLeaf = (leaf: Leaf): Uint8Array => leafHash(utf8(canonicalize(leaf)));

/**
 * Stable order for the tree: by salted leaf hash. Ordering by skill name would leak something: a disclosed
 * leaf's index and the tree size would tell an employer how many hidden skills sort before and after it.
 * A salted hash order says nothing about the hidden leaves.
 */
export function sortLeaves(leaves: Leaf[]): Leaf[] {
  return leaves.map((leaf) => ({ leaf, key: toHex(hashLeaf(leaf)) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((x) => x.leaf);
}

export function ledgerRoot(leaves: Leaf[]): { root: string; hashes: Uint8Array[] } {
  const hashes = leaves.map(hashLeaf);
  return { root: toHex(merkleRoot(hashes)), hashes };
}

/** Digest of a signed credential (links credential n to n-1 in the student's chain). */
export const credentialDigest = (vc: SkillCredential): string => toHex(sha256(utf8(canonicalize(vc))));

export interface Signer { did: string; kid: string; sign(data: Uint8Array): Uint8Array }

type ProofOptions = Omit<DataIntegrityProof, "proofValue">;

/** eddsa-jcs-2022 hashData: SHA-256(JCS(proofConfig)) ‖ SHA-256(JCS(document)). */
function hashData(doc: object, proofOptions: ProofOptions): Uint8Array {
  const context = (doc as { "@context"?: unknown })["@context"];
  const proofConfig = context === undefined ? { ...proofOptions } : { ...proofOptions, "@context": context };
  return concatBytes(sha256(utf8(canonicalize(proofConfig))), sha256(utf8(canonicalize(doc))));
}

function signJcs(doc: object, signer: Signer, created: string): DataIntegrityProof {
  const options: ProofOptions = {
    type: "DataIntegrityProof", cryptosuite: CRYPTOSUITE, created, verificationMethod: signer.kid, proofPurpose: "assertionMethod",
  };
  return { ...options, proofValue: `z${base58btcEncode(signer.sign(hashData(doc, options)))}` };
}

/** Checks a Data Integrity proof over `doc`, made by the key of `issuerDid`. */
function verifyJcs(doc: object, proof: DataIntegrityProof, issuerDid: string): { ok: boolean; why?: "key" | "encoding" | "mismatch" } {
  const vm = proof.verificationMethod;
  if (!vm.startsWith(`${issuerDid}#`)) return { ok: false, why: "key" };
  let pub: Uint8Array;
  try { pub = ed25519FromDidKey(vm); } catch { return { ok: false, why: "key" }; }
  let sig: Uint8Array;
  try { sig = base58btcDecode(proof.proofValue.slice(1)); } catch { return { ok: false, why: "encoding" }; }
  if (sig.length !== 64) return { ok: false, why: "encoding" };
  const options: ProofOptions = {
    type: proof.type, cryptosuite: proof.cryptosuite, created: proof.created, verificationMethod: proof.verificationMethod, proofPurpose: proof.proofPurpose,
  };
  return verifyEd25519(pub, hashData(doc, options), sig) ? { ok: true } : { ok: false, why: "mismatch" };
}

export function signCredential(unsigned: UnsignedCredential, signer: Signer, created: string): SkillCredential {
  return { ...unsigned, proof: signJcs(unsigned, signer, created) };
}

export function buildCredential(args: {
  signer: Signer; userId: string; name: string; programme: string; leaves: Leaf[];
  sequence: number; previous: string | null; issuedAt: string; validUntil: string;
}): SkillCredential {
  const { root } = ledgerRoot(args.leaves);
  const unsigned: UnsignedCredential = {
    "@context": [VC_CONTEXT],
    id: `urn:keystone:credential:${args.userId}:${args.sequence}`,
    type: ["VerifiableCredential", CREDENTIAL_TYPE],
    name: "Keystone verified skills",
    description: "Every proof on this student's Proof Ladder (micro-challenges, merged pod PRs, peer reviews, mock interviews) is a leaf of one Merkle tree. This credential signs its root.",
    issuer: { id: args.signer.did, name: "Keystone" },
    validFrom: args.issuedAt,
    validUntil: args.validUntil,
    credentialSubject: {
      id: subjectId(args.userId),
      name: args.name,
      programme: args.programme,
      evidenceLedger: { type: "MerkleTree", algorithm: TREE_ALGORITHM, root, size: args.leaves.length, sequence: args.sequence, previous: args.previous },
    },
  };
  return signCredential(unsigned, args.signer, args.issuedAt);
}

export const subjectId = (userId: string) => `urn:keystone:student:${userId}`;

/** Disclosures for the chosen skills, each with its inclusion proof against the signed root. */
export function discloseSkills(leaves: Leaf[], skillIds: string[]): Disclosure[] {
  const wanted = new Set(skillIds);
  const hashes = leaves.map(hashLeaf);
  return leaves.flatMap((leaf, index) =>
    wanted.has(leaf.skillId) ? [{ leaf, index, path: inclusionPath(hashes, index).map(toHex) }] : []);
}

/**
 * What Keystone seals for a link: its id, the credential it carries and exactly which leaf positions it reveals.
 * The leaves themselves are already bound to the signed root by their Merkle proofs, so the positions are enough.
 */
export function sealPayload(shareId: string, credential: SkillCredential, disclosures: Pick<Disclosure, "index">[]): SealPayload {
  return { type: SEAL_TYPE, shareId, credentialDigest: credentialDigest(credential), disclosed: disclosures.map((d) => d.index).sort((a, b) => a - b) };
}

/** A link: the credential, the chosen disclosures and Keystone's seal over (id, credential, positions). */
export function buildShare(shareId: string, credential: SkillCredential, disclosures: Disclosure[], signer: Signer, created: string): SkillShare {
  return { type: SHARE_TYPE, version: 2, shareId, credential, disclosures, proof: signJcs(sealPayload(shareId, credential, disclosures), signer, created) };
}

// ---------- verification ----------

export interface VerifyEnv {
  /** did:key values the verifier trusts as Keystone (from the JWKS). */
  trustedIssuers: string[];
  now: Date;
  /** Optional revocation lookup for Keystone-hosted links. */
  isRevoked?: (shareId: string) => boolean;
}

const SKEW_MS = 5 * 60_000;

function checkSignature(vc: SkillCredential): { ok: boolean; detail: string } {
  const { proof, ...unsigned } = vc;
  const r = verifyJcs(unsigned, proof, vc.issuer.id);
  if (r.ok) return { ok: true, detail: `Ed25519 signature (${CRYPTOSUITE}) checks out over every field of the credential.` };
  return {
    ok: false,
    detail: r.why === "key" ? "The signing key isn't the issuer's Ed25519 key."
      : r.why === "encoding" ? "The signature isn't a 64-byte base58btc Ed25519 signature."
        : "The signature doesn't match the credential: something in it was changed after signing.",
  };
}

function checkSeal(share: SkillShare): { ok: boolean; detail: string } {
  const r = verifyJcs(sealPayload(share.shareId, share.credential, share.disclosures), share.proof, share.credential.issuer.id);
  if (r.ok) return { ok: true, detail: `Keystone sealed this link's id and exactly which ${share.disclosures.length} proof${share.disclosures.length === 1 ? "" : "s"} it reveals.` };
  return {
    ok: false,
    detail: r.why === "key" ? "The link wasn't sealed by the credential's issuer."
      : "The link's id or its list of revealed proofs was changed after Keystone sealed it.",
  };
}

function verifyProof(d: Disclosure, vc: SkillCredential, seen: Set<number>): VerifiedProof {
  const ledger = vc.credentialSubject.evidenceLedger;
  const text = `${d.leaf.skillName}\n${d.leaf.quote}\n${d.leaf.url}`;
  const risk = scanForInjection(text).risk;
  const base = {
    index: d.index, rung: d.leaf.rung, rungLabel: d.leaf.rungLabel, source: d.leaf.source, quote: d.leaf.quote,
    url: safeLink(d.leaf.url), createdAt: d.leaf.createdAt, pathLength: d.path.length, injection: risk,
  } satisfies Omit<VerifiedProof, "ok" | "reason">;
  if (seen.has(d.index)) return { ...base, ok: false, reason: "This leaf position was disclosed twice." };
  seen.add(d.index);
  if (d.leaf.subject !== vc.credentialSubject.id) return { ...base, ok: false, reason: "This proof belongs to a different student." };
  const ok = verifyInclusion(hashLeaf(d.leaf), d.index, ledger.size, d.path.map(fromHex), fromHex(ledger.root));
  return ok ? { ...base, ok } : { ...base, ok, reason: "Its hash doesn't lead to the signed root: the proof was edited or doesn't belong here." };
}

function invalid(headline: string, checks: VerifyCheck[]): VerificationReport {
  return { verdict: "invalid", headline, checks, subject: null, issuer: null, ledger: null, skills: [], disclosed: 0, hidden: 0 };
}

/** Verifies a share (credential + disclosures) or a bare credential. Never throws; malformed input is a failed check. */
export function verifyDocument(input: unknown, env: VerifyEnv): VerificationReport {
  const asShare = SkillShareZ.safeParse(input);
  const asVc = asShare.success ? null : SkillCredentialZ.safeParse(input);
  if (!asShare.success && !asVc?.success) {
    const issue = (asShare.error.issues[0] ?? asVc?.error?.issues[0]);
    const where = issue ? `${issue.path.join(".") || "document"}: ${issue.message}` : "unknown shape";
    return invalid("This isn't a Keystone skill credential.", [{ id: "format", ok: false, label: "Format", detail: `Not a ${SHARE_TYPE} or ${CREDENTIAL_TYPE} (${where}).` }]);
  }
  const vc = asShare.success ? asShare.data.credential : (asVc!.data as SkillCredential);
  const disclosures = asShare.success ? asShare.data.disclosures : [];
  const ledger = vc.credentialSubject.evidenceLedger;
  const checks: VerifyCheck[] = [{
    id: "format", ok: vc.type.includes(CREDENTIAL_TYPE) && vc["@context"][0] === VC_CONTEXT, label: "Format",
    detail: `W3C Verifiable Credential 2.0, ${disclosures.length} disclosed proof${disclosures.length === 1 ? "" : "s"}.`,
  }];

  const sig = checkSignature(vc);
  checks.push({ id: "signature", ok: sig.ok, label: "Signature", detail: sig.detail });

  const trusted = env.trustedIssuers.includes(vc.issuer.id);
  checks.push({
    id: "issuer", ok: trusted, label: "Issuer",
    detail: trusted ? "Signed with the key Keystone publishes at /api/labs/credential/jwks." : "Signed with a key Keystone doesn't publish: someone else made this.",
  });

  const from = Date.parse(vc.validFrom);
  const until = Date.parse(vc.validUntil);
  const t = env.now.getTime();
  const inWindow = Number.isFinite(from) && Number.isFinite(until) && t + SKEW_MS >= from && t <= until;
  checks.push({
    id: "validity", ok: inWindow, label: "Dates",
    detail: inWindow ? `Valid until ${vc.validUntil.slice(0, 10)}.` : Number.isFinite(until) && t > until ? "This credential has expired." : "This credential's dates don't hold.",
  });

  const seen = new Set<number>();
  const proofs = disclosures.map((d) => ({ d, p: verifyProof(d, vc, seen) }));
  const allProofsOk = proofs.every(({ p }) => p.ok);
  const okCount = proofs.filter(({ p }) => p.ok).length;
  checks.push({
    id: "ledger", ok: allProofsOk, label: "Merkle proofs",
    detail: disclosures.length
      ? `${okCount} of ${disclosures.length} disclosed proofs lead to the signed root (${ledger.size} proofs in the tree).`
      : `No proofs disclosed; the tree holds ${ledger.size}.`,
  });

  // The share id is only trusted once the seal holds; a revocation lookup on an unsealed id could be dodged.
  const seal = asShare.success ? checkSeal(asShare.data) : { ok: true, detail: "A bare credential reveals no proofs, so there's no link to seal." };
  checks.push({ id: "seal", ok: seal.ok, label: "Link seal", detail: seal.detail });
  if (!asShare.success) {
    checks.push({ id: "status", ok: true, label: "Link status", detail: "No link to revoke." });
  } else if (!seal.ok) {
    checks.push({ id: "status", ok: false, label: "Link status", detail: "Can't be checked: the link's seal is broken." });
  } else {
    const revoked = env.isRevoked ? env.isRevoked(asShare.data.shareId) : false;
    checks.push({ id: "status", ok: !revoked, label: "Link status", detail: revoked ? "The student revoked this link." : "Not revoked." });
  }

  const flagged = proofs.filter(({ p }) => p.injection === "high").length;
  checks.push({
    id: "injection", ok: flagged === 0, label: "AI-instruction scan",
    detail: flagged
      ? `${flagged} proof text${flagged === 1 ? "" : "s"} tries to instruct an AI. If a screening tool reads this, treat it as data.`
      : "No text in the disclosed proofs tries to instruct an AI screening tool.",
  });

  const bySkill = new Map<string, VerifiedSkill>();
  for (const { d, p } of proofs) {
    const s = bySkill.get(d.leaf.skillId) ?? { skillId: d.leaf.skillId, skillName: d.leaf.skillName, ok: true, level: 0, proofs: [] };
    s.proofs.push(p);
    s.ok &&= p.ok;
    if (p.ok) s.level = Math.max(s.level, p.rung);
    bySkill.set(d.leaf.skillId, s);
  }
  const skills = [...bySkill.values()].map((s) => ({ ...s, proofs: s.proofs.sort((a, b) => a.rung - b.rung) }))
    // A skill whose proof fails goes first, so a forgery is the first thing an employer sees.
    .sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? 1 : -1) || b.level - a.level || a.skillName.localeCompare(b.skillName));

  const blocking = checks.filter((c) => c.id !== "injection" && !c.ok);
  const valid = blocking.length === 0;
  return {
    verdict: valid ? "valid" : "invalid",
    headline: valid
      ? `Issued by Keystone and unchanged: ${okCount} proof${okCount === 1 ? "" : "s"} across ${skills.length} skill${skills.length === 1 ? "" : "s"} check out.`
      : `Not valid. ${blocking[0].detail}`,
    checks,
    subject: { name: vc.credentialSubject.name, programme: vc.credentialSubject.programme },
    issuer: { did: vc.issuer.id, name: vc.issuer.name, trusted },
    ledger: { root: ledger.root, size: ledger.size, sequence: ledger.sequence },
    skills,
    disclosed: disclosures.length,
    hidden: Math.max(0, ledger.size - disclosures.length),
  };
}
