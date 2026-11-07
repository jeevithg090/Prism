// Keystone Labs · Verifiable Skill Credential: the per-student Merkle tree of proofs (RFC 9162 §2.1).
// Domain separation (0x00 for leaves, 0x01 for nodes) stops a leaf being passed off as an inner node,
// and the RFC's left-heavy split means an odd leaf is never duplicated (the CVE-2012-2459 ambiguity).
// Server side only (node:crypto); the shapes it returns are plain JSON for the page.
import { createHash } from "node:crypto";
import { concatBytes, fromHex, toHex } from "./encoding";

const sha256 = (...parts: Uint8Array[]): Uint8Array => new Uint8Array(createHash("sha256").update(concatBytes(...parts)).digest());
const LEAF = Uint8Array.from([0x00]);
const NODE = Uint8Array.from([0x01]);

export const leafHash = (data: Uint8Array): Uint8Array => sha256(LEAF, data);
export const nodeHash = (left: Uint8Array, right: Uint8Array): Uint8Array => sha256(NODE, left, right);

/** Largest power of two strictly less than n (n ≥ 2). */
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** MTH(D[n]) over already-hashed leaves. The empty tree hashes to sha256(""). */
export function merkleRoot(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256();
  if (leaves.length === 1) return leaves[0];
  const k = split(leaves.length);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/** PATH(m, D[n]): the sibling hashes from leaf m up to the root (inclusion proof). */
export function inclusionPath(leaves: Uint8Array[], m: number): Uint8Array[] {
  if (!Number.isInteger(m) || m < 0 || m >= leaves.length) throw new RangeError(`leaf ${m} is not in a tree of ${leaves.length}`);
  if (leaves.length === 1) return [];
  const k = split(leaves.length);
  return m < k
    ? [...inclusionPath(leaves.slice(0, k), m), merkleRoot(leaves.slice(k))]
    : [...inclusionPath(leaves.slice(k), m - k), merkleRoot(leaves.slice(0, k))];
}

/** RFC 9162 §2.1.3.2: does `leaf` (a leaf hash) sit at `index` in a tree of `size` with this `root`? */
export function verifyInclusion(leaf: Uint8Array, index: number, size: number, path: Uint8Array[], root: Uint8Array): boolean {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) return false;
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const p of path) {
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(p, r);
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && toHex(r) === toHex(root);
}

/** Hex convenience wrapper for JSON inputs (false on malformed hex instead of throwing). */
export function verifyInclusionHex(leafHex: string, index: number, size: number, pathHex: string[], rootHex: string): boolean {
  try {
    return verifyInclusion(fromHex(leafHex), index, size, pathHex.map(fromHex), fromHex(rootHex));
  } catch {
    return false;
  }
}

/** A node of the tree for the page's diagram: leaves carry their index, inner nodes their two children. */
export type TreeNode = { hash: string; leafIndex?: number; children?: [TreeNode, TreeNode] };

export function treeShape(leaves: Uint8Array[], offset = 0): TreeNode | null {
  if (leaves.length === 0) return null;
  if (leaves.length === 1) return { hash: toHex(leaves[0]), leafIndex: offset };
  const k = split(leaves.length);
  const left = treeShape(leaves.slice(0, k), offset) as TreeNode;
  const right = treeShape(leaves.slice(k), offset + k) as TreeNode;
  return { hash: toHex(nodeHash(fromHex(left.hash), fromHex(right.hash))), children: [left, right] };
}
