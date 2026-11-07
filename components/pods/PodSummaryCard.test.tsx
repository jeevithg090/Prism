// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { PodSummaryCard } from "./PodSummaryCard";
import { demoPod, profileGet, renderWithClient } from "./testUtils";

const { apiGet, push } = vi.hoisted(() => ({ apiGet: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({ apiGet, apiPost: vi.fn(), apiPatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

afterEach(cleanup);

describe("PodSummaryCard", () => {
  it("shows \"You're not in a pod yet\" with a Find my pod link when the API returns []", async () => {
    apiGet.mockImplementation(async (url: string) => (url.startsWith("/api/pods") ? [] : profileGet(url)));
    renderWithClient(<PodSummaryCard userId="aisha" />);
    expect(await screen.findByText("You're not in a pod yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Find my pod/ })).toHaveAttribute("href", "/pods");
    expect(apiGet).toHaveBeenCalledWith("/api/pods?userId=aisha");
  });

  it("shows the pod name, 4 avatars and the viewer's first issue", async () => {
    apiGet.mockImplementation(async (url: string) => (url.startsWith("/api/pods") ? [demoPod(true)] : profileGet(url)));
    renderWithClient(<PodSummaryCard userId="aisha" />);
    expect(await screen.findByRole("heading", { name: "Pod Aurora" })).toBeInTheDocument();
    expect(screen.getByText("Add Docker support")).toBeInTheDocument();
    expect(screen.getByText(/Your issue:/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Pod members/ }).querySelectorAll("[role=img]")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Open pod/ })).toHaveAttribute("href", "/pods/pod_demo01");
  });

  it("offers Retry and demo data when the API fails", async () => {
    apiGet.mockRejectedValue(new Error("boom"));
    renderWithClient(<PodSummaryCard userId="aisha" />);
    const demo = await screen.findByRole("button", { name: "Use demo data" });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    demo.click();
    expect(push).toHaveBeenCalledWith("/pods/pod_demo01");
  });
});
