import { describe, expect, it } from "vitest";
import type { Trajectory, TrajectoryStep } from "@/lib/types";
import { buildSankeyData, journeyPath, outcomeGroup, pathRows, summarise, toChartLinks } from "./sankey";

const t = (id: string, outcomeRole: string, steps: TrajectoryStep[]): Trajectory => ({
  id, userId: id, name: id, programmeId: "uom-bsc-cs", outcomeRole, steps, advice: "Start small.", isDemo: true, openToChat: true,
});

const three: Trajectory[] = [
  t("a", "ML engineer at a Manchester health-tech startup", [
    { year: 1, kind: "society", label: "Joined the robotics society" },
    { year: 3, kind: "placement", label: "Year in industry at an ML consultancy" },
    { year: 4, kind: "first-role", label: "ML engineer" },
  ]),
  t("b", "PhD in ML", [
    { year: 1, kind: "hackathon", label: "GreatUniHack: built a CV app" },
    { year: 2, kind: "project", label: "Open-source contribution to scikit-learn docs" },
  ]),
  t("c", "Software engineer at a bank", [
    { year: 1, kind: "society", label: "Computing society" },
    { year: 2, kind: "internship", label: "Summer internship at a bank" },
  ]),
];

describe("buildSankeyData", () => {
  it("3 trajectories produce the right nodes, links and summary", () => {
    const d = buildSankeyData(three);
    expect(d.nodes.map((n) => n.name)).toEqual(["Society", "Hackathon", "Placement", "Internship", "Open source", "ML", "SWE", "PhD"]);
    expect(d.nodes).toHaveLength(8);
    expect(d.links).toHaveLength(6);
    const name = (i: number) => d.nodes[i].name;
    expect(d.links.map((l) => `${name(l.source)}>${name(l.target)}:${l.value}`).sort()).toEqual([
      "Hackathon>Open source:1", "Internship>SWE:1", "Open source>PhD:1", "Placement>ML:1", "Society>Internship:1", "Society>Placement:1",
    ]);
    expect(d.nodes.find((n) => n.name === "Society")?.count).toBe(2);
    expect(d.summary).toBe("Of 3 journeys, 1 led to ML roles; 1 of those included a placement.");
  });

  it("merges identical paths into one link with a higher count", () => {
    const d = buildSankeyData([three[0], { ...three[0], id: "a2", userId: "a2" }]);
    expect(d.links.map((l) => l.value)).toEqual([2, 2]);
    expect(d.summary).toBe("Of 2 journeys, 2 led to ML roles; 2 of those included a placement.");
  });

  it("falls back to Modules and Coursework", () => {
    const p = journeyPath(t("x", "Founded a startup", [{ year: 1, kind: "module-choice", label: "Picked AI modules" }, { year: 2, kind: "society", label: "Ran the hack society" }]));
    expect(p).toEqual({ y1: "Modules", y23: "Coursework", outcome: "Startup" });
  });

  it("groups outcomes", () => {
    expect(outcomeGroup("ML engineer at a Manchester health-tech startup")).toBe("ML");
    expect(outcomeGroup("PhD in ML")).toBe("PhD");
    expect(outcomeGroup("Founded a startup")).toBe("Startup");
    expect(outcomeGroup("SRE at a cloud company")).toBe("SWE");
    expect(outcomeGroup("Data analyst at a retailer")).toBe("Data");
    expect(outcomeGroup("NLP engineer at a legal-tech startup")).toBe("ML");
    expect(outcomeGroup("Analytics engineer at a retailer")).toBe("Data");
    expect(outcomeGroup("Teacher")).toBe("Other");
  });

  it("summarises other groups and the empty case", () => {
    expect(summarise(three, "SWE")).toBe("Of 3 journeys, 1 led to software roles; 0 of those included a placement.");
    expect(summarise(three, "Data")).toBe("Of 3 journeys, none led to data roles yet.");
    expect(summarise([])).toBe("No journeys have been shared yet.");
  });

  it("splits chart links by outcome with unique values and keeps list rows", () => {
    const d = buildSankeyData([...three, { ...three[2], id: "c2", userId: "c2", outcomeRole: "ML engineer" }]);
    const links = toChartLinks(d);
    const keys = links.map((l) => `${l.source}-${l.target}-${l.value}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(links.reduce((s, l) => s + l.count, 0)).toBe(8); // 4 journeys × 2 hops
    expect(pathRows(three)).toHaveLength(3);
  });
});
