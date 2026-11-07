// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HalfLifeReport } from "@/lib/labs/halflife/schema";

const { apiGet, apiPost, toastSuccess, toastError } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({ apiGet, apiPost, apiPatch: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: toastSuccess, error: toastError }) }));
vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn(async () => { throw new Error("no_key"); }), LLMError: class extends Error {} }));

import { buildHalfLifeReport } from "@/lib/labs/halflife/agent";
import { HalfLifeView } from "./HalfLifeView";
import { radarSummary } from "./UrgencyRadar";
import { curveRows } from "./DecayCurve";

let REPORT: HalfLifeReport;
beforeAll(async () => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  process.env.DEMO_MODE = "true";
  REPORT = (await buildHalfLifeReport({ programmeId: "uom-bsc-cs", horizonYears: 3 })).report;
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const renderView = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}><HalfLifeView programmeId="uom-bsc-cs" /></QueryClientProvider>);
};

describe("HalfLifeView", () => {
  it("shows a loading skeleton, then the stats, the ranking and the top module's note", async () => {
    let resolve: (r: HalfLifeReport) => void = () => {};
    apiGet.mockReturnValue(new Promise<HalfLifeReport>((r) => { resolve = r; }));
    renderView();
    expect(screen.getByRole("status", { name: /reading the syllabus/i })).toBeInTheDocument();
    resolve(REPORT);
    expect(await screen.findByText("Fastest half-life")).toBeInTheDocument();
    expect(screen.getByText("3.0 years")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: /ranked by refresh urgency/i });
    expect(within(list).getAllByRole("button")).toHaveLength(16);
    expect(within(list).getAllByRole("button")[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: /COMP1xxx2 Object-Oriented Programming with Java/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/draft for the module review/i)).toHaveValue(REPORT.modules[0].refreshNote!.text);
    expect(screen.getByText(/You decide/)).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/labs\/halflife\?programmeId=uom-bsc-cs&horizonYears=3$/));
  });

  it("opens another module and sends the module lead's edited note when they adopt it", async () => {
    apiGet.mockResolvedValue(REPORT);
    apiPost.mockResolvedValue({ ...REPORT.modules[1], decision: "adopted", decidedAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderView();
    const list = await screen.findByRole("list", { name: /ranked by refresh urgency/i });
    await user.click(within(list).getByRole("button", { name: /Natural Language Processing/ }));
    expect(screen.getByRole("heading", { name: /COMP3xxx3/ })).toBeInTheDocument();
    expect(screen.getAllByText(/LLM apps/).length).toBeGreaterThan(0);
    const box = screen.getByLabelText(/draft for the module review/i);
    await user.clear(box);
    await user.type(box, "Pilot an LLM apps lab in week 9.");
    await user.click(screen.getByRole("button", { name: /adopt note/i }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/labs/halflife/decide", { programmeId: "uom-bsc-cs", moduleCode: "COMP3xxx3", decision: "adopted", note: "Pilot an LLM apps lab in week 9." }));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("changes the horizon and asks for the new forecast", async () => {
    apiGet.mockResolvedValue(REPORT);
    const user = userEvent.setup();
    renderView();
    await screen.findByText("Fastest half-life");
    await user.click(screen.getByRole("button", { name: "5 years" }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(expect.stringContaining("horizonYears=5")));
  });

  it("shows an error with Retry and a demo fallback", async () => {
    apiGet.mockRejectedValueOnce(new Error("down")).mockResolvedValue(REPORT);
    const user = userEvent.setup();
    renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't build the radar/i);
    await user.click(screen.getByRole("button", { name: /use demo data/i }));
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(expect.stringContaining("demo=1")));
    expect(await screen.findByText("Fastest half-life")).toBeInTheDocument();
  });

  it("shows an empty state for a programme with no modules", async () => {
    apiGet.mockResolvedValue({ ...REPORT, modules: [] });
    renderView();
    expect(await screen.findByText(/has no modules yet/i)).toBeInTheDocument();
  });
});

describe("chart helpers", () => {
  it("summarise the radar in words and merge the curve into one row per month", () => {
    expect(radarSummary(REPORT.modules)).toMatch(/^COMP1xxx2 Object-Oriented Programming with Java spikes furthest \(urgency \d+ of 100\)/);
    const rows = curveRows(REPORT.modules[0].curve);
    const today = rows.find((r) => r.month === REPORT.lastDataMonth)!;
    expect(today.forecast).toBe(100);
    expect(today.history).toBeDefined();
    expect(rows.map((r) => r.t)).toEqual([...rows.map((r) => r.t)].sort((a, b) => a - b));
  });
});
