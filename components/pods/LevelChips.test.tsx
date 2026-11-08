// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LevelChips } from "@/components/pods/LevelChips";

afterEach(cleanup);

describe("LevelChips", () => {
  it("renders a labelled pill per Reply level-3 item", () => {
    render(
      <LevelChips
        items={["multi-agent", "knowledge-graph", "launch-campaign"]}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Reply level 3 features" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Multi-agent/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Knowledge graph/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Launch campaign/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("L3")).toHaveLength(3);
  });

  it("explains the item in a tooltip on focus", async () => {
    render(<LevelChips items={["multi-agent"]} />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /Multi-agent/ })).toHaveFocus();
    expect(
      await screen.findByText(
        /Matchmaker, Architect, Tech Lead and Evidence agents hand off to each other/,
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<LevelChips items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
