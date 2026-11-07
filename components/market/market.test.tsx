// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import mlDemand from "@/data/fixtures/market.ml-engineer.json";
import trends from "@/data/fixtures/trends.json";
import type { RoleDemand, TrendSeries } from "@/lib/types";
import { MarketView } from "./MarketView";
import { roleOutlook } from "./outlook";
import { SkillDemandList } from "./SkillDemandList";

afterEach(cleanup);

const skills = [
  { skillId: "python", share: 0.86, trend: "rising" as const },
  { skillId: "docker", share: 0.41, trend: "stable" as const },
];
const list = (onPick = vi.fn()) =>
  render(<SkillDemandList skills={skills} names={{ python: "Python", docker: "Docker" }} statusBySkill={{ docker: "gap" }} onPick={onPick} />);

describe("SkillDemandList", () => {
  it("shows the percentage and a labelled trend badge with an icon", () => {
    list();
    expect(screen.getByText("86%")).toBeInTheDocument();
    const badge = screen.getByText("Rising");
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("shows the user's status for a skill", () => {
    list();
    expect(screen.getByText("Gap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Docker.*41%.*of ads.*Stable.*You:.*Gap/ })).toBeInTheDocument();
  });

  it("picks a skill by mouse and by keyboard", async () => {
    const onPick = vi.fn();
    list(onPick);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenLastCalledWith("python");
    await user.click(screen.getByRole("button", { name: /Docker/ }));
    expect(onPick).toHaveBeenLastCalledWith("docker");
  });
});

describe("MarketView", () => {
  const props = {
    trends: [], slots: [], maxPicked: 4, names: {}, statusBySkill: {},
    isLoading: false, isError: false, refetch: vi.fn(), onPick: vi.fn(), onRemove: vi.fn(),
  };

  it("offers Retry when loading fails", async () => {
    const refetch = vi.fn();
    render(<MarketView {...props} isError refetch={refetch} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Use demo data" })).toBeInTheDocument();
  });

  it("explains an empty role", () => {
    render(<MarketView {...props} market={{ ...(mlDemand as unknown as RoleDemand), skills: [] }} />);
    expect(screen.getByText(/No ads found for this role yet/)).toBeInTheDocument();
  });
});

it("rates the ML engineer fixture as rising", () => {
  const { label } = roleOutlook((mlDemand as unknown as RoleDemand).skills, trends as unknown as TrendSeries[]);
  expect(label).toBe("rising");
});
