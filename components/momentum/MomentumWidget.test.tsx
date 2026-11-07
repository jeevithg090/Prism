// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MomentumWeek } from "@/lib/types";
import { MomentumWidget } from "./MomentumWidget";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const week = (w: number, score: number, changePct: number, breakdown: MomentumWeek["breakdown"] = []): MomentumWeek =>
  ({ userId: "aisha", week: `2026-W${w}`, score, baseline: 10, changePct, breakdown });
const WEEKS: MomentumWeek[] = [
  week(40, 6, 0), week(41, 8, 10), week(42, 10, 12), week(43, 12, 14), week(44, 14, 16),
  week(45, 17, 18, [
    { kind: "pr-merged", points: 10, count: 2 },
    { kind: "roadmap-milestone", points: 4, count: 1 },
    { kind: "helped-newcomer", points: 3, count: 1 },
  ]),
];
function mockFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({ json: async () => body } as Response);
}

describe("MomentumWidget", () => {
  it("renders +18% and the growth footnote", async () => {
    const fetchSpy = mockFetch({ ok: true, data: WEEKS });
    render(<MomentumWidget userId="aisha" />);
    const big = await screen.findByText("+18%");
    expect(big).toHaveClass("text-status-proven");
    expect(screen.getByText("vs your usual week")).toBeInTheDocument();
    expect(screen.getByText(/growth, not/)).toBeInTheDocument();
    expect(screen.getByText(/18 percent above your usual week/)).toHaveClass("sr-only");
    expect(screen.getByTestId("momentum-sparkline").querySelectorAll("path")).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledWith("/api/momentum/aisha");
  });

  it("shows this week's breakdown in a popover", async () => {
    mockFetch({ ok: true, data: WEEKS });
    const user = userEvent.setup();
    render(<MomentumWidget userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: /breakdown/i }));
    expect(await screen.findByText("2 merged PRs · 1 milestone · helped 1 newcomer")).toBeInTheDocument();
  });

  it("uses the gap colour for a negative change", async () => {
    mockFetch({ ok: true, data: [...WEEKS.slice(0, 5), week(45, 4, -60, [{ kind: "roadmap-milestone", points: 4, count: 1 }])] });
    render(<MomentumWidget userId="aisha" />);
    expect(await screen.findByText("−60%")).toHaveClass("text-status-gap");
  });

  it("shows the empty state when there is no activity", async () => {
    mockFetch({ ok: true, data: WEEKS.map((w) => ({ ...w, score: 0, changePct: 0, breakdown: [] })) });
    render(<MomentumWidget userId="newbie" />);
    expect(await screen.findByText("Your momentum starts with your first step this week.")).toBeInTheDocument();
  });

  it("shows an error with Retry and falls back to demo data", async () => {
    mockFetch({ ok: false, error: { code: "internal", message: "boom" } });
    const user = userEvent.setup();
    render(<MomentumWidget userId="aisha" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(await screen.findByText("+18%")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });
});
