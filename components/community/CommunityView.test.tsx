// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HelpRequest, Profile } from "@/lib/types";

const { apiGet, apiPost, toast } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/lib/fetcher", () => ({ apiGet, apiPost, apiPatch: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { CommunityView } from "./CommunityView";

const profile = (id: string, name: string, badges: Profile["badges"]): Profile => ({
  id, name, programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges, interests: [], availability: [],
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 5, theoryPractice: 50, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
});
const PROFILES: Record<string, Profile> = {
  aisha: profile("aisha", "Aisha Rahman", ["new-to-uni", "international"]),
  tom: profile("tom", "Tom Baker", []),
  leo: profile("leo", "Leo Park", ["new-to-uni"]),
  priya: profile("priya", "Priya Shah", ["helper"]),
};
const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();
const HELP: HelpRequest[] = [
  { id: "help_tom", fromUserId: "tom", kind: "code-review", message: "Can someone review my SQL schema?", status: "open", createdAt: iso(1) },
  { id: "help_leo", fromUserId: "leo", kind: "question", message: "What is a Python virtual environment?", status: "open", createdAt: iso(5) },
  { id: "help_aisha", fromUserId: "aisha", kind: "chat-15", message: "15 minutes on Git branches?", status: "open", createdAt: iso(3) },
  { id: "help_done", fromUserId: "leo", toUserId: "priya", kind: "question", message: "Done one", status: "done", createdAt: iso(20) },
];

function setup(opts: { help?: HelpRequest[] | Error; profiles?: Record<string, Profile> } = {}) {
  const profiles = opts.profiles ?? PROFILES;
  apiGet.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/help")) {
      if (opts.help instanceof Error) throw opts.help;
      return opts.help ?? HELP;
    }
    const m = url.match(/^\/api\/profile\/(.+)$/);
    if (m && profiles[decodeURIComponent(m[1])]) return profiles[decodeURIComponent(m[1])];
    throw new Error("not found");
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  render(<QueryClientProvider client={qc}><CommunityView /></QueryClientProvider>);
  return { user };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "ks_uid=aisha";
});
afterEach(cleanup);

describe("CommunityView", () => {
  it("lists only open requests, with 🌱 newcomers first", async () => {
    setup();
    const list = await screen.findByRole("list", { name: "Open help requests" });
    await waitFor(() => {
      const names = within(list).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      // Leo (🌱, 5h ago) and Aisha (🌱, 3h ago) before Tom (newest, but not a newcomer)
      expect(names).toEqual(["Aisha Rahman (you)", "Leo Park", "Tom Baker"]);
    });
    expect(screen.queryByText("Done one")).not.toBeInTheDocument();
    expect(within(list).getAllByText("Code review")).toHaveLength(1);
    expect(within(list).getByText("15-min chat")).toBeInTheDocument();
  });

  it("[I can help] sends status accepted for the viewer and thanks them", async () => {
    apiPost.mockResolvedValue({ ...HELP[1], status: "accepted", toUserId: "aisha" });
    const { user } = setup();
    const button = await screen.findByRole("button", { name: "I can help Leo Park" });
    await user.click(button);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/help", { id: "help_leo", status: "accepted", toUserId: "aisha" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Thank you! +3 momentum"));
  });

  it("hides [I can help] on the viewer's own request", async () => {
    setup();
    await screen.findByRole("button", { name: "I can help Leo Park" });
    expect(screen.queryByRole("button", { name: /I can help Aisha/ })).not.toBeInTheDocument();
    expect(screen.getByText(/This is your request/)).toBeInTheDocument();
  });

  it("blocks an empty composer and posts a real request", async () => {
    const { user } = setup();
    const submit = screen.getByRole("button", { name: "Ask for help" });
    expect(submit).toBeDisabled();

    const box = screen.getByLabelText("What do you need help with?");
    await user.type(box, "   ");
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(apiPost).not.toHaveBeenCalled();

    apiPost.mockResolvedValue({ id: "help_new", fromUserId: "aisha", kind: "code-review", message: "Review my PR?", status: "open", createdAt: new Date().toISOString() });
    await user.clear(box);
    await user.type(box, "Review my PR?");
    await user.selectOptions(screen.getByLabelText("Kind of help"), "code-review");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/help", { fromUserId: "aisha", kind: "code-review", message: "Review my PR?" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(box).toHaveValue("");
  });

  it("shows the 🌱 note only to newcomers", async () => {
    setup();
    expect(await screen.findByText("Your 🌱 badge tells helpers to explain things in more detail.")).toBeInTheDocument();
    cleanup();
    setup({ profiles: { ...PROFILES, aisha: profile("aisha", "Aisha Rahman", []) } });
    await screen.findByRole("list", { name: "Open help requests" });
    expect(screen.queryByText(/Your 🌱 badge/)).not.toBeInTheDocument();
  });

  it("shows helpers this week only after opting in", async () => {
    const { user } = setup();
    await screen.findByRole("list", { name: "Open help requests" });
    expect(screen.getByText("Celebrating helpers, not ranking students.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Helpers this week" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show helpers" }));
    const helpers = await screen.findByRole("list", { name: "Helpers this week" });
    await waitFor(() => expect(within(helpers).getByText("Priya Shah")).toBeInTheDocument());
    expect(within(helpers).getByText("1 help")).toBeInTheDocument();
  });

  it("shows an empty state when there are no open requests", async () => {
    setup({ help: [] });
    expect(await screen.findByText("No open requests right now")).toBeInTheDocument();
  });

  it("shows an error state with Retry and demo data", async () => {
    const { user } = setup({ help: new Error("boom") });
    expect(await screen.findByText("We couldn't load the help feed")).toBeInTheDocument();
    apiGet.mockClear();
    await user.click(screen.getByRole("button", { name: "Use demo data" }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/help?demo=1"));
  });
});
