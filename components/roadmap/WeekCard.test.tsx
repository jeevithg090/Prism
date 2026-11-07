// @vitest-environment jsdom
import fs from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Roadmap } from "@/lib/types";
import { WeekCard } from "./WeekCard";
import { SkippedPanel } from "./SkippedPanel";

afterEach(cleanup);

const RM = JSON.parse(fs.readFileSync("data/fixtures/roadmap.aisha.ml-engineer.json", "utf8")) as Roadmap;

describe("WeekCard", () => {
  it("Why? opens the receipt drawer with the week's reason", async () => {
    const user = userEvent.setup();
    render(<WeekCard week={RM.weeks[0]} skillName="Docker" current defaultExpanded roleLabel="ML engineer" onToggleTask={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Why Docker in week 1?" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Why am I seeing this?");
    expect(dialog).toHaveTextContent("Week 1 · Docker");
    expect(dialog).toHaveTextContent("41% of ML engineer ads ask for Docker");
    expect(dialog).toHaveTextContent("none of your modules teach it");
  });

  it("shows the proof line linking to the pod, the degree link and ticks tasks", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<WeekCard week={RM.weeks[0]} skillName="Docker" current defaultExpanded roleLabel="ML engineer" podHref="/pods/pod_demo01" onToggleTask={onToggle} />);
    expect(screen.getByRole("link", { name: "Merge a PR that adds a Dockerfile to your pod repo (VisionAid)" })).toHaveAttribute("href", "/pods/pod_demo01");
    expect(screen.getByText(/Builds on what you learned about Linux/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Docker's Get Started guide/ }));
    expect(onToggle).toHaveBeenCalledWith("t_1_1", true);
  });

  it("labels an exam week as lighter and keeps its tasks collapsed until asked", async () => {
    const user = userEvent.setup();
    const exam = RM.weeks.find((w) => w.isExamWeek)!;
    render(<WeekCard week={exam} skillName="Vector databases" roleLabel="ML engineer" onToggleTask={vi.fn()} />);
    expect(screen.getByText("Lighter week: exams")).toBeInTheDocument();
    expect(screen.getByText("4h")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Show week ${exam.week} tasks` }));
    expect(screen.getAllByRole("checkbox").length).toBe(exam.tasks.length);
  });
});

describe("SkippedPanel", () => {
  it("renders the degree-covers heading and one item per skipped skill", () => {
    render(<SkippedPanel skipped={RM.skipped} hoursPerWeek={8} />);
    expect(screen.getByRole("heading", { name: "Skipped: your degree covers these" })).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(RM.skipped.length);
    expect(items[0]).toHaveTextContent("Statistics");
    expect(items[0]).toHaveTextContent("COMP1xxx4");
    expect(items[0]).toHaveTextContent("Don't pay for a statistics course");
  });
});
