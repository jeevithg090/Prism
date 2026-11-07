// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "@/data/fixtures/interview.feedback.aisha.json";
import { FeedbackCard, type FeedbackView } from "./FeedbackCard";

afterEach(cleanup);

describe("FeedbackCard", () => {
  it("renders 4 labelled score bars, the filler rate, improvements and the saved proof", async () => {
    const onAgain = vi.fn();
    const fb: FeedbackView = { ...(fixture as FeedbackView), evidence: [{ id: "a", label: "Communication" }, { id: "b", label: "Docker (explained)" }] };
    render(<FeedbackCard feedback={fb} name="Aisha" onAgain={onAgain} passportHref="/profile/aisha" />);
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(4);
    expect(screen.getByRole("meter", { name: /Content/ })).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByRole("meter", { name: /Structure/ })).toHaveAttribute("aria-valuetext", "3 out of 5");
    expect(screen.getByTestId("filler-rate")).toHaveTextContent("6.2/min");
    const improvements = screen.getByRole("list", { name: "Improvements" });
    expect(improvements.querySelectorAll("li")).toHaveLength(2);
    expect(improvements).toHaveTextContent("situation → action → result");
    expect(screen.getByTestId("saved-proof")).toHaveTextContent("Saved as proof: Communication · Docker (explained)");
    expect(screen.getByText(/Interview-ready/)).toBeInTheDocument(); // avg 3.5
    expect(screen.getByRole("link", { name: "See it on your passport" })).toHaveAttribute("href", "/profile/aisha");
    await userEvent.click(screen.getByRole("button", { name: /Practise again/ }));
    expect(onAgain).toHaveBeenCalled();
  });

  it("says nothing was saved for demo feedback", () => {
    render(<FeedbackCard feedback={fixture as FeedbackView} name="Aisha" isDemo onAgain={() => {}} passportHref="/p" />);
    expect(screen.getByText(/demo feedback, so nothing was saved/)).toBeInTheDocument();
  });
});
