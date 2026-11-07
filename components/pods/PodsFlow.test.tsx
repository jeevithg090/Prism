// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PodsFlow } from "./PodsFlow";
import { demoPod, profileGet, renderWithClient } from "./testUtils";

const { apiGet, apiPost, push, start, setOpen } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), push: vi.fn(), start: vi.fn(), setOpen: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({ apiGet, apiPost, apiPatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/shell/ActivityPanel", () => ({ useActivity: () => ({ start, events: [], open: false, setOpen, runId: null }) }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PodsFlow", () => {
  it("goes hero → matching → pod card, and starts the match run with the Activity panel shut", async () => {
    apiGet.mockImplementation(async (url: string) => (url.startsWith("/api/pods") ? [] : profileGet(url)));
    apiPost.mockResolvedValue({ ...demoPod(true), runId: "run_123" });
    const user = userEvent.setup();
    renderWithClient(<PodsFlow />);

    expect(await screen.findByRole("heading", { name: "Learn faster in a pod" })).toBeInTheDocument();
    expect(screen.getByText(/Never on personal characteristics/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Find my pod" }));

    expect(await screen.findByText(/Comparing 12 students/)).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledWith("/api/pods/match", { userId: "aisha" });
    expect(await screen.findByTestId("pod-card", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(start).toHaveBeenCalledWith("run_123", { open: false });
    // A fresh match always offers to start the project.
    expect(screen.getByRole("button", { name: /Start our project/ })).toBeEnabled();
  });

  it("starts at the hero on ?demo=1 even if the user already has a pod", async () => {
    apiGet.mockImplementation(async (url: string) => (url.startsWith("/api/pods") ? [demoPod(true)] : profileGet(url)));
    renderWithClient(<PodsFlow startFresh />);
    expect(await screen.findByRole("button", { name: "Find my pod" })).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith("/api/pods?userId=aisha");
  });

  it("shows the existing pod, and an error state with demo data when the list fails", async () => {
    apiGet.mockImplementation(async (url: string) => (url.startsWith("/api/pods") ? [demoPod(true)] : profileGet(url)));
    renderWithClient(<PodsFlow />);
    expect(await screen.findByRole("link", { name: /Open our project/ })).toHaveAttribute("href", "/pods/pod_demo01");
    cleanup();

    apiGet.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    renderWithClient(<PodsFlow />);
    await user.click(await screen.findByRole("button", { name: "Use demo data" }));
    expect(push).toHaveBeenCalledWith("/pods/pod_demo01");
  });
});
