// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { ProjectView } from "./ProjectView";
import { demoPod, profileGet, renderWithClient } from "./testUtils";

const { apiGet, push } = vi.hoisted(() => ({ apiGet: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({ apiGet, apiPost: vi.fn(), apiPatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ProjectView", () => {
  it("shows the project title, pitch, repo + Discord links, milestones and how pods work", async () => {
    const pod = { ...demoPod(true), discordChannelUrl: "https://discord.com/channels/1/2" };
    apiGet.mockImplementation(async (url: string) => (url === "/api/pods/pod_demo01" ? pod : profileGet(url)));
    renderWithClient(<ProjectView podId="pod_demo01" />);

    expect(await screen.findByRole("heading", { level: 1, name: "VisionAid: accessible image captioning API" })).toBeInTheDocument();
    expect(screen.getByText("An API that writes alt text for images.")).toBeInTheDocument();
    const repoLinks = screen.getAllByRole("link", { name: /Open repo/ });
    expect(repoLinks.length).toBeGreaterThan(0);
    for (const a of repoLinks) {
      expect(a).toHaveAttribute("href", "https://github.com/keystone-demo/pod-vision-demo");
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noreferrer");
    }
    expect(screen.getAllByRole("link", { name: /Open Discord/ })[0]).toHaveAttribute("href", pod.discordChannelUrl);
    const steps = within(screen.getByRole("list", { name: "Milestones" })).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: "How pods work" })).toBeInTheDocument();
    expect(screen.getByText("Merged PRs become proof on your passport.")).toBeInTheDocument();
  });

  it("hides Discord when there's no channel, and offers Start our project when there's no project yet", async () => {
    apiGet.mockImplementation(async (url: string) => (url === "/api/pods/pod_demo01" ? demoPod(false) : profileGet(url)));
    renderWithClient(<ProjectView podId="pod_demo01" />);
    expect(await screen.findByText("Your pod doesn't have a project yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start our project/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open Discord/ })).not.toBeInTheDocument();
  });

  it("shows an error state whose demo action opens the demo pod", async () => {
    apiGet.mockRejectedValue(new Error("nope"));
    renderWithClient(<ProjectView podId="pod_x" />);
    (await screen.findByRole("button", { name: "Use demo data" })).click();
    expect(push).toHaveBeenCalledWith("/pods/pod_demo01");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
