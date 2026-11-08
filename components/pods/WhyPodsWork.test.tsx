// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhyPodsWork } from "@/components/pods/WhyPodsWork";

afterEach(cleanup);

describe("WhyPodsWork", () => {
  it("renders both citations when the Why? popover is opened", async () => {
    render(<WhyPodsWork />);
    expect(screen.queryByText(/Nestojko/)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Why pods work: the research" }),
    );

    expect(
      await screen.findByText(/Nestojko, Bui, Kornell & Bjork \(2014\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Double, McGrane & Hopfenbeck \(2020\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Expecting to teach makes you learn better."),
    ).toBeInTheDocument();
    expect(screen.getByText(/g = 0\.31/)).toBeInTheDocument();
    expect(
      screen.getByText(/Never on personal characteristics/),
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://doi.org/10.3758/s13421-014-0416-z",
      "https://doi.org/10.1007/s10648-019-09510-3",
    ]);
    for (const a of links)
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("inline variant shows the receipts without a click", () => {
    render(<WhyPodsWork variant="inline" />);
    expect(
      screen.getByRole("region", { name: "Why pods work" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nestojko/)).toBeInTheDocument();
    expect(screen.getByText(/Double, McGrane/)).toBeInTheDocument();
    expect(screen.getByText(/Memory & Cognition/)).toBeInTheDocument();
    expect(
      screen.getByText(/Educational Psychology Review/),
    ).toBeInTheDocument();
  });
});
