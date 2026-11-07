// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentName } from "@/lib/types";
import { AGENT_META, AgentAvatar, BadgePill, DemoDataNote, EmptyState, ErrorState, LoadingSkeleton, ReadinessRing, SkillChip, StatCard, StatusBadge } from "./index";

afterEach(cleanup);

describe("ReadinessRing", () => {
  it("is an image labelled 'Readiness 38 percent, projected 84 percent' and counts up to 38%", async () => {
    render(<ReadinessRing value={0.38} projected={0.84} label="→ 84% by Sep 2027" />);
    const ring = screen.getByRole("img", { name: "Readiness 38 percent, projected 84 percent" });
    await waitFor(() => expect(ring).toHaveTextContent("38%"), { timeout: 2000 });
    expect(ring).toHaveTextContent("→ 84% by Sep 2027");
    // Two arcs on a track: the projected ghost arc and the solid value arc.
    expect(ring.querySelectorAll("circle")).toHaveLength(3);
  });

  it("omits the ghost arc and the projected words without a projection", () => {
    render(<ReadinessRing value={0.5} label="today" />);
    expect(screen.getByRole("img", { name: "Readiness 50 percent" })).toBeInTheDocument();
    expect(screen.getByRole("img").querySelectorAll("circle")).toHaveLength(2);
  });
});

describe("AgentAvatar", () => {
  it("has its own icon, colour and name for all 14 agents", () => {
    const agents = Object.keys(AGENT_META) as AgentName[];
    expect(agents).toHaveLength(14);
    render(<>{agents.map((a) => <AgentAvatar key={a} agent={a} size={40} />)}</>);
    for (const a of agents) {
      const el = screen.getByRole("img", { name: AGENT_META[a].name });
      expect(el.querySelector("svg")).not.toBeNull();
      expect(el.className).toMatch(/bg-\w+-500\//);
    }
    expect(new Set(agents.map((a) => AGENT_META[a].cls.split(" ")[0])).size).toBe(14);
  });
});

describe("StatusBadge and SkillChip", () => {
  it("StatusBadge always pairs an icon with a label; degree-upcoming is dashed", () => {
    const { container } = render(<><StatusBadge status="gap" /><StatusBadge status="degree-upcoming" /></>);
    expect(screen.getByText("Gap").querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Degree · later")).toHaveClass("border-dashed");
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("SkillChip with onClick is a button labelled with its level", async () => {
    const onClick = vi.fn();
    render(<SkillChip skillId="docker" name="Docker" status="gap" level={2} onClick={onClick} />);
    const chip = screen.getByRole("button", { name: /level 2 of 3/ });
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalled();
  });

  it("a plain SkillChip carries its status as text, not as a prohibited aria-label", () => {
    render(<SkillChip skillId="docker" name="Docker" status="gap" level={0} />);
    const chip = screen.getByText("Docker").parentElement!;
    expect(chip).not.toHaveAttribute("aria-label");
    expect(chip).toHaveTextContent("Docker, gap, level 0 of 3");
  });
});

describe("StatCard, EmptyState, ErrorState", () => {
  it("StatCard shows the number, a signed delta and its context line", () => {
    render(<StatCard label="Market pulse" value={214} delta={-4} hint="ML engineer ads analysed" />);
    expect(screen.getByText("214")).toHaveClass("tabular-nums");
    expect(screen.getByText(/4%/)).toHaveTextContent("−4%");
    expect(screen.getByText("ML engineer ads analysed")).toBeInTheDocument();
  });

  it("EmptyState shows one action", () => {
    render(<EmptyState title="No roadmap yet" body="Build one in a minute." action={<button>Build my roadmap</button>} />);
    expect(screen.getByRole("heading", { name: "No roadmap yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("ErrorState: Retry calls onRetry, Use demo data calls onUseDemo", async () => {
    const onRetry = vi.fn();
    const onUseDemo = vi.fn();
    render(<ErrorState body="That's on us." onRetry={onRetry} onUseDemo={onUseDemo} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await userEvent.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onUseDemo).toHaveBeenCalledTimes(1);
  });

  it("BadgePill, DemoDataNote and LoadingSkeleton keep their text", () => {
    render(<><BadgePill badge="new-to-uni" /><DemoDataNote /><LoadingSkeleton variant="list" /></>);
    expect(screen.getByText("New to UoM")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
