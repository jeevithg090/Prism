import { describe, expect, it } from "vitest";
import type { GuardrailCtx, GuardrailFinding } from "./harness";
import {
  anonymityThreshold, CODE_REMOVED, findDemographicSignals, maxItems, noDemographicSignals, noFullSolutions,
  noOutboundMessaging, piiRedactor, redactCount, redactForLLM, redactPII, SOLUTION_REMOVED, stripLongCodeBlocks,
} from "./guardrails";

const ctx = (o: Partial<GuardrailCtx> = {}): GuardrailCtx => ({ runId: "run_g", agent: "matchmaker", input: undefined, memo: {}, ...o });
const block = (n: number) => ["```ts", ...Array.from({ length: n }, (_, i) => `const x${i} = ${i};`), "```"].join("\n");
const longest = (s: string) => Math.max(0, ...[...s.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].split("\n").filter(Boolean).length));

describe("noFullSolutions", () => {
  const g = noFullSolutions<unknown>();

  it("strips fenced blocks longer than 5 lines and keeps short ones", () => {
    const r = g.apply(`Why this loop?\n${block(3)}\nAnd this?\n${block(9)}`, ctx());
    expect(r.action).toBe("modified");
    expect(r.output).toContain("const x2 = 2;");
    expect(r.output).not.toContain("const x8 = 8;");
    expect(r.output).toContain(CODE_REMOVED);
    expect(longest(r.output as string)).toBeLessThanOrEqual(5);
    expect(r.detail).toMatch(/stripped 1 code block \(longest 9 lines\)/);
  });

  it("works on string fields of objects and arrays", () => {
    const r = g.apply({ title: "Add Docker", issues: [{ body: block(8) }, { body: "- [ ] done" }] }, ctx());
    const out = r.output as { title: string; issues: { body: string }[] };
    expect(r.action).toBe("modified");
    expect(out.title).toBe("Add Docker");
    expect(out.issues[0].body).toBe(CODE_REMOVED);
    expect(out.issues[1].body).toBe("- [ ] done");
  });

  it("flags and removes lines that offer a full solution, but not ones that refuse to", () => {
    const r = g.apply("- What does this return?\nHere is the full solution: just call sort().\n- I won't give you the complete solution, but check the docs.", ctx());
    expect(r.action).toBe("modified");
    expect(r.output).toContain(SOLUTION_REMOVED);
    expect(r.output).not.toContain("just call sort()");
    expect(r.output).toContain("I won't give you the complete solution");
    expect(r.detail).toContain('flagged "here is the full solution"');
    expect(g.apply("Run a complete code review together.", ctx()).action).toBe("pass");
  });

  it("passes clean Socratic text unchanged", () => {
    const text = `- Which docs explain layer caching?\n${block(2)}`;
    expect(g.apply(text, ctx())).toEqual({ output: text, action: "pass" });
    expect(stripLongCodeBlocks("Hi\n~~~\na\nb")).not.toContain("\na\n"); // unclosed fence
  });
});

describe("noDemographicSignals", () => {
  const g = noDemographicSignals<unknown>();
  const cand = (badges: string[]) => ({ userId: "u", proven: ["python"], gaps: [], interests: ["international development"], badges, year: 1 });

  it("blocks when scoring inputs carry international / first-gen / career-changer", () => {
    const r = g.apply({}, ctx({ memo: { scoringInputs: [cand(["new-to-uni", "international"]), cand(["first-gen"]), cand(["international"])] } }));
    expect(r.action).toBe("blocked");
    expect(r.detail).toContain("international ×2");
    expect(r.detail).toContain("first-gen");
    expect(findDemographicSignals({ gender: "f" })).toEqual(["key:gender"]);
  });

  it("allows the new-to-uni tenure badge (near-peer mix rule) and free-text interests", () => {
    const r = g.apply({}, ctx({ memo: { scoringInputs: [cand(["new-to-uni"]), cand([])] } }));
    expect(r.action).toBe("pass");
    expect(r.detail).toContain("2 scoring inputs checked");
  });

  it("falls back to the run input, or a custom selector", () => {
    expect(g.apply({}, ctx({ input: { userId: "aisha" } })).action).toBe("pass");
    const custom = noDemographicSignals<{ inputs: unknown }>({ inputs: (o) => o.inputs });
    expect(custom.apply({ inputs: [cand(["career-changer"])] }, ctx()).action).toBe("blocked");
  });
});

describe("anonymityThreshold", () => {
  const g = anonymityThreshold<{ cohortSize: number; suppressed: boolean; peerTeachable: string[] }>(10);
  it("suppresses aggregates about fewer than 10 people", () => {
    const r = g.apply({ cohortSize: 7, suppressed: false, peerTeachable: ["docker"] }, ctx());
    expect(r.action).toBe("modified");
    expect(r.output).toEqual({ cohortSize: 7, suppressed: true, peerTeachable: [] });
  });
  it("passes groups of 10 or more", () => {
    const o = { cohortSize: 12, suppressed: false, peerTeachable: ["docker"] };
    expect(g.apply(o, ctx())).toMatchObject({ output: o, action: "pass" });
  });
});

describe("piiRedactor / redactPII", () => {
  it("redacts emails and UK / international phone numbers", () => {
    const text = "Mail jo.smith+talks@example.co.uk or call 07700 900123, +44 161 123 4567 or (0161) 123-4567.";
    const r = redactCount(text);
    expect(r.text).toBe("Mail [email] or call [phone], [phone] or [phone].");
    expect(r).toMatchObject({ emails: 1, phones: 3 });
  });

  it("leaves dates, years, URLs and short numbers alone", () => {
    const text = "Meetup on 2026-11-07 18:00 at https://www.meetup.com/docker-manchester/events/301234567890/ (room 2.15, 2024-2026)";
    expect(redactPII(text)).toBe(text);
  });

  it("as an output guardrail, redacts string fields but skips keys like publicUrl", () => {
    const g = piiRedactor<{ whyRelevant: string; publicUrl: string }>({ skipKeys: ["publicUrl"] });
    const r = g.apply({ whyRelevant: "Email jo@example.org", publicUrl: "https://x.org/u/jo@example.org" }, ctx());
    expect(r.action).toBe("modified");
    expect(r.output).toEqual({ whyRelevant: "Email [email]", publicUrl: "https://x.org/u/jo@example.org" });
  });

  it("redactForLLM records a finding on the run", () => {
    const findings: GuardrailFinding[] = [];
    const out = redactForLLM({ record: (f) => findings.push(f) }, { people: [{ context: "Call 07700 900123" }] });
    expect(out).toEqual({ people: [{ context: "Call [phone]" }] });
    expect(findings).toEqual([{ name: "piiRedactor", action: "modified", detail: "redacted 1 phone number in the LLM input" }]);
  });
});

describe("noOutboundMessaging", () => {
  const g = noOutboundMessaging<unknown>();
  it("passes drafts and blocks outputs with send intent", () => {
    expect(g.apply([{ name: "Jo", draftMessage: "Hi Jo", publicUrl: "https://github.com/jo" }], ctx()).action).toBe("pass");
    expect(g.apply([{ name: "Jo", draftMessage: "Hi", recipient: "jo@x.org" }], ctx())).toMatchObject({ action: "blocked", detail: "send intent: recipient" });
    expect(g.apply({ autoSend: true }, ctx()).action).toBe("blocked");
    expect(g.apply({ autoSend: false }, ctx()).action).toBe("pass");
    expect(g.apply({ publicUrl: "mailto:jo@x.org" }, ctx()).action).toBe("blocked");
  });
});

describe("maxItems", () => {
  it("caps arrays and array fields", () => {
    expect(maxItems<number[]>(2).apply([1, 2, 3], ctx())).toEqual({ output: [1, 2], action: "modified", detail: "capped items at 2 (was 3)" });
    expect(maxItems<number[]>(5).apply([1, 2], ctx()).action).toBe("pass");
    const r = maxItems<{ issues: number[] }>(1, { field: "issues" }).apply({ issues: [1, 2] }, ctx());
    expect(r.output).toEqual({ issues: [1] });
  });
});
