// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProofResult } from "@/lib/schemas/studio";

const motionPrefs = vi.hoisted(() => ({ reduce: true }));
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => motionPrefs.reduce };
});

import { ProofCelebration } from "@/components/pods/ProofCelebration";

const proof: ProofResult = {
  podId: "pod_demo01",
  issueIndex: 0,
  userId: "aisha",
  skillId: "docker",
  skillName: "Docker",
  reviewerUserId: "priya",
  evidenceIds: ["ev_pod_aisha_docker", "ev_pod_priya_review"],
  readinessBefore: 0.38,
  readinessAfter: 0.41,
  badgesEarned: ["shipped"],
  momentumPoints: 5,
  message: "Docker is now proven on Aisha's Bridge Map · readiness 38% → 41%",
  runId: "run_merge1",
};
const names = { aisha: "Aisha Rahman", priya: "Priya Shah" };

afterEach(cleanup);

describe("ProofCelebration", () => {
  beforeEach(() => {
    motionPrefs.reduce = true;
  });

  it("renders the skill, both readiness numbers, the delta and the Shipped badge", () => {
    render(
      <ProofCelebration result={proof} names={names} onClose={() => {}} />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Docker is now proven" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("readiness-before")).toHaveTextContent("38%");
    expect(screen.getByTestId("readiness-after")).toHaveTextContent("41%");
    expect(screen.getByText("+3 points")).toBeInTheDocument();
    expect(
      screen.getByText("Readiness went from 38% to 41%, +3 points."),
    ).toBeInTheDocument();
    expect(screen.getByText("Shipped")).toBeInTheDocument();
    expect(screen.getByText(/\+5 momentum/)).toBeInTheDocument();
    expect(screen.getByTestId("reviewer-proof")).toHaveTextContent(
      "Priya earned a Code review proof for teaching you",
    );
    expect(screen.getByText("Gap")).toBeInTheDocument();
    expect(screen.getByText("Proven")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /See it on my Bridge Map/ }),
    ).toHaveAttribute("href", "/map");
  });

  it("counts readiness up from the old value when motion is allowed", async () => {
    motionPrefs.reduce = false;
    render(
      <ProofCelebration result={proof} names={names} onClose={() => {}} />,
    );
    expect(screen.getByTestId("readiness-after")).toHaveTextContent("38%");
    await vi.waitFor(
      () =>
        expect(screen.getByTestId("readiness-after")).toHaveTextContent("41%"),
      { timeout: 4000 },
    );
  });

  it("closes from Back to the project and renders nothing without a result", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ProofCelebration result={proof} names={names} onClose={onClose} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Back to the project" }),
    );
    expect(onClose).toHaveBeenCalled();
    rerender(
      <ProofCelebration result={null} names={names} onClose={onClose} />,
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("for a skill that was already proven, shows the Built it rung and hides the status change and readiness", () => {
    render(
      <ProofCelebration
        result={{ ...proof, readinessAfter: 0.38, statusBefore: "proven" } as ProofResult}
        names={names}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "You built it: Docker" })).toBeInTheDocument();
    expect(screen.getByTestId("ladder-step")).toBeInTheDocument();
    expect(screen.queryByText(/changed from/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("readiness-before")).not.toBeInTheDocument();
  });

  it("hides the readiness block when the merge didn't move readiness", () => {
    render(<ProofCelebration result={{ ...proof, readinessAfter: 0.38 }} names={names} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Docker is now proven" })).toBeInTheDocument();
    expect(screen.queryByTestId("readiness-after")).not.toBeInTheDocument();
  });
});
