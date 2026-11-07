// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MomentumEvent } from "@/lib/schemas/community";

const mocks = vi.hoisted(() => ({
  turnIntoCvBullets: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("./actions", () => ({ turnIntoCvBullets: mocks.turnIntoCvBullets }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { BuildLog } from "./BuildLog";

afterEach(() => { cleanup(); vi.restoreAllMocks(); mocks.turnIntoCvBullets.mockReset(); });

const EVENTS: MomentumEvent[] = [
  { id: "e3", userId: "aisha", kind: "pr-merged", ts: new Date(Date.now() - 2 * 86_400_000).toISOString(), label: "Merged PR #15 in pod-vision-demo: Load the model", url: "https://github.com/keystone-demo/pod-vision-demo/pull/15" },
  { id: "e2", userId: "aisha", kind: "roadmap-milestone", ts: new Date(Date.now() - 5 * 86_400_000).toISOString(), label: "Completed Week 2: Docker" },
  { id: "e1", userId: "aisha", kind: "helped-newcomer", ts: new Date(Date.now() - 9 * 86_400_000).toISOString(), label: "Helped a newcomer with Git" },
];
function mockFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({ json: async () => body } as Response);
}

describe("BuildLog", () => {
  it("renders one row per event, with relative dates and links", async () => {
    const fetchSpy = mockFetch({ ok: true, data: EVENTS });
    render(<BuildLog userId="aisha" />);
    const list = await screen.findByRole("list", { name: "Verified steps" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(EVENTS.length);
    expect(screen.getByText("Completed Week 2: Docker")).toBeInTheDocument();
    expect(screen.getByText("2 days ago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on GitHub: Merged PR #15/ })).toHaveAttribute("href", EVENTS[0].url);
    expect(fetchSpy).toHaveBeenCalledWith("/api/momentum/aisha?view=events");
  });

  it("turns events into CV bullets in a dialog and copies them", async () => {
    mockFetch({ ok: true, data: EVENTS });
    mocks.turnIntoCvBullets.mockResolvedValue({ bullets: ["Bullet one.", "Bullet two.", "Bullet three."], source: "ai" });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<BuildLog userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: /Turn into CV bullets/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Bullet two.")).toBeInTheDocument();
    expect(mocks.turnIntoCvBullets).toHaveBeenCalledWith("aisha");
    await user.click(within(dialog).getByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith("• Bullet one.\n• Bullet two.\n• Bullet three.");
    expect(mocks.toast.success).toHaveBeenCalledWith("Copied");
  });

  it("falls back to template bullets when the server action fails", async () => {
    mockFetch({ ok: true, data: EVENTS });
    mocks.turnIntoCvBullets.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<BuildLog userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: /Turn into CV bullets/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/merging 1 pull request/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Written from a template/)).toBeInTheDocument();
  });

  it("shows the empty state with no events", async () => {
    mockFetch({ ok: true, data: [] });
    render(<BuildLog userId="newbie" />);
    expect(await screen.findByText("Your Build Log is ready for its first entry")).toBeInTheDocument();
  });
});
