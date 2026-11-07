// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InterviewFeedback } from "@/lib/types";
import fixture from "@/data/fixtures/interview.feedback.aisha.json";
import { FeedbackCard, averageScore } from "./FeedbackCard";

const fb = fixture as InterviewFeedback;

afterEach(cleanup);

describe("FeedbackCard", () => {
  it("renders 4 labelled score bars, the filler rate and the improvements list", () => {
    render(<FeedbackCard feedback={fb} name="Aisha" userId="aisha" onPractiseAgain={() => {}} />);

    expect(screen.getByRole("heading", { name: "Nice work, Aisha!" })).toBeInTheDocument();

    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(4);
    for (const [label, value] of [
      ["Content", 4],
      ["Structure", 3],
      ["Clarity", 4],
      ["Confidence", 3],
    ] as const) {
      const m = screen.getByRole("meter", { name: new RegExp(`^${label}`) });
      expect(m).toHaveAttribute("aria-valuenow", String(value));
      expect(m).toHaveAttribute("aria-valuetext", `${value} out of 5`);
    }

    expect(screen.getByText("6.2/min")).toBeInTheDocument();
    expect(screen.getByText(/aim < 4/)).toBeInTheDocument();

    const improvements = screen.getByRole("list", { name: /try next time/i });
    const items = within(improvements).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Structure answers as situation → action → result");

    const strengths = screen.getByRole("list", { name: /what went well/i });
    expect(within(strengths).getAllByRole("listitem")).toHaveLength(2);
  });

  it("links to the passport and lets you practise again", async () => {
    const onAgain = vi.fn();
    render(<FeedbackCard feedback={fb} name="Aisha" userId="aisha" onPractiseAgain={onAgain} />);
    expect(screen.getByRole("link", { name: /see it on your passport/i })).toHaveAttribute("href", "/profile/aisha");
    await userEvent.click(screen.getByRole("button", { name: /practise again/i }));
    expect(onAgain).toHaveBeenCalledOnce();
  });

  it("marks a filler rate under the target as on target, with the number in the main text colour", () => {
    render(<FeedbackCard feedback={{ ...fb, fillerWordsPerMin: 2.5 }} name="Aisha" userId="aisha" onPractiseAgain={() => {}} />);
    const n = screen.getByText("2.5/min");
    expect(n).toHaveClass("text-foreground");
    expect(n).not.toHaveClass("text-status-proven");
    expect(screen.getByText("On target")).toBeInTheDocument();
  });

  it("does not show on target when the filler rate is at or above the target", () => {
    render(<FeedbackCard feedback={fb} name="Aisha" userId="aisha" onPractiseAgain={() => {}} />);
    expect(screen.queryByText("On target")).not.toBeInTheDocument();
  });

  it("averages the four scores", () => {
    expect(averageScore(fb)).toBe(3.5);
  });
});
