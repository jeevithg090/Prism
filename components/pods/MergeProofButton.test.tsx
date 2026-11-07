// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjectProgress, ProofResult } from "@/lib/schemas/studio";

const { apiPost, start, toast } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  start: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/fetcher", () => ({
  apiPost,
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/shell/ActivityPanel", () => ({
  useActivity: () => ({
    start,
    events: [],
    open: false,
    setOpen: vi.fn(),
    runId: null,
  }),
}));

import { MergeProofButton } from "@/components/pods/MergeProofButton";
import { projectProgressKey } from "@/components/pods/useProjectProgress";

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>),
  };
}

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

afterEach(cleanup);

describe("MergeProofButton", () => {
  beforeEach(() => {
    apiPost.mockReset();
    start.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("posts the merge, starts the activity panel and calls onProof", async () => {
    apiPost.mockResolvedValue(proof);
    const onProof = vi.fn();
    const { qc } = renderWithQuery(
      <MergeProofButton
        podId="pod_demo01"
        issueIndex={0}
        issueTitle="Containerise the captioning API with Docker"
        onProof={onProof}
      />,
    );
    const btn = screen.getByRole("button", {
      name: "Mark Containerise the captioning API with Docker as merged",
    });
    expect(btn).toHaveTextContent("Mark as merged");
    await userEvent.click(btn);

    expect(apiPost).toHaveBeenCalledWith("/api/projects/merge", {
      podId: "pod_demo01",
      issueIndex: 0,
    });
    expect(await screen.findByText("Merged")).toBeInTheDocument();
    expect(onProof).toHaveBeenCalledWith(proof);
    expect(start).toHaveBeenCalledWith("run_merge1");
    expect(toast.success).not.toHaveBeenCalled(); // the celebration takes over
    const cached = qc.getQueryData<ProjectProgress>(
      projectProgressKey("pod_demo01"),
    );
    expect(cached?.merged.map((m) => m.issueIndex)).toEqual([0]);
  });

  it("toasts the proof when no celebration handler is passed", async () => {
    apiPost.mockResolvedValue(proof);
    renderWithQuery(<MergeProofButton podId="pod_demo01" issueIndex={0} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Mark issue 1 as merged" }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Docker is now proven", {
        description: proof.message,
      }),
    );
  });

  it("shows a Merged pill instead of the button when already merged", () => {
    renderWithQuery(
      <MergeProofButton podId="pod_demo01" issueIndex={0} merged />,
    );
    expect(screen.getByText("Merged")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toasts an error and keeps the button when the merge fails", async () => {
    apiPost.mockRejectedValue(new Error("Pod not found"));
    const onProof = vi.fn();
    renderWithQuery(
      <MergeProofButton podId="pod_x" issueIndex={3} onProof={onProof} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Mark issue 4 as merged" }),
    );
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onProof).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Mark issue 4 as merged" }),
    ).toBeEnabled();
  });
});
