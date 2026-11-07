// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BridgeMap, BridgeNode, Profile, Roadmap, RoleDemand } from "@/lib/types";

const { podThrows } = vi.hoisted(() => ({ podThrows: { value: false } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/pods/PodSummaryCard", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/pods/PodSummaryCard")>();
  return {
    PodSummaryCard: (props: { userId: string }) => {
      if (podThrows.value) throw new Error("pod card exploded");
      return React.createElement(real.PodSummaryCard, props);
    },
  };
});

import { DashboardView } from "./DashboardView";
import { currentWeek, fetchOptional, monthYear } from "./data";

const node = (skillId: string, name: string, status: BridgeNode["status"], demand: number, trend?: BridgeNode["trend"]): BridgeNode => ({
  skillId, name, status, demand, trend, category: "cloud-devops", level: status === "proven" ? 2 : 0, evidenceIds: [], moduleCodes: [],
});
const MAP: BridgeMap = {
  userId: "aisha", roleId: "ml-engineer", readinessNow: 0.38, readinessProjected: 0.84, generatedAt: "2026-11-07T10:00:00Z", edges: [],
  nodes: [
    node("python", "Python", "proven", 0.62), node("git", "Git", "proven", 0.3), node("statistics", "Statistics", "degree-upcoming", 0.3),
    node("docker", "Docker", "gap", 0.41, "rising"), node("pytorch", "PyTorch", "gap", 0.38, "rising"), node("sql", "SQL", "gap", 0.35, "stable"),
    node("aws", "AWS", "gap", 0.33),
  ],
};
const MARKET = { roleId: "ml-engineer", roleName: "ML engineer", location: "uk", adsAnalysed: 214, skills: [{ skillId: "python", share: 0.62 }, { skillId: "docker", share: 0.41 }], topCompanies: [], sampleAds: [], snapshotAt: "2026-11-06", source: "cache" } as RoleDemand;
const AISHA: Profile = {
  id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges: ["new-to-uni", "international"], interests: [], availability: [], isDemo: true,
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "Placement applications Sept 2027", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 70, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
};
const ROADMAP: Roadmap = {
  userId: "aisha", roleId: "ml-engineer", version: 2, readinessNow: 0.38, readinessProjected: 0.84, generatedAt: "2026-11-07T10:00:00Z", skipped: [],
  weeks: [
    { week: 1, startDate: "2026-11-09", focusSkillId: "docker", isExamWeek: false, proof: "Dockerfile merged", receipt: { demandPct: 41, coveredByDegree: "no", reason: "" }, tasks: [{ id: "t1", type: "learn", title: "Docker basics", free: true, hours: 2, done: true }] },
    { week: 2, startDate: "2026-11-16", focusSkillId: "pytorch", isExamWeek: false, proof: "Merge a PR that adds batch inference", receipt: { demandPct: 38, coveredByDegree: "no", trend: "rising", reason: "PyTorch is in 38% of ML engineer ads and it powers your pod's captioning model." },
      tasks: [{ id: "t2", type: "learn", title: "PyTorch in 60 minutes", free: true, hours: 2 }, { id: "t3", type: "build", title: "Batch inference endpoint", free: true, hours: 4 }] },
  ],
};

type Routes = Record<string, () => Response>;
const json = (data: unknown, status = 200) => () => new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: { code: "internal", message: "boom" } }), { status, headers: { "content-type": "application/json" } });
const notFound = () => new Response("<html>404</html>", { status: 404 });

function mockApi(overrides: Routes = {}) {
  const routes: Routes = {
    "/api/graph/aisha": json(MAP),
    "/api/roadmap/aisha": notFound,
    "/api/market/ml-engineer": json(MARKET),
    "/api/pods": json([]),
    "/api/momentum/aisha": json([]),
    ...overrides,
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input).split("?")[0];
    const hit = routes[path];
    return hit ? hit() : notFound();
  });
}

function renderDashboard(props: Partial<React.ComponentProps<typeof DashboardView>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DashboardView userId="aisha" roleId="ml-engineer" profile={AISHA} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { podThrows.value = false; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("DashboardView", () => {
  it("renders this week, readiness, market pulse and the coach with mocked fetches", async () => {
    const fetchSpy = mockApi();
    renderDashboard();
    expect(screen.getByRole("heading", { level: 1, name: "Hi Aisha 👋" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "This week: Docker" })).toBeInTheDocument();
    expect(screen.getByText("You're 38% of the way to ML engineer roles. Here's this week.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Readiness 38 percent, projected 84 percent" })).toBeInTheDocument();
    expect(screen.getByText("→ 84% by Sep 2027")).toBeInTheDocument();
    // No roadmap yet (404): the first gap from the map, with a proof suggestion.
    expect(screen.getByText(/Week 1 · from your Bridge Map/)).toBeInTheDocument();
    expect(screen.getByText("Merge a PR that adds a Dockerfile to your pod repo")).toBeInTheDocument();
    expect(screen.getByText("41% of ML engineer ads ask for Docker, and none of your modules teach it.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start this week's task/ })).toHaveAttribute("href", "/roadmap#skill-docker");
    // Market pulse appears once the market route answers.
    expect(await screen.findByText("214")).toBeInTheDocument();
    expect(screen.getByText("ML engineer ads analysed · Docker in 41%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ask the coach/ })).toHaveAttribute("href", "/coach");
    expect(screen.getByText(/Welcome to UoM/)).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    const gaps = screen.getByRole("heading", { name: "Top gaps by demand" }).nextElementSibling as HTMLElement;
    expect(within(gaps).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/map?skill=docker", "/map?skill=pytorch", "/map?skill=sql"]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/graph/aisha?roleId=ml-engineer", expect.anything());
    expect(fetchSpy).toHaveBeenCalledWith("/api/roadmap/aisha", expect.anything());
  });

  it("uses the roadmap's current week when there is one", async () => {
    mockApi({ "/api/roadmap/aisha": json(ROADMAP) });
    renderDashboard();
    expect(await screen.findByRole("heading", { name: "This week: PyTorch" })).toBeInTheDocument();
    expect(screen.getByText("Week 2 · from 16 Nov")).toBeInTheDocument();
    expect(screen.getByText("PyTorch in 60 minutes")).toBeInTheDocument();
    expect(screen.getByText("Merge a PR that adds batch inference")).toBeInTheDocument();
    expect(screen.getByText(/powers your pod's captioning model/)).toBeInTheDocument();
  });

  it("starts from the server map without waiting for /api/graph, and hides market pulse on a 404", async () => {
    mockApi({ "/api/graph/aisha": notFound, "/api/market/ml-engineer": notFound });
    renderDashboard({ initialMap: MAP });
    expect(screen.getByRole("img", { name: /Readiness 38 percent/ })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "This week: Docker" })).toBeInTheDocument();
    expect(screen.queryByText("Market pulse")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is no map yet", async () => {
    mockApi({ "/api/graph/priya": notFound });
    renderDashboard({ userId: "priya", profile: null });
    expect(await screen.findByRole("heading", { name: "Your Bridge Map isn't built yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start onboarding" })).toHaveAttribute("href", "/onboard");
    expect(screen.getByRole("heading", { level: 1, name: "Hi Priya 👋" })).toBeInTheDocument();
  });

  it("shows Retry and demo data when the map fails to load", async () => {
    mockApi({ "/api/graph/aisha": json(null, 500) });
    renderDashboard();
    expect(await screen.findByRole("heading", { name: "We couldn't load your Bridge Map" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use demo data" })).toBeInTheDocument();
  });

  it("a slot that throws renders its fallback card and the rest still renders", async () => {
    podThrows.value = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi();
    renderDashboard({ initialMap: MAP });
    expect(await screen.findByTestId("slot-fallback")).toHaveTextContent("This card didn't load");
    expect(await screen.findByRole("heading", { name: "This week: Docker" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask Keystone" })).toBeInTheDocument();
  });
});

describe("dashboard data helpers", () => {
  it("fetchOptional returns null on 404 and throws on other errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(notFound()).mockResolvedValueOnce(json(null, 500)());
    await expect(fetchOptional("/api/roadmap/aisha")).resolves.toBeNull();
    await expect(fetchOptional("/api/roadmap/aisha")).rejects.toThrow("boom");
  });

  it("currentWeek is the first week with an unfinished task", () => {
    expect(currentWeek(ROADMAP)?.week).toBe(2);
    expect(monthYear("2027-09-01")).toBe("Sep 2027");
  });
});
