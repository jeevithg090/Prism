// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GuideSuggestion } from "@/lib/types";

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));

import { GuidesSection } from "./GuidesSection";

const GUIDES: GuideSuggestion[] = [
  { name: "mcr-dev", whyRelevant: "Writes TypeScript in Manchester.", publicUrl: "https://github.com/mcr-dev", source: "github", suggestedQuestion: "How did you learn Docker?", draftMessage: "Hi mcr-dev, I'm Aisha, a first-year student learning Docker." },
  { name: "Docker Manchester", whyRelevant: "Runs monthly Docker talks.", publicUrl: "https://www.meetup.com/docker-manchester/", source: "web", suggestedQuestion: "Any talks for beginners?", draftMessage: "Hi there, I'm Aisha." },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchSpy: ReturnType<typeof vi.spyOn>;
function setup() {
  const user = userEvent.setup();
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><GuidesSection viewerId="aisha" /></QueryClientProvider>);
  return { user };
}
beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterEach(() => {
  cleanup();
  fetchSpy.mockRestore();
});

describe("GuidesSection", () => {
  it("always says you send messages yourself, and finds guides on request", async () => {
    fetchSpy.mockResolvedValue(json({ ok: true, data: GUIDES }));
    const { user } = setup();
    expect(screen.getByText("You send it yourself. We never message anyone.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled(); // never spends a daily draft on page load

    await user.click(screen.getByRole("button", { name: "Find guides" }));
    const list = await screen.findByRole("list", { name: "Suggested guides" });
    expect(fetchSpy).toHaveBeenCalledWith("/api/guides/find", expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "aisha" }) }));

    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Writes TypeScript in Manchester.")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("link", { name: /View public GitHub profile/ })).toHaveAttribute("href", "https://github.com/mcr-dev");
    expect(within(cards[0]).getByText(/How did you learn Docker\?/)).toBeInTheDocument();
    const draft = within(cards[0]).getByLabelText("Draft message");
    expect(draft).toHaveAttribute("readonly");
    expect(draft).toHaveValue(GUIDES[0].draftMessage);
  });

  it("[Copy message] copies the draft and reminds you to send it yourself", async () => {
    fetchSpy.mockResolvedValue(json({ ok: true, data: GUIDES }));
    const { user } = setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Find guides" }));
    await user.click(await screen.findByRole("button", { name: "Copy message for mcr-dev" }));
    expect(writeText).toHaveBeenCalledWith(GUIDES[0].draftMessage);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied: send it yourself"));
  });

  it("shows a friendly message on the 429 daily limit", async () => {
    fetchSpy.mockResolvedValue(json({ ok: false, error: { code: "daily_limit", message: "limit" } }, 429));
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Find guides" }));
    expect(await screen.findByText(/You've used today's 3 drafts/)).toBeInTheDocument();
    expect(screen.queryByText("We couldn't find guides right now")).not.toBeInTheDocument();
  });

  it("shows an error state with Retry and demo data", async () => {
    fetchSpy.mockResolvedValueOnce(json({ ok: false, error: { code: "internal", message: "boom" } }, 500));
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Find guides" }));
    expect(await screen.findByText("We couldn't find guides right now")).toBeInTheDocument();

    fetchSpy.mockResolvedValueOnce(json({ ok: true, data: GUIDES }));
    await user.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(await screen.findByRole("list", { name: "Suggested guides" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenLastCalledWith("/api/guides/find?demo=1", expect.anything());
  });

  it("shows an empty state when no guides are found", async () => {
    fetchSpy.mockResolvedValue(json({ ok: true, data: [] }));
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Find guides" }));
    expect(await screen.findByText("No guides found this time")).toBeInTheDocument();
  });
});
