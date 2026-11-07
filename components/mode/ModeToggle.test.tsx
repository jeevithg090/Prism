// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh, toastError } = vi.hoisted(() => ({ refresh: vi.fn(), toastError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh, prefetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { ModeToggle, recordingsSummary } from "./ModeToggle";

const envelope = (data: unknown, status = 200) => new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { code: "x", message: "x" } }), { status, headers: { "content-type": "application/json" } });
const state = (mode: "demo" | "live") => ({ mode, total: 3, recordings: { llm: 2, tts: 1 }, recordedAt: { first: "2026-11-07T14:00:00Z", last: "2026-11-07T15:20:00Z" }, demoModeEnv: false });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? envelope(state(JSON.parse(String(init.body)).mode)) : envelope(state("demo"))));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModeToggle", () => {
  it("shows a two-option switch with the server's mode pressed", async () => {
    render(<ModeToggle />);
    const group = screen.getByRole("group", { name: "AI mode" });
    expect(group).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Demo" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Live AI" })).toHaveAttribute("aria-pressed", "false");
    expect(fetchMock).toHaveBeenCalledWith("/api/mode", expect.objectContaining({ cache: "no-store" }));
  });

  it("POSTs the new mode, then refreshes the page", async () => {
    const user = userEvent.setup();
    render(<ModeToggle />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Demo" })).toHaveAttribute("aria-pressed", "true"));
    await user.click(screen.getByRole("button", { name: "Live AI" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/mode");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ mode: "live" });
    expect(screen.getByRole("button", { name: "Live AI" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is keyboard operable and rolls back with a toast when the switch fails", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? envelope(null, 500) : envelope(state("live"))));
    const user = userEvent.setup();
    render(<ModeToggle />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Live AI" })).toHaveAttribute("aria-pressed", "true"));
    screen.getByRole("button", { name: "Demo" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Live AI" })).toHaveAttribute("aria-pressed", "true");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says where the last answer on the page came from (x-keystone-replay)", async () => {
    delete (window as Window & { __ksReplayWatch?: boolean }).__ksReplayWatch;
    const replay = { mode: "demo", source: "replayed", replayed: 2, recorded: 0, live: 0, missed: 0, recordedAt: "2026-11-07T15:20:00Z", model: "gpt-4.1-mini", kinds: ["llm"] };
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/coach"
        ? new Response(JSON.stringify({ ok: true, data: {}, replay }), { headers: { "content-type": "application/json", "x-keystone-replay": "replayed" } })
        : envelope(state("demo")));
    const user = userEvent.setup();
    render(<ModeToggle />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Demo" })).toHaveAttribute("aria-pressed", "true"));
    await window.fetch("/api/coach");
    await user.click(screen.getByRole("button", { name: /About Demo and Live AI/ }));
    expect(await screen.findByText(/^Replayed from a real run · gpt-4\.1-mini · 7 Nov/)).toBeInTheDocument();
  });

  it("explains what each mode does and what has been recorded", async () => {
    const user = userEvent.setup();
    render(<ModeToggle />);
    await user.click(screen.getByRole("button", { name: /About Demo and Live AI/ }));
    expect(await screen.findByText(/Demo replays real results recorded from live runs \(OpenAI, Firecrawl, ElevenLabs\)\. Live AI calls them now\./)).toBeInTheDocument();
    expect(recordingsSummary(state("demo"))).toMatch(/^3 recordings from real runs: 2 AI answers, 1 voice clip\./);
    expect(recordingsSummary({ mode: "demo", total: 0 })).toMatch(/Nothing is recorded yet/);
  });
});
