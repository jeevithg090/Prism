// Keystone Labs · Agent Council guardrails (run inside the harness, recorded in the `agent_runs` ledger).
//  - receiptsRequired: no claim without a receipt. An argument whose receipts lack a source or a ref is blocked,
//    so the harness falls back to the rule-based argument.
//  - dissentKept: the strongest counter-argument may never be dropped from a ruling (an LLM rewrite or a bug
//    that loses it is repaired, and the ledger says so).
//  - numbersGrounded: an LLM rewording may not introduce a number that isn't in the rule-based text or its receipts.
import type { Guardrail } from "@/lib/agents/harness";
import { stanceOf } from "./engine";
import { SEATS, type CouncilArgument, type CouncilSession } from "./types";

export function receiptsRequired(): Guardrail<CouncilArgument> {
  return {
    name: "receiptsRequired",
    apply(output) {
      const bad = output.receipts.filter((r) => !r.source?.trim() || !r.ref?.trim() || !r.label?.trim());
      if (!output.receipts.length) return { output, action: "blocked", detail: "an argument with no receipts" };
      if (bad.length) return { output, action: "blocked", detail: `${bad.length} receipt(s) without a source` };
      return { output, action: "pass", detail: `${output.receipts.length} receipts, each with a source` };
    },
  };
}

export function dissentKept(): Guardrail<CouncilSession> {
  return {
    name: "dissentKept",
    apply(output) {
      const v = output.verdict;
      if (v.dissent) return { output, action: "pass", detail: `dissent kept: ${v.dissent.seat}` };
      const pro = v.decision === "keep" || v.decision === "adjust";
      const seat = [...SEATS].sort((a, b) => (pro ? v.finalScores[a] - v.finalScores[b] : v.finalScores[b] - v.finalScores[a]))[0];
      const arg = output.arguments.find((a) => a.seat === seat);
      if (!arg) return { output, action: "blocked", detail: "no argument to keep as the dissent" };
      const dissent = { seat, stance: stanceOf(v.finalScores[seat]), headline: arg.headline, receipt: arg.receipts[0] };
      return { output: { ...output, verdict: { ...v, dissent } }, action: "modified", detail: `restored the dropped dissent (${seat})` };
    },
  };
}

const NUM = /\d+(?:[.,]\d+)?/g;
const numbersIn = (text: string) => new Set((text.match(NUM) ?? []).map((n) => n.replace(",", ".")));

/** Numbers in `candidate` that don't appear in `source`. Empty means the rewording is grounded. */
export function ungroundedNumbers(candidate: string, source: string): string[] {
  const known = numbersIn(source);
  return [...numbersIn(candidate)].filter((n) => !known.has(n));
}
