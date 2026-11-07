// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BridgeMap } from "@/lib/types";

const { refresh, pathname } = vi.hoisted(() => ({ refresh: vi.fn(), pathname: { value: "/pods/pod_demo01" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh, prefetch: vi.fn() }),
}));

import { Sidebar, SidebarView, isActive, primaryNav } from "./Sidebar";
import { MobileNavView } from "./MobileNav";
import { PersonaSwitcher, PERSONAS } from "./PersonaSwitcher";
import { ThemeToggle, THEME_KEY } from "./ThemeToggle";
import { AgentsButton, ReadinessPill, isRunLive } from "./TopBar";

function withClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "ks_uid=; path=/; max-age=0";
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Sidebar", () => {
  it("marks the active link with aria-current=page (sub-pages keep their section active)", () => {
    render(<SidebarView pathname="/pods/pod_demo01" viewerId="aisha" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const pods = screen.getByRole("link", { name: "Pods" });
    expect(nav).toContainElement(pods);
    expect(pods).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("lists every page, the staff group, and the viewer's own passport", () => {
    render(<SidebarView pathname="/dashboard" viewerId="priya" />);
    for (const label of ["Dashboard", "Bridge Map", "Roadmap", "Industry Radar", "Pods", "Trajectories", "Community", "Coach", "Interview", "Lecturer Insights", "Agents & governance"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Passport" })).toHaveAttribute("href", "/profile/priya");
    expect(screen.getByText("For staff & judges")).toBeInTheDocument();
    expect(screen.getByText("Reply · AI on Campus")).toBeInTheDocument();
  });

  it("reads the path from the router", () => {
    pathname.value = "/community";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Community" })).toHaveAttribute("aria-current", "page");
    pathname.value = "/pods/pod_demo01";
  });

  it("isActive matches the passport on any /profile path", () => {
    const passport = primaryNav("aisha").find((i) => i.id === "passport")!;
    expect(isActive("/profile/priya", passport)).toBe(true);
    expect(isActive("/podsx", primaryNav("aisha")[4])).toBe(false);
  });
});

describe("MobileNav", () => {
  it("has 4 tabs plus More with 44px targets, and publishes --mobile-nav-height on <body>", async () => {
    render(<MobileNavView pathname="/roadmap" viewerId="aisha" />);
    expect(screen.getByRole("link", { name: "Roadmap" })).toHaveAttribute("aria-current", "page");
    for (const name of ["Dashboard", "Map", "Pods"]) expect(screen.getByRole("link", { name })).toHaveClass("min-h-11");
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveClass("min-h-11");
    expect(document.body.style.getPropertyValue("--mobile-nav-height")).toMatch(/px$/);
    await userEvent.click(more);
    expect(await screen.findByRole("link", { name: "Industry Radar" })).toHaveAttribute("href", "/market");
    expect(screen.getByRole("link", { name: "Lecturer Insights" })).toBeInTheDocument();
  });
});

describe("PersonaSwitcher", () => {
  it("lists Aisha plus the 12 seeded students", () => {
    expect(PERSONAS[0].id).toBe("aisha");
    expect(PERSONAS).toHaveLength(13);
  });

  it("choosing a student sets the ks_uid cookie and refreshes", async () => {
    const user = userEvent.setup();
    render(<PersonaSwitcher />);
    const trigger = screen.getByRole("button", { name: /Viewing as Aisha/ });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitemradio", { name: /Priya Shah/ }));
    expect(document.cookie).toContain("ks_uid=priya");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the student from the cookie", () => {
    document.cookie = "ks_uid=tom; path=/";
    render(<PersonaSwitcher />);
    expect(screen.getByRole("button", { name: /Viewing as Tom/ })).toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  it("toggles .dark on <html> and remembers it", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("survives a localStorage that throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("private mode"); });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveClass("dark");
  });
});

describe("TopBar pieces", () => {
  const map = { userId: "aisha", roleId: "ml-engineer", nodes: [], edges: [], readinessNow: 0.38, readinessProjected: 0.84, generatedAt: "2026-11-07T10:00:00Z" } as BridgeMap;

  it("readiness pill shows 'ML engineer · 38%' from the server map and links to the map", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not found", { status: 404 }));
    withClient(<ReadinessPill userId="aisha" roleId="ml-engineer" initial={map} />);
    const link = screen.getByRole("link", { name: /ML engineer · 38%/ });
    expect(link).toHaveAttribute("href", "/map");
  });

  it("readiness pill reads /api/graph and stays hidden on a 404 with no fallback", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not found", { status: 404 }));
    const { container } = withClient(<ReadinessPill userId="priya" roleId="ml-engineer" initial={null} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/graph/priya?roleId=ml-engineer", expect.anything()));
    expect(container).toBeEmptyDOMElement();
  });

  it("a run is live until the orchestrator finishes", () => {
    const ev = (agent: string, status: string) => ({ agent, status });
    expect(isRunLive([])).toBe(false);
    expect(isRunLive([ev("orchestrator", "started"), ev("market", "progress")])).toBe(true);
    expect(isRunLive([ev("orchestrator", "started"), ev("market", "done")])).toBe(true);
    expect(isRunLive([ev("orchestrator", "started"), ev("orchestrator", "done")])).toBe(false);
  });

  it("the Agents button is named and safe without a provider", async () => {
    render(<AgentsButton />);
    const btn = screen.getByRole("button", { name: "Agents" });
    expect(btn).not.toHaveAttribute("data-live");
    await userEvent.click(btn);
  });
});
