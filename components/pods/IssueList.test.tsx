// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { IssueList, groupByMilestone } from "./IssueList";
import { fallbackMember } from "./members";
import { demoPod } from "./testUtils";

const pod = demoPod(true);
const project = pod.project!;
const people = Object.fromEntries(pod.members.map((m) => [m.userId, fallbackMember(m.userId)]));

afterEach(cleanup);

describe("IssueList", () => {
  it("groups issues under the 3 milestone headings, each row linking to its GitHub issue", () => {
    render(<IssueList project={project} people={people} viewerId="aisha" />);
    const counts = [3, 2, 2];
    project.milestones.forEach((m, i) => {
      const heading = screen.getByRole("heading", { level: 3, name: new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
      const section = heading.closest("section")!;
      const rows = within(section).getAllByTestId("issue-row");
      expect(rows).toHaveLength(counts[i]);
      for (const row of rows) {
        const link = within(row).getByRole("link", { name: /on GitHub/ });
        expect(link.getAttribute("href")).toMatch(/^https:\/\/github\.com\//);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noreferrer");
      }
    });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("shows the assignee and reviewer on each row and marks the viewer's issues", () => {
    render(<IssueList project={project} people={people} viewerId="aisha" />);
    const first = screen.getAllByTestId("issue-row")[0];
    expect(within(first).getByText("Add Docker support")).toBeInTheDocument();
    expect(within(first).getByText("Assigned to you")).toBeInTheDocument();
    expect(within(first).getByText("Reviewer: Priya")).toBeInTheDocument();
    expect(within(first).getByRole("img", { name: "Priya" })).toBeInTheDocument();
    expect(screen.getAllByText("Your issue")).toHaveLength(2);
  });

  it("puts issues with an unknown milestone under the first one", () => {
    const groups = groupByMilestone({ ...project, issues: [{ ...project.issues[0], milestone: "Nope" }] });
    expect(groups[0].issues).toHaveLength(1);
    expect(groups.map((g) => g.issues.length)).toEqual([1, 0, 0]);
  });
});
