// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MatchingAnimation } from "./MatchingAnimation";
import { fallbackMember } from "./members";

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

afterEach(cleanup);

describe("MatchingAnimation", () => {
  it("renders the static progress line under reduced motion", () => {
    render(<MatchingAnimation user={fallbackMember("aisha")} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Comparing 12 students… finding who fills your gaps");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("still reports done once the match arrives", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<MatchingAnimation user={fallbackMember("aisha")} picks={["priya", "tom", "mei"]} onDone={onDone} />);
    await vi.advanceTimersByTimeAsync(500);
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
