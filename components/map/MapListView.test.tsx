// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import type { BridgeMap } from "@/lib/types";
import { MapListView } from "@/components/map/MapListView";
const nodes = (fixture as BridgeMap).nodes;
describe("MapListView", () => {
  it("sorts by demand descending then toggles ascending", () => {
    render(<MapListView nodes={nodes} onSelect={vi.fn()}/>);
    const buttons = screen.getAllByRole("button", { name: /Docker|Python|SQL/ });
    expect(buttons[0]).toHaveTextContent("Docker");
    fireEvent.click(screen.getByRole("button", { name: "Sort demand ascending" }));
    const sorted = screen.getAllByRole("row");
    expect(sorted.at(-1)).toHaveTextContent("Docker");
  });
});
