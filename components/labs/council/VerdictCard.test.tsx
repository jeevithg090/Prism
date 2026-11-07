// @vitest-environment jsdom
import fs from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliberate, motionFor, type CouncilInputs } from "@/lib/labs/council/engine";
import type { CouncilSession } from "@/lib/labs/council/types";
import { AdvocateCard } from "./AdvocateCard";
import { VerdictCard } from "./VerdictCard";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(cleanup);

const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const profile = read("data/fixtures/profile.aisha.json");
const inp: CouncilInputs = {
  facts: { userId: "aisha", startedAt: profile.startedAt, year: 1, hoursPerWeek: 8, constraints: [], targetDate: profile.dna.targetDate, timelineLabel: profile.dna.timelineLabel },
  roleId: "ml-engineer", roleName: "ML engineer", map: read("data/fixtures/bridgemap.aisha.ml-engineer.json"), roadmap: read("data/fixtures/roadmap.aisha.ml-engineer.json"),
  programme: read("data/fixtures/programme.uom-bsc-cs.json"), market: read("data/fixtures/market.ml-engineer.json"), trends: read("data/fixtures/trends.json"), now: new Date("2026-11-07"),
};
const motion = motionFor(inp, "docker");
const d = deliberate(inp, motion);
const session: CouncilSession = {
  id: "council_test0001", userId: "aisha", runId: "run_test01", roleId: "ml-engineer", roleName: "ML engineer", motion,
  arguments: [d.openings.market.arg, d.openings.degree.arg, d.openings.wellbeing.arg], rebuttals: d.rebuttals, verdict: d.verdict,
  consequences: { accept: "Week 1 starts with a 1-hour Linux refresher.", overrule: "Nothing changes in your roadmap." },
  ledgerEntryIds: ["a", "b", "c", "d"], roadmapVersion: 1, createdAt: "2026-11-07T12:00:00Z",
};

describe("VerdictCard", () => {
  it("shows the ruling, the kept dissent, both consequences and the You decide choices", async () => {
    const onDecide = vi.fn();
    const user = userEvent.setup();
    render(<VerdictCard session={session} onDecide={onDecide} deciding={null} />);
    expect(screen.getByRole("heading", { name: "Keep Docker in week 1, with 2 changes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "On record against" })).toBeInTheDocument();
    expect(screen.getAllByText(/8 of 8 hours/).length).toBeGreaterThan(0);
    expect(screen.getByText("Week 1 starts with a 1-hour Linux refresher.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your reason (optional)"), { target: { value: "I booked a workshop" } });
    await user.click(screen.getByRole("button", { name: "Accept the ruling" }));
    expect(onDecide).toHaveBeenCalledWith("accept", "I booked a workshop");
    await user.click(screen.getByRole("button", { name: "View as list" }));
    expect(screen.getByRole("region", { name: "Council scores as a table" })).toHaveTextContent("+0.46");
  }, 20_000);

  it("after a decision shows what changed and links to the roadmap and the run ledger", () => {
    render(<VerdictCard session={{ ...session, decision: { choice: "accept", decidedAt: "2026-11-07T12:01:00Z", applied: true, roadmapVersion: 2, changedWeeks: [1], summary: "Roadmap v2 saved: week 1 now has a Linux refresher and 7 hours." } }} onDecide={vi.fn()} deciding={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("You accepted the ruling");
    expect(screen.queryByRole("button", { name: "Accept the ruling" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open your roadmap" })).toHaveAttribute("href", "/roadmap");
    expect(screen.getByRole("link", { name: /run ledger/ })).toHaveAttribute("href", "/governance");
  });
});

describe("AdvocateCard", () => {
  it("shows stance as icon plus label, receipts with sources and the rebuttal outcome", () => {
    render(<AdvocateCard arg={d.openings.market.arg} finalScore={d.verdict.finalScores.market} rebuttal={d.rebuttals.find((r) => r.from === "market")} />);
    expect(screen.getByRole("heading", { name: "Market advocate" })).toBeInTheDocument();
    expect(screen.getByText("Supports")).toBeInTheDocument();
    expect(screen.getByText("41% of 214 ML engineer ads ask for Docker")).toBeInTheDocument();
    expect(screen.getByText(/Rebuts the wellbeing advocate/)).toBeInTheDocument();
    expect(screen.getByText(/Landed: moved them 0.05/)).toBeInTheDocument();
  });
});
