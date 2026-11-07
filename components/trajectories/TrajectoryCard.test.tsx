// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trajectory } from "@/lib/types";
import { TrajectoryCard } from "./TrajectoryCard";

const base: Trajectory = {
  id: "traj_priya", userId: "priya", name: "Priya Shah", programmeId: "uom-bsc-cs",
  outcomeRole: "ML engineer at a Manchester health-tech startup", advice: "Ship one small thing every month.", isDemo: true, openToChat: true,
  steps: [
    { year: 1, kind: "society", label: "Joined the robotics society" },
    { year: 3, kind: "placement", label: "Year in industry at an ML consultancy" },
    { year: 4, kind: "first-role", label: "ML engineer" },
  ],
};

afterEach(cleanup);

describe("TrajectoryCard", () => {
  it("shows name, outcome, timeline, advice, demo note and similarity", () => {
    render(<TrajectoryCard trajectory={base} similarity={0.873} />);
    expect(screen.getByRole("heading", { name: "Priya Shah" })).toBeInTheDocument();
    expect(screen.getByText("ML engineer at a Manchester health\u2011tech startup")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Year in industry at an ML consultancy")).toBeInTheDocument();
    expect(screen.getByText(/Ship one small thing/)).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
  });

  it("shows Ask for 15 minutes when openToChat and calls onAsk", async () => {
    const onAsk = vi.fn();
    render(<TrajectoryCard trajectory={base} onAsk={onAsk} />);
    await userEvent.click(screen.getByRole("button", { name: /Ask for 15 minutes/ }));
    expect(onAsk).toHaveBeenCalledWith(base);
  });

  it("hides the Ask button when openToChat is false", () => {
    render(<TrajectoryCard trajectory={{ ...base, openToChat: false }} onAsk={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Ask for 15 minutes/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Not taking chats/)).toBeInTheDocument();
  });
});
