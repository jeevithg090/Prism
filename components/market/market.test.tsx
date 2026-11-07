// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import type { RoleDemand, TrendSeries } from "@/lib/types";
import { SkillDemandChart } from "./SkillDemandChart";
import { buildRows, TrendChart, yMaxFor, yTicksFor } from "./TrendChart";
import { RisingCovered, risingCoveredSummary } from "./RisingCovered";
import { MarketView } from "./MarketView";
import { defaultPicks, demandSummary, growthText, pctPosts, risingForRole, subtitleFor, trendSummary, type StatusBySkill } from "./summaries";

afterEach(() => cleanup());
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const read = <T,>(rel: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
const ml = read<RoleDemand>("data/fixtures/market.ml-engineer.json");
const trends = read<TrendSeries[]>("data/fixtures/trends.json");
const map = read<{ nodes: { skillId: string; status: StatusBySkill[string] }[] }>("data/fixtures/bridgemap.aisha.ml-engineer.json");
const status: StatusBySkill = Object.fromEntries(map.nodes.map((n) => [n.skillId, n.status]));
const llmEval = trends.find((t) => t.skillId === "llm-evaluation")!;

describe("summaries", () => {
  it("demand summary puts the top skill and the biggest gap in a sentence with denominators", () => {
    expect(demandSummary(ml, status)).toBe(
      "Python is the most asked-for skill: 62% of 214 ML engineer ads, and you've proven it. Your biggest gap is Docker: 41% of ads, it's rising, and no module covers it.",
    );
  });

  it("demand summary doesn't repeat the top skill when it's also the biggest gap", () => {
    const da = read<RoleDemand>("data/fixtures/market.data-analyst.json");
    expect(demandSummary(da, { ...status, "data-visualisation": "gap" })).toBe(
      "SQL is the most asked-for skill: 78% of 188 data analyst ads. It's your biggest gap, and no module covers it. Next is Data visualisation: 61% of ads.",
    );
  });

  it("y-axis ticks are evenly spaced whole percents", () => {
    expect(yTicksFor(25)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(yTicksFor(8)).toEqual([0, 2, 4, 6, 8]);
    expect(yTicksFor(4)).toEqual([0, 1, 2, 3, 4]);
  });

  it("trend summary reads now, projection and band", () => {
    const now = llmEval.history.at(-1)!, end = llmEval.projection.at(-1)!;
    expect(trendSummary([llmEval])).toBe(
      `LLM evaluation is rising (${growthText(llmEval.growthPerYear)}): ${pctPosts(now.share)} of Hacker News job posts in Oct 2026, projected ${pctPosts(end.share)} (${pctPosts(end.low)} to ${pctPosts(end.high)}) by Oct 2027.`,
    );
    expect(growthText(0.67)).toBe("+67% a year");
    expect(growthText(-0.21)).toBe("−21% a year");
  });

  it("default picks: the fastest-rising skill plus your biggest gap", () => {
    expect(defaultPicks(ml, trends, status)).toEqual(["llm-evaluation", "docker"]);
  });

  it("rising skills come fastest first, with the roadmap week", () => {
    const items = risingForRole(ml, trends, status, { "llm-evaluation": 10, docker: 1 });
    expect(items[0]).toMatchObject({ skillId: "llm-evaluation", week: 10 });
    expect(items.map((i) => i.skillId)).toEqual(["llm-evaluation", "llm-apps", "vector-databases", "mlops", "pytorch", "docker"]);
    expect(risingCoveredSummary(items, "ML engineer")).toBe(`LLM evaluation is rising fast (${growthText(llmEval.growthPerYear)}). Your roadmap already includes it in week 10.`);
  });

  it("subtitle follows the role", () => {
    expect(subtitleFor("ML engineer")).toBe("What ML engineer roles ask for right now, and where it's heading");
    expect(subtitleFor("Data analyst")).toBe("What data analyst roles ask for right now, and where it's heading");
  });

  it("the y-axis fits the data (not 0–100%)", () => {
    const docker = trends.find((t) => t.skillId === "docker")!;
    expect(yMaxFor([llmEval])).toBe(Math.ceil(Math.max(...llmEval.projection.map((p) => p.high)) * 100));
    expect(yMaxFor([llmEval, docker])).toBe(20);
    expect(yMaxFor([])).toBe(1);
  });

  it("chart rows join history and projection at the last real month", () => {
    const rows = buildRows([llmEval]);
    expect(rows).toHaveLength(48);
    const last = rows.find((r) => r.month === "2026-10")!;
    expect(last.h_0).toBeCloseTo(llmEval.history.at(-1)!.share * 100);
    expect(last.p_0).toBe(last.h_0);
    expect(rows.at(-1)!.b_0).toEqual([llmEval.projection.at(-1)!.low * 100, llmEval.projection.at(-1)!.high * 100]);
  });
});

describe("SkillDemandChart", () => {
  it("renders shares, the trend badge text and your status with icon + label, and its summary", () => {
    render(<SkillDemandChart demand={ml} statusBySkill={status} picked={[]} onPick={() => {}} />);
    const docker = screen.getByRole("button", { name: /^Docker,\s*41%\s*of ML engineer ads,\s*Gap,\s*Rising$/ });
    expect(within(docker).getByText("41%")).toBeInTheDocument();
    expect(within(docker).getByText("Gap")).toBeInTheDocument();
    expect(within(docker).getByText("Rising")).toBeInTheDocument();
    expect(docker.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByRole("button", { name: /^Python,\s*62%/ })).getByText("Proven")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^Machine learning,\s*55%/ })).getByText("Later in your degree")).toBeInTheDocument();
    expect(screen.getByTestId("demand-summary")).toHaveTextContent("Your biggest gap is Docker: 41% of ads");
  });

  it("is keyboard reachable: Tab then Enter picks the skill", async () => {
    const onPick = vi.fn();
    render(<SkillDemandChart demand={ml} statusBySkill={status} picked={[]} onPick={onPick} />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /^Python/ })).toHaveFocus();
    await userEvent.tab(); await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("docker");
  });

  it("shows the top 10 and expands to all", async () => {
    render(<SkillDemandChart demand={ml} statusBySkill={status} picked={[]} onPick={() => {}} />);
    expect(within(screen.getByTestId("demand-rows")).getAllByRole("button")).toHaveLength(10);
    await userEvent.click(screen.getByRole("button", { name: `Show all ${ml.skills.length} skills` }));
    expect(within(screen.getByTestId("demand-rows")).getAllByRole("button")).toHaveLength(ml.skills.length);
  });
});

describe("TrendChart", () => {
  it("renders the summary, the honesty label and Rising badges for the picked skills", async () => {
    const onToggle = vi.fn();
    render(<TrendChart trends={trends} options={["llm-evaluation", "docker", "tensorflow"]} picked={["llm-evaluation", "tensorflow"]} onToggle={onToggle} />);
    expect(screen.getByTestId("trend-summary")).toHaveTextContent(/^LLM evaluation is rising \(\+\d+% a year\).*TensorFlow is cooling \(−\d+% a year\)/);
    expect(screen.getByText("A projection from past job postings, not a guarantee.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Trend for each skill on the chart" })).toHaveTextContent(/LLM evaluationRising.*TensorFlowCooling/);
    expect(screen.getByRole("button", { name: "LLM evaluation" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Docker" }));
    expect(onToggle).toHaveBeenCalledWith("docker");
    await userEvent.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.getByRole("table")).toHaveTextContent("LLM evaluation");
  });

  it("asks you to pick a skill when none is picked", () => {
    render(<TrendChart trends={trends} options={["docker"]} picked={[]} onToggle={() => {}} />);
    expect(screen.getByTestId("trend-summary")).toHaveTextContent("Pick a skill to see where hiring for it is heading.");
  });
});

describe("RisingCovered", () => {
  it("links each covered rising skill to its roadmap week", () => {
    const items = risingForRole(ml, trends, status, { "llm-evaluation": 10 });
    render(<RisingCovered items={items} roleLabel="ML engineer" hasRoadmap />);
    expect(screen.getByTestId("rising-summary")).toHaveTextContent("Your roadmap already includes it in week 10.");
    expect(screen.getByRole("link", { name: /See week 10 for LLM evaluation/ })).toHaveAttribute("href", "/roadmap");
  });

  it("without a roadmap, shows rising gaps to plan", () => {
    render(<RisingCovered items={risingForRole(ml, trends, status, null)} roleLabel="ML engineer" hasRoadmap={false} />);
    expect(screen.getAllByRole("link", { name: /Open your roadmap/ })).toHaveLength(3);
  });
});

describe("MarketView states", () => {
  const renderView = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><MarketView initialRole="ml-engineer" primaryRole="ml-engineer" statusBySkill={status} fallbackStatus="gap" roadmapWeeks={{ "llm-evaluation": 10 }} /></QueryClientProvider>);
  };

  it("loading → success with stats, both charts and the source line", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => Response.json({ ok: true, data: String(u).includes("/api/trends") ? trends : ml }));
    renderView();
    expect(screen.getByText("Loading job ads and trends…")).toBeInTheDocument();
    expect(await screen.findByText("214")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Industry Radar" })).toBeInTheDocument();
    expect(screen.getByText("What ML engineer roles ask for right now, and where it's heading")).toBeInTheDocument();
    expect(screen.getByText("£52k")).toBeInTheDocument();
    expect(screen.getAllByText("Arm").length).toBeGreaterThanOrEqual(2); // top-hirer card + hiring list
    expect(await screen.findByText("Rising skills your roadmap already covers")).toBeInTheDocument();
    expect(screen.getByTestId("trend-summary")).toHaveTextContent(/^LLM evaluation is rising/);
    expect(screen.getAllByText("Demo data").length).toBeGreaterThan(0);
    fetchSpy.mockRestore();
  });

  it("error → Retry refetches and Use demo data asks for ?demo=1", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: false, error: { code: "internal", message: "down" } }, { status: 500 }));
    renderView();
    expect(await screen.findByText("We couldn't load job data")).toBeInTheDocument();
    const before = fetchSpy.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(before);
    await userEvent.click(await screen.findByRole("button", { name: "Use demo data" }));
    expect(fetchSpy.mock.calls.some(([u]) => String(u) === "/api/market/ml-engineer?demo=1")).toBe(true);
    fetchSpy.mockRestore();
  });

  it("empty → explains and offers a refresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => Response.json({ ok: true, data: String(u).includes("/api/trends") ? trends : { ...ml, skills: [] } }));
    renderView();
    expect(await screen.findByText("No ads found for this role yet")).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("switching role changes the subtitle and the ads count", async () => {
    const da = read<RoleDemand>("data/fixtures/market.data-analyst.json");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => Response.json({ ok: true, data: String(u).includes("/api/trends") ? trends : String(u).includes("data-analyst") ? da : ml }));
    renderView();
    await screen.findByText("214");
    await userEvent.click(screen.getByRole("button", { name: /^Data analyst/ }));
    expect(await screen.findByText("188")).toBeInTheDocument();
    expect(screen.getByText("What data analyst roles ask for right now, and where it's heading")).toBeInTheDocument();
    fetchSpy.mockRestore();
  });
});
