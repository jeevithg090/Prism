// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BadgePill, ErrorState, ReadinessRing, ReceiptDrawer, SkillChip, StatusBadge } from "@/components/keystone";

describe("Keystone shared components", () => {
  it("pairs the gap label with an icon and marks upcoming degree status", () => {
    const { container, rerender } = render(<StatusBadge status="gap"/>);
    expect(screen.getByText("Gap")).toBeInTheDocument(); expect(container.querySelector("svg")).toBeInTheDocument();
    rerender(<StatusBadge status="degree-upcoming"/>); expect(container.firstElementChild).toHaveClass("border-dashed");
  });
  it("renders a button SkillChip with a useful accessible label", () => {
    const onClick = vi.fn(); render(<SkillChip skillId="docker" name="Docker" status="gap" level={2} onClick={onClick}/>);
    fireEvent.click(screen.getByRole("button", { name: /Docker, gap, level 2 of 3/i })); expect(onClick).toHaveBeenCalledOnce();
  });
  it("announces current and projected readiness", () => {
    render(<ReadinessRing value={.38} projected={.84} label="by Sep 2027"/>);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Readiness 38 percent, projected 84 percent");
  });
  it("explains a recommendation and closes the receipt on Escape", async () => {
    const changed = vi.fn(); render(<ReceiptDrawer open title="Docker" onOpenChange={changed} receipt={{ demandPct: 41, coveredByDegree: "no", reason: "Not taught in your modules." }}/>);
    expect(screen.getByText(/41% of/)).toBeInTheDocument(); expect(screen.getByText(/none of your modules/i)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(changed).toHaveBeenCalledWith(false);
  });
  it("calls retry and demo actions and labels the newcomer badge", () => {
    const retry = vi.fn(), demo = vi.fn(); render(<ErrorState onRetry={retry} onUseDemo={demo}/>);
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); fireEvent.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(retry).toHaveBeenCalledOnce(); expect(demo).toHaveBeenCalledOnce();
    render(<BadgePill badge="new-to-uni"/>); expect(screen.getByText("New to UoM")).toBeInTheDocument();
  });
});
