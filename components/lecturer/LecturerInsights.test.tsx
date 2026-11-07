// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEMO_COHORT, DEMO_INSIGHTS, DEMO_POD_INSIGHTS } from "./demoData";
import { GapsChart, gapsSummary } from "./GapsChart";
import { LabIdeas, moduleCodeOf } from "./LabIdeas";
import { LecturerStats } from "./LecturerStats";
import { LecturerInsightsView } from "./LecturerInsightsView";

const { apiGet, toastSuccess, toastError } = vi.hoisted(() => ({ apiGet: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({ apiGet, apiPost: vi.fn(), apiPatch: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: toastSuccess, error: toastError }) }));

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}><LecturerInsightsView programmeId="uom-bsc-cs" /></QueryClientProvider>);
}
const routes = (overrides: Record<string, unknown> = {}) => async (url: string) => {
  const table: Record<string, unknown> = { "/api/lecturer/cohort": DEMO_COHORT, "/api/lecturer/insights": DEMO_INSIGHTS, "/api/pods/insights": DEMO_POD_INSIGHTS, ...overrides };
  const hit = Object.keys(table).find((k) => url.startsWith(`${k}?programmeId=uom-bsc-cs`));
  if (!hit) throw new Error(`No mock for ${url}`);
  const v = table[hit];
  if (v instanceof Error) throw v;
  return v;
};

describe("LecturerStats", () => {
  it("renders the 3 stat cards: cohort size, % targeting ML engineer, top uncovered gap", () => {
    render(<LecturerStats cohort={DEMO_COHORT} insights={DEMO_INSIGHTS} />);
    const stats = screen.getByTestId("lecturer-stats");
    expect(within(stats).getByText("Students in this cohort")).toBeInTheDocument();
    expect(within(stats).getByText("13")).toBeInTheDocument();
    expect(within(stats).getByText("Targeting ML engineer roles")).toBeInTheDocument();
    expect(within(stats).getByText("46%")).toBeInTheDocument();
    expect(within(stats).getByText("6 of 13 students' first-choice role")).toBeInTheDocument();
    expect(within(stats).getByText("Top gap no module covers")).toBeInTheDocument();
    expect(within(stats).getByText("Docker")).toBeInTheDocument();
    expect(within(stats).getByText("41% of ML engineer ads · 8 students need it")).toBeInTheDocument();
  });
});

describe("GapsChart", () => {
  it("renders the screen-reader and on-screen text summary", () => {
    render(<GapsChart gaps={DEMO_INSIGHTS.gaps} roleName="ML engineer" />);
    const summary = screen.getByTestId("gaps-summary");
    expect(summary).toHaveTextContent(
      "Docker is the biggest gap: 41% of ML engineer job ads ask for it, 8 students in this cohort need it, and no module covers it.",
    );
    expect(summary).toHaveTextContent("Also missing from the syllabus: PyTorch (38%), SQL (35%), AWS (33%), MLOps (28%) and LLM apps (26%).");
    expect(screen.getByRole("figure")).toHaveAccessibleDescription(summary.textContent!);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7); // header + 6 gaps
    expect(within(table).getByRole("rowheader", { name: "Docker" })).toBeInTheDocument();
  });

  it("has a kind summary when nothing is missing", () => {
    expect(gapsSummary([], "ML engineer")).toMatch(/covered by at least one module/);
  });
});

describe("LabIdeas", () => {
  it("Copy to module plan writes the idea to the clipboard and confirms with a toast", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<LabIdeas ideas={DEMO_INSIGHTS.labIdeas} />);
    const buttons = screen.getAllByRole("button", { name: "Copy to module plan" });
    expect(buttons).toHaveLength(3);
    await user.click(buttons[0]);
    expect(writeText).toHaveBeenCalledWith(DEMO_INSIGHTS.labIdeas[0]);
    expect(toastSuccess).toHaveBeenCalledWith("Lab idea copied", expect.objectContaining({ description: "Paste it into your module plan." }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByText("COMP2xxx3")).toBeInTheDocument();
  });

  it("shows an error toast when the clipboard is blocked", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<LabIdeas ideas={[DEMO_INSIGHTS.labIdeas[1]]} />);
    await user.click(screen.getByRole("button", { name: "Copy to module plan" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });

  it("finds module codes in idea text", () => {
    expect(moduleCodeOf("Add X to the COMP23311 Software Engineering coursework")).toBe("COMP23311");
    expect(moduleCodeOf("No module named here")).toBeUndefined();
  });
});

describe("LecturerInsightsView", () => {
  it("loads all three APIs and shows stats, chart summary, labs and peer teaching", async () => {
    apiGet.mockImplementation(routes());
    renderView();
    expect(screen.getByLabelText("Loading cohort numbers")).toBeInTheDocument();
    expect(await screen.findByText("Docker", { selector: "p" })).toBeInTheDocument();
    expect(await screen.findByTestId("gaps-summary")).toHaveTextContent("Docker is the biggest gap");
    expect(screen.getAllByRole("button", { name: "Copy to module plan" })).toHaveLength(3);
    expect(await screen.findByRole("heading", { name: "Gaps nobody in the cohort can teach yet" })).toBeInTheDocument();
    const chips = screen.getAllByTestId("peer-chip");
    expect(chips).toHaveLength(8);
    expect(chips[0]).toHaveTextContent("AWS1 can teach·5 want to learn");
    expect(screen.getByText(/Demand from Adzuna job ads; coverage from your published syllabus/)).toBeInTheDocument();
  });

  it("offers Retry and demo data when an API fails", async () => {
    const user = userEvent.setup();
    apiGet.mockImplementation(routes({ "/api/lecturer/insights": new Error("down") }));
    renderView();
    expect(await screen.findByText("We couldn't compare your syllabus with job ads")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Use demo data" })[0]);
    expect(await screen.findByTestId("gaps-summary")).toHaveTextContent("Docker is the biggest gap");
    expect(screen.queryByText("We couldn't compare your syllabus with job ads")).not.toBeInTheDocument();
  });

  it("hides everything for a cohort under 10 students", async () => {
    apiGet.mockImplementation(routes({ "/api/lecturer/cohort": { ...DEMO_COHORT, cohortSize: 7, suppressed: true, roles: [], demandRole: null } }));
    renderView();
    expect(await screen.findByText("Not enough students to show insights yet")).toBeInTheDocument();
    expect(screen.queryByTestId("gaps-summary")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy to module plan" })).not.toBeInTheDocument();
  });

  it("shows a kind empty state when the syllabus covers everything", async () => {
    apiGet.mockImplementation(routes({ "/api/lecturer/insights": { gaps: [], labIdeas: [] } }));
    renderView();
    expect(await screen.findByText("Your syllabus covers every in-demand skill we track")).toBeInTheDocument();
    expect(screen.getByText("No lab ideas needed right now")).toBeInTheDocument();
  });
});
