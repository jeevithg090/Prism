// Keystone Labs · Verifiable Skill Credential: the issuer's Ed25519 key (node:crypto).
// One keypair, generated once and kept in the store (collection `credential_keys`, never served by any route).
// The private key never leaves this module: it is not logged, not returned, not put in a prompt.
//  - KEYSTONE_CREDENTIAL_SEED (64 hex chars) pins the key across restarts in production.
//  - DEMO_MODE derives a fixed, clearly labelled demo key, so the demo signs the same bytes every time.
import "server-only";
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify, type KeyObject } from "node:crypto";
import { getStore } from "@/lib/store";
import { didKeyFromEd25519, fromBase64Url, toBase64Url } from "./encoding";

export const KEY_COLLECTION = "credential_keys";
const ISSUER_DOC = "issuer";
// PKCS#8 DER header for an Ed25519 private key; the 32-byte seed follows.
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

export const isDemoMode = () => process.env.DEMO_MODE === "true";

export interface IssuerKey {
  did: string;
  /** Verification method id: did:key:z6Mk…#z6Mk… */
  kid: string;
  publicKey: Uint8Array;
  demoKey: boolean;
  createdAt: string;
  sign(data: Uint8Array): Uint8Array;
}

type KeyDoc = { id: string; seedHex: string; createdAt: string; demo: boolean };

const fromSeed = (seed: Buffer): KeyObject => createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });

function toIssuer(priv: KeyObject, createdAt: string, demoKey: boolean): IssuerKey {
  const jwk = createPublicKey(priv).export({ format: "jwk" }) as { x: string };
  const publicKey = fromBase64Url(jwk.x);
  const did = didKeyFromEd25519(publicKey);
  return {
    did, kid: `${did}#${did.slice("did:key:".length)}`, publicKey, demoKey, createdAt,
    sign: (data) => new Uint8Array(sign(null, Buffer.from(data), priv)),
  };
}

const cache = globalThis as unknown as { __ksCredKey?: Promise<IssuerKey>; __ksCredKeyMode?: string };

async function loadOrCreate(): Promise<IssuerKey> {
  const envSeed = process.env.KEYSTONE_CREDENTIAL_SEED;
  if (envSeed && /^[0-9a-f]{64}$/i.test(envSeed)) return toIssuer(fromSeed(Buffer.from(envSeed, "hex")), "2026-11-07T00:00:00.000Z", false);
  if (isDemoMode()) {
    const seed = createHash("sha256").update("keystone-demo-issuer-2026").digest();
    return toIssuer(fromSeed(seed), "2026-11-07T00:00:00.000Z", true);
  }
  const store = getStore();
  const existing = await store.get<KeyDoc>(KEY_COLLECTION, ISSUER_DOC);
  if (existing && /^[0-9a-f]{64}$/.test(existing.seedHex)) return toIssuer(fromSeed(Buffer.from(existing.seedHex, "hex")), existing.createdAt, existing.demo);
  const doc: KeyDoc = { id: ISSUER_DOC, seedHex: randomBytes(32).toString("hex"), createdAt: new Date().toISOString(), demo: false };
  await store.upsert(KEY_COLLECTION, ISSUER_DOC, doc);
  return toIssuer(fromSeed(Buffer.from(doc.seedHex, "hex")), doc.createdAt, false);
}

/** The issuer key (cached per process; the mode is part of the cache key so tests can flip DEMO_MODE). */
export function getIssuerKey(): Promise<IssuerKey> {
  const mode = `${isDemoMode()}:${process.env.KEYSTONE_CREDENTIAL_SEED ?? ""}`;
  if (!cache.__ksCredKey || cache.__ksCredKeyMode !== mode) {
    cache.__ksCredKeyMode = mode;
    cache.__ksCredKey = loadOrCreate().catch((e) => {
      cache.__ksCredKey = undefined;
      throw e;
    });
  }
  return cache.__ksCredKey;
}

/** Forget the cached key (tests). */
export function resetIssuerKeyCache(): void {
  cache.__ksCredKey = undefined;
  cache.__ksCredKeyMode = undefined;
}

export function verifyEd25519(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): boolean {
  try {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: toBase64Url(publicKey) }, format: "jwk" });
    return verify(null, Buffer.from(data), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

/** The public JWKS (RFC 7517 / RFC 8037): what an employer's system pins as "Keystone's key". */
export async function publicJwks(): Promise<{ keys: Record<string, string>[] }> {
  const k = await getIssuerKey();
  return {
    keys: [{
      kty: "OKP", crv: "Ed25519", x: toBase64Url(k.publicKey), kid: k.kid, use: "sig", alg: "EdDSA",
      ...(k.demoKey ? { note: "Demo key: derived from a public seed for the hackathon demo. Do not trust it in production." } : {}),
    }],
  };
}
