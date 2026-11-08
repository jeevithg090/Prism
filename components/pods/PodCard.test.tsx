// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectBrief } from "@/lib/types";
import { PodCard } from "./PodCard";
import { demoPod, profileGet, renderWithClient } from "./testUtils";

const { apiGet, apiPost, push, toastSuccess } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  push: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("@/lib/fetcher", () => ({ apiGet, apiPost, apiPatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: toastSuccess, error: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation(profileGet);
});

afterEach(cleanup);

describe("PodCard", () => {
  it("renders a MemberRow for each of the 4 members and the review-swap explanations", async () => {
    renderWithClient(<PodCard pod={demoPod(false)} viewerId="aisha" onFindDifferent={() => {}} />);
    const rows = within(screen.getByRole("list", { name: "Members" })).getAllByTestId("member-row");
    expect(rows).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Pod Aurora" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Compatibility" })).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getAllByText(/reviews your/).length).toBeGreaterThan(0);
    expect(rows[0]).toHaveTextContent("Learns:");
    expect(rows[0]).toHaveTextContent("Teaches:");
    // Profile names replace the capitalised ids once loaded.
    expect(await screen.findByText("Priya Shah")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Find a different pod/ })).toBeInTheDocument();
  });

  it("starts the project: POSTs the podId, shows a disabled 'Designing your project…' button, then navigates", async () => {
    let resolve!: (b: ProjectBrief) => void;
    apiPost.mockImplementation(() => new Promise<ProjectBrief>((r) => { resolve = r; }));
    const user = userEvent.setup();
    renderWithClient(<PodCard pod={demoPod(false)} viewerId="aisha" cta="start" />);

    await user.click(screen.getByRole("button", { name: /Start our project/ }));
    expect(apiPost).toHaveBeenCalledWith("/api/projects/create", { podId: "pod_demo01" });
    const busy = await screen.findByRole("button", { name: /Designing your project…/ });
    expect(busy).toBeDisabled();
    expect(push).not.toHaveBeenCalled();

    resolve(demoPod(true).project!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pods/pod_demo01"));
    expect(toastSuccess).toHaveBeenCalledWith("Repo is live", expect.objectContaining({ action: expect.objectContaining({ label: "Open repo" }) }));
  });

  it("links to the existing project instead of creating another one", () => {
    renderWithClient(<PodCard pod={demoPod(true)} viewerId="aisha" />);
    expect(screen.getByRole("link", { name: /Open our project/ })).toHaveAttribute("href", "/pods/pod_demo01");
    expect(screen.queryByRole("button", { name: /Start our project/ })).not.toBeInTheDocument();
  });
});
