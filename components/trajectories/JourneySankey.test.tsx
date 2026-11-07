// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trajectory, TrajectoryStep } from "@/lib/types";
import { JourneySankey } from "./JourneySankey";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const t = (id: string, outcomeRole: string, steps: TrajectoryStep[]): Trajectory => ({
  id, userId: id, name: id, programmeId: "uom-bsc-cs", outcomeRole, steps, advice: "Start small.", isDemo: true, openToChat: true,
});
const data = [
  t("a", "ML engineer at a fintech", [{ year: 1, kind: "society", label: "AI society" }, { year: 3, kind: "placement", label: "Year in industry" }]),
  t("b", "Software engineer at a bank", [{ year: 1, kind: "hackathon", label: "GreatUniHack" }, { year: 2, kind: "internship", label: "Bank internship" }]),
  t("c", "PhD in ML", [{ year: 1, kind: "project", label: "CV side project" }]),
];

describe("JourneySankey", () => {
  it("shows the summary caption, outcome chips and a list fallback", async () => {
    const user = userEvent.setup();
    render(<JourneySankey trajectories={data} />);
    expect(screen.getByText("Of 3 journeys, 1 led to ML roles; 1 of those included a placement.")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();

    const chips = screen.getByRole("group", { name: /Filter journeys by outcome/ });
    expect(within(chips).getAllByRole("button").map((b) => b.textContent)).toEqual(["All3", "ML1", "Software1", "Data0", "PhD1", "Startup0"]);

    await user.click(screen.getByRole("button", { name: /View as list/ }));
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3 paths

    await user.click(within(chips).getByRole("button", { name: /Software/ }));
    expect(within(chips).getByRole("button", { name: /Software/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Of 3 journeys, 1 led to software roles; 0 of those included a placement.")).toBeInTheDocument();
  });
});
