// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PRReview } from "@/lib/schemas/studio";

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

import { PRReviewPanel } from "@/components/pods/PRReviewPanel";

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const review: PRReview = {
  prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8",
  prTitle: "Containerise the captioning API",
  comment: "- What happens…",
  hints: [
    "What happens to your image size if you copy the whole repo before installing requirements?",
    "How could `docker compose` know the API is healthy before marking it up?",
    "Which user does your container run as, and does it need to be root?",
  ],
  posted: true,
  source: "live",
  runId: "run_review1",
};

afterEach(cleanup);

describe("PRReviewPanel", () => {
  beforeEach(() => {
    apiPost.mockReset();
    start.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("calls the review API with the podId and renders the hints", async () => {
    let resolve!: (r: PRReview) => void;
    apiPost.mockReturnValue(new Promise<PRReview>((r) => (resolve = r)));
    const onReviewed = vi.fn();
    renderWithQuery(
      <PRReviewPanel podId="pod_demo01" onReviewed={onReviewed} />,
    );

    expect(
      screen.getByRole("heading", { name: "AI Tech Lead" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Socratic review: hints and questions, never the answer.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Review my PR now/ }),
    );

    expect(apiPost).toHaveBeenCalledWith("/api/projects/review", {
      podId: "pod_demo01",
    });
    const waiting = await screen.findByRole("button", {
      name: /Reading the diff…/,
    });
    expect(waiting).toBeDisabled();

    resolve(review);
    const list = await screen.findByRole("list", {
      name: "Hints from the Tech Lead",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(list).getByText(/image size if you copy the whole repo/),
    ).toBeInTheDocument();
    expect(within(list).getByText("docker compose").tagName).toBe("CODE");
    expect(
      screen.getByRole("link", { name: /Containerise the captioning API/ }),
    ).toHaveAttribute("href", review.prUrl);
    expect(screen.getByText("Hints, not answers")).toBeInTheDocument();
    expect(screen.getByText("Posted on GitHub ✓")).toBeInTheDocument();
    expect(start).toHaveBeenCalledWith("run_review1");
    expect(onReviewed).toHaveBeenCalledWith(review);
    expect(toast.success).toHaveBeenCalled();
  });

  it("labels an unposted review as a demo preview and skips the activity panel without a runId", async () => {
    apiPost.mockResolvedValue({
      ...review,
      posted: false,
      source: "demo",
      runId: undefined,
    });
    renderWithQuery(<PRReviewPanel podId="pod_demo01" />);
    await userEvent.click(
      screen.getByRole("button", { name: /Review my PR now/ }),
    );
    expect(await screen.findByText("Preview: demo mode")).toBeInTheDocument();
    expect(screen.queryByText("Posted on GitHub ✓")).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it("shows an error with Retry that calls the API again", async () => {
    apiPost
      .mockRejectedValueOnce(new Error("No open pull request in this repo yet"))
      .mockResolvedValueOnce(review);
    renderWithQuery(<PRReviewPanel podId="pod_demo01" />);
    await userEvent.click(
      screen.getByRole("button", { name: /Review my PR now/ }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No open pull request in this repo yet");
    expect(toast.error).toHaveBeenCalled();
    await userEvent.click(within(alert).getByRole("button", { name: /Retry/ }));
    expect(apiPost).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole("list", { name: "Hints from the Tech Lead" }),
    ).toBeInTheDocument();
  });
});
