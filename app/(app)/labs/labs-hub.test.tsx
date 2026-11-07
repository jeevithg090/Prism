// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LAB_FEATURES } from "@/lib/features";
import LabsPage from "./page";

afterEach(cleanup);

describe("/labs hub", () => {
  it("lists every Labs feature under its pillar with a link, its connected parts and its agent", () => {
    render(<LabsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Labs" })).toBeInTheDocument();
    for (const f of LAB_FEATURES) {
      const link = screen.getByRole("link", { name: f.title });
      expect(link).toHaveAttribute("href", f.href);
      const card = link.closest("li[data-lab]") as HTMLElement;
      const pillar = card.closest("section") as HTMLElement;
      expect(within(pillar).getByRole("heading", { level: 2 }).textContent?.toLowerCase()).toBe(f.pillar);
      for (const part of f.connects) expect(within(card).getByText(part)).toBeInTheDocument();
      expect(within(card).getAllByRole("img").length).toBeGreaterThan(0);
    }
  });

  it("orders the pillars Learning, Assessment, Teaching and uses no middle dots", () => {
    const { container } = render(<LabsPage />);
    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const expected = ["Learning", "Assessment", "Teaching"].filter((p) => LAB_FEATURES.some((f) => f.pillar === p.toLowerCase()));
    expect(order).toEqual(expected);
    expect(container.textContent).not.toContain("·");
  });
});
