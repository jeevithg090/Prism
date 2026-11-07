// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Pod } from "@/lib/types";
import {
  SkillExchangeGraph,
  buildExchangeEdges,
  describeExchange,
  groupExchangeEdges,
} from "@/components/pods/SkillExchangeGraph";

const pod = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/fixtures/pod.aisha.json"),
    "utf8",
  ),
) as Pod;
const names = {
  aisha: "Aisha Rahman",
  priya: "Priya Shah",
  tom: "Tom Okafor",
  mei: "Mei Lin",
};

afterEach(cleanup);

describe("buildExchangeEdges", () => {
  it("links every teacher to every learner of a skill they teach (fixture pod)", () => {
    const edges = buildExchangeEdges(pod);
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: "priya", to: "aisha", skillId: "docker" },
        { from: "priya", to: "aisha", skillId: "pytorch" },
        { from: "tom", to: "aisha", skillId: "sql" },
        { from: "aisha", to: "mei", skillId: "python" },
        { from: "priya", to: "mei", skillId: "python" },
        { from: "priya", to: "tom", skillId: "pytorch" },
        { from: "tom", to: "priya", skillId: "sql" },
        { from: "tom", to: "priya", skillId: "aws" },
        { from: "mei", to: "tom", skillId: "react" },
      ]),
    );
    expect(edges).toHaveLength(9);
    // nobody teaches themselves, and nobody is taught a skill they did not ask to learn
    for (const e of edges) {
      expect(e.from).not.toBe(e.to);
      expect(pod.members.find((m) => m.userId === e.to)?.learns).toContain(
        e.skillId,
      );
      expect(pod.members.find((m) => m.userId === e.from)?.teaches).toContain(
        e.skillId,
      );
    }
  });

  it("ignores duplicate skills and returns [] when nobody can teach anybody", () => {
    expect(
      buildExchangeEdges({
        members: [
          { userId: "a", learns: ["sql"], teaches: ["git", "git"], role: "" },
          { userId: "b", learns: ["git"], teaches: ["react"], role: "" },
        ],
      }),
    ).toEqual([{ from: "a", to: "b", skillId: "git" }]);
    expect(
      buildExchangeEdges({
        members: [{ userId: "a", learns: ["sql"], teaches: ["sql"], role: "" }],
      }),
    ).toEqual([]);
  });

  it("groups skills per teacher → learner arrow and describes it in second person", () => {
    const groups = groupExchangeEdges(buildExchangeEdges(pod));
    expect(groups).toHaveLength(7);
    const pa = groups.find((g) => g.key === "priya>aisha")!;
    expect(pa.skillIds).toEqual(["pytorch", "docker"]);
    expect(describeExchange(pa, names, "aisha")).toBe(
      "Priya teaches PyTorch and Docker to you",
    );
    expect(describeExchange(pa, names)).toBe(
      "Priya teaches PyTorch and Docker to Aisha",
    );
    expect(
      describeExchange(
        groups.find((g) => g.key === "aisha>mei")!,
        names,
        "aisha",
      ),
    ).toBe("You teach Python to Mei");
  });
});

describe("SkillExchangeGraph", () => {
  it("renders an accessible graph with a text summary and highlights the viewer", () => {
    const { container } = render(
      <SkillExchangeGraph pod={pod} names={names} viewerId="aisha" />,
    );
    const img = screen.getByRole("img", {
      name: /Pod Aurora skill exchange graph: 4 podmates and 9 skills/,
    });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(container.querySelectorAll("[data-edge]")).toHaveLength(7);
    expect(container.querySelector('[data-node="aisha"]')).toHaveAttribute(
      "data-viewer",
      "true",
    );
    expect(container.querySelector('[data-node="priya"]')).not.toHaveAttribute(
      "data-viewer",
    );

    const list = screen.getByRole("list", { name: "Skill swaps" });
    expect(
      within(list).getByText("Tom teaches SQL to you"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Priya teaches PyTorch and Docker to you"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mei teaches React to Tom")).toBeInTheDocument();
    expect(screen.getByText("Knowledge graph")).toBeInTheDocument();
    expect(screen.getByText("teaches")).toBeInTheDocument();
    // by default the viewer's arrows are lit
    expect(
      container.querySelector('[data-edge="priya>aisha"]'),
    ).toHaveAttribute("data-active", "true");
    expect(
      container.querySelector('[data-edge="mei>tom"]'),
    ).not.toHaveAttribute("data-active");
  });

  it("focusing a podmate highlights only their arrows", () => {
    const { container } = render(
      <SkillExchangeGraph pod={pod} names={names} viewerId="aisha" />,
    );
    fireEvent.focus(
      screen.getByRole("button", { name: "Trace Mei's skill swaps" }),
    );
    expect(container.querySelector('[data-edge="mei>tom"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(container.querySelector('[data-edge="aisha>mei"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      container.querySelector('[data-edge="priya>aisha"]'),
    ).not.toHaveAttribute("data-active");
    fireEvent.mouseEnter(container.querySelector('[data-node="tom"]')!);
    expect(container.querySelector('[data-edge="tom>priya"]')).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("shows a friendly empty state when nobody can teach anybody", () => {
    render(
      <SkillExchangeGraph
        pod={{
          ...pod,
          members: pod.members.map((m) => ({ ...m, teaches: [] })),
        }}
        names={names}
      />,
    );
    expect(screen.getByText(/No skill swaps yet/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
