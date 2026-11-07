// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { SAMPLE_RUNS } from "@/lib/agents/ledger-sample";

const { toast } = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("sonner", () => ({ toast }));

import { GovernanceView } from "./GovernanceView";
import { formatDuration } from "./RunLedger";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Routes = { registry?: () => Response; runs?: (url: string) => Response };

let fetchSpy: ReturnType<typeof vi.spyOn>;
function setup(routes: Routes) {
  fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/agents/registry")) return routes.registry?.() ?? json({ ok: true, data: AGENT_REGISTRY });
    if (url.startsWith("/api/agents/runs")) return routes.runs?.(url) ?? json({ ok: true, data: [] });
    throw new Error(`unexpected ${url}`);
  });
  const user = userEvent.setup();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><GovernanceView /></QueryClientProvider>);
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

describe("GovernanceView", () => {
  it("shows the EU AI Act panel and every agent from the registry with its checkpoint", async () => {
    setup({ runs: () => json({ ok: true, data: SAMPLE_RUNS }) });
    expect(screen.getByRole("heading", { name: "How Keystone's agents are governed" })).toBeInTheDocument();
    const act = screen.getByRole("region", { name: "EU AI Act: Keystone is decision support" });
    expect(within(act).getByText("We never grade you for credit.")).toBeInTheDocument();
    expect(within(act).getByText("People approve every consequential step.")).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Keystone agents" });
    expect(within(list).getAllByRole("article")).toHaveLength(14);
    const architect = within(list).getByRole("article", { name: "Project Architect" });
    expect(within(architect).getByText("Each issue is reviewed and merged by a podmate, never by the AI")).toBeInTheDocument();
    expect(within(architect).getByText("You decide")).toBeInTheDocument();
    expect(within(architect).getByText("noFullSolutions")).toBeInTheDocument();
  });

  it("renders the run ledger with status pills, guardrail actions and checkpoints", async () => {
    setup({ runs: () => json({ ok: true, data: SAMPLE_RUNS }) });
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(SAMPLE_RUNS.length + 1);
    const techlead = rows[1];
    expect(within(techlead).getByText("AI Tech Lead")).toBeInTheDocument();
    expect(within(techlead).getByText("OK")).toBeInTheDocument();
    expect(within(techlead).getByText("noFullSolutions")).toBeInTheDocument();
    expect(within(techlead).getByText("modified")).toBeInTheDocument();
    expect(within(techlead).getByText("2.1 s")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Fallback")).toBeInTheDocument();
    expect(within(rows[2]).getByText(/You send it/)).toBeInTheDocument();
    expect(screen.getByText("Agent runs logged").closest(".rounded-2xl")).toHaveTextContent(String(SAMPLE_RUNS.length));
  });

  it("empty ledger: explains and offers sample runs", async () => {
    const { user } = setup({ runs: (url) => json({ ok: true, data: url.includes("demo=1") ? SAMPLE_RUNS : [] }) });
    expect(await screen.findByText("No agent runs yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show sample runs" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Showing sample agent runs", expect.anything());
    expect(fetchSpy.mock.calls.some(([u]: unknown[]) => String(u).includes("/api/agents/runs?limit=50&demo=1"))).toBe(true);
  });

  it("error states: Retry and Use demo data for both the ledger and the registry", async () => {
    let failRuns = true;
    const { user } = setup({
      registry: () => json({ ok: false, error: { code: "internal", message: "Registry offline." } }, 500),
      runs: (url) => (failRuns && !url.includes("demo=1") ? json({ ok: false, error: { code: "internal", message: "Ledger offline." } }, 500) : json({ ok: true, data: SAMPLE_RUNS })),
    });
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(screen.getByText("We couldn't load the run ledger")).toBeInTheDocument();
    failRuns = false;
    await user.click(within(alerts[0]).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();

    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Use demo data" }));
    expect(await screen.findByRole("list", { name: "Keystone agents" })).toBeInTheDocument();
  });

  it("refresh is keyboard reachable and confirms with a toast", async () => {
    const { user } = setup({ runs: () => json({ ok: true, data: SAMPLE_RUNS }) });
    await screen.findByRole("table");
    const refresh = screen.getByRole("button", { name: "Refresh the run ledger" });
    refresh.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(`Ledger refreshed: ${SAMPLE_RUNS.length} runs`));
  });

  it("formats durations for people", () => {
    expect(formatDuration(38)).toBe("38 ms");
    expect(formatDuration(2140)).toBe("2.1 s");
    expect(formatDuration(42_000)).toBe("42 s");
  });
});
