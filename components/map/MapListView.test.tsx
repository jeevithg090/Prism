// @vitest-environment jsdom
import fs from "node:fs";
import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeMap, SkillStatus } from "@/lib/types";
import { MapListView } from "./MapListView";
import { MapFilters } from "./MapFilters";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { mapSummary, statusCounts, STATUS_ORDER } from "./mapUtils";

afterEach(cleanup);

const MAP = JSON.parse(fs.readFileSync("data/fixtures/bridgemap.aisha.ml-engineer.json", "utf8")) as BridgeMap;
const rowNames = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);

describe("MapListView (the graph's accessible table)", () => {
  it("renders one row per node, sorted by demand by default, and the Demand header flips the order", async () => {
    const user = userEvent.setup();
    render(<MapListView nodes={MAP.nodes} roleLabel="ML engineer" />);
    expect(screen.getAllByRole("row")).toHaveLength(MAP.nodes.length + 1);
    expect(rowNames()[0]).toBe("Python");
    expect(screen.getByRole("columnheader", { name: /Demand/ })).toHaveAttribute("aria-sort", "descending");
    const docker = screen.getByRole("row", { name: /Docker/ });
    expect(docker).toHaveTextContent("Gap");
    expect(docker).toHaveTextContent("41% of ads");
    expect(docker).toHaveTextContent("Not covered by your degree");
    await user.click(screen.getByRole("button", { name: /Demand/ }));
    expect(screen.getByRole("columnheader", { name: /Demand/ })).toHaveAttribute("aria-sort", "ascending");
    expect(rowNames()[0]).not.toBe("Python");
  });

  it("filters: switching Gap off removes the gap rows", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [active, setActive] = React.useState<Set<SkillStatus>>(new Set(STATUS_ORDER));
      const toggle = (s: SkillStatus) => setActive((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; });
      return (
        <>
          <MapFilters counts={statusCounts(MAP.nodes)} active={active} onToggle={toggle} view="list" onView={vi.fn()} />
          <MapListView nodes={MAP.nodes.filter((n) => active.has(n.status))} roleLabel="ML engineer" />
        </>
      );
    }
    render(<Harness />);
    const gapChip = screen.getByRole("button", { name: /^Gap/ });
    expect(gapChip).toHaveAttribute("aria-pressed", "true");
    await user.click(gapChip);
    expect(gapChip).toHaveAttribute("aria-pressed", "false");
    const gaps = MAP.nodes.filter((n) => n.status === "gap").length;
    expect(screen.getAllByRole("row")).toHaveLength(MAP.nodes.length - gaps + 1);
    expect(screen.queryByRole("row", { name: /Docker/ })).not.toBeInTheDocument();
  });

  it("has a one-sentence text summary written from the data", () => {
    expect(mapSummary(MAP)).toMatch(/you've proven 4, your degree covers \d+ \(\d+ already, \d+ later\) and \d+ are gaps\. Your biggest gap is Docker, in 41% of ads\./);
  });
});

describe("SkillDetailPanel", () => {
  it("for Docker shows 41% of ads, Gap, not covered, and the roadmap week as the next step", () => {
    const docker = MAP.nodes.find((n) => n.skillId === "docker")!;
    render(
      <SkillDetailPanel node={docker} roleId="ml-engineer" uid="aisha" evidence={[]}
        week={{ week: 1, startDate: "2026-11-09", focusSkillId: "docker", isExamWeek: false, proof: "Merge a PR that adds a Dockerfile to your pod repo (VisionAid)", receipt: { demandPct: 41, coveredByDegree: "no", reason: "r" }, tasks: [{ id: "t_1_1", type: "learn", title: "x", free: true, hours: 8 }] }}
        issue={{ podId: "pod_demo01", title: "Containerise the captioning API with Docker", n: 1 }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Docker" })).toBeInTheDocument();
    expect(screen.getByText("41%")).toBeInTheDocument();
    expect(screen.getByText("of ML engineer ads")).toBeInTheDocument();
    expect(screen.getByText("Gap")).toBeInTheDocument();
    expect(screen.getByText("Not covered by your degree")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start week 1: Docker/ })).toHaveAttribute("href", "/roadmap#skill-docker");
    expect(screen.getByRole("link", { name: /Pod issue #1/ })).toHaveAttribute("href", "/pods/pod_demo01");
  });
});
