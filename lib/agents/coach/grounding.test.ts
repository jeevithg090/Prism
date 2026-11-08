import { describe, expect, it } from "vitest";
import { allowedNumbers, groundAnswer, numbersIn } from "./grounding";
import { FACTS } from "./testTools";

describe("grounding check", () => {
  it("finds standalone numbers but not codes or ids", () => {
    expect(numbersIn("Docker is 41% of ads; COMP2xxx2 in W45, pod_ab12, score 0.82, 1,200 ads")).toEqual(["41%", "0.82", "1,200"]);
  });

  it("allows numbers from facts (0.41 also allows 41) and from observation texts", () => {
    const allowed = allowedNumbers({ score: 0.41, weekNumber: 1, receipt: "Docker: 41% of ads" }, ["Created VisionAid with 7 issues"]);
    expect([...allowed].sort()).toEqual(["0.41", "1", "41", "7"]);
  });

  it("keeps a grounded answer as-is", () => {
    const r = groundAnswer("Your readiness is 38% now and 84% projected. Docker: 41% of ML engineer ads.", { facts: FACTS, sources: [] });
    expect(r.removed).toEqual([]);
    expect(r.checked).toEqual(["38%", "84%", "41%"]);
    expect(r.answer).toBe("Your readiness is 38% now and 84% projected. Docker: 41% of ML engineer ads.");
  });

  it("rewrites a sentence with an invented number without that number", () => {
    const r = groundAnswer("Docker appears in 73% of ML engineer ads. Your readiness is 38% now.", { facts: FACTS, sources: [] });
    expect(r.removed).toEqual(["73%"]);
    expect(r.answer).toBe("Docker appears in many ML engineer ads. Your readiness is 38% now.");
    expect(r.answer).not.toMatch(/73/);
  });

  it("handles invented counts, durations and targets", () => {
    expect(groundAnswer("You should spend 12 hours on it.", { facts: FACTS, sources: [] }).answer).toBe("You should spend a few hours on it.");
    expect(groundAnswer("Ask 3 students for help.", { facts: FACTS, sources: [] }).answer).toBe("Ask several students for help.");
    expect(groundAnswer("Your readiness will rise to 95% by June.", { facts: FACTS, sources: [] }).answer).toBe("Your readiness will rise by June.");
  });

  it("drops a sentence it can't rewrite, keeps paragraphs, and never returns an empty answer", () => {
    const r = groundAnswer("Focus on Docker this week.\nReceipt · Docker: 41% of ML engineer ads.\nIt is 2x faster.", { facts: FACTS, sources: [] });
    expect(r.answer).toBe("Focus on Docker this week.\nReceipt · Docker: 41% of ML engineer ads.\nIt is 2x faster.");
    const only = groundAnswer("99.", { facts: FACTS, sources: [] });
    expect(only.removed).toEqual(["99"]);
    expect(only.answer.length).toBeGreaterThan(10);
  });
});
