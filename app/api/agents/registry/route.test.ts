import { describe, expect, it } from "vitest";
import { GET } from "./route";

const ALL_AGENTS = [
  "orchestrator", "syllabus", "skillmap", "market", "trends", "evidence", "roadmap",
  "matchmaker", "architect", "techlead", "trajectories", "guides", "voice", "n8n",
];

describe("GET /api/agents/registry", () => {
  it("lists all 14 contract agents once, each with role, tools, guardrails, fallback and owner", async () => {
    const json = await (await GET()).json();
    expect(json.ok).toBe(true);
    const agents = json.data.map((e: { agent: string }) => e.agent);
    expect([...agents].sort()).toEqual([...ALL_AGENTS].sort());
    for (const e of json.data) {
      expect(e.role.length).toBeGreaterThan(10);
      expect(e.tools.length).toBeGreaterThan(0);
      expect(e.guardrails.length).toBeGreaterThan(0);
      expect(e.fallback.length).toBeGreaterThan(0);
      expect(["P1", "P2", "P3", "P4", "P5"]).toContain(e.owner);
      if (e.humanCheckpoint) expect(e.checkpointKind).toBeTruthy();
    }
  });

  it("matches the P5 harness: architect and techlead are peer-approved, guides is student-sends", async () => {
    const json = await (await GET()).json();
    const by = Object.fromEntries(json.data.map((e: { agent: string }) => [e.agent, e]));
    expect(by.architect).toMatchObject({ checkpointKind: "peer-approval", humanCheckpoint: "Each issue is reviewed and merged by a podmate, never by the AI" });
    expect(by.techlead.guardrails).toContain("noFullSolutions");
    expect(by.guides).toMatchObject({ checkpointKind: "student-sends" });
    expect(by.guides.guardrails).toEqual(expect.arrayContaining(["noOutboundMessaging", "piiRedactor"]));
    expect(by.matchmaker.guardrails).toContain("noDemographicSignals");
    expect(by.matchmaker.humanCheckpoint).toBeUndefined();
  });
});
