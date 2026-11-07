// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { Receipt } from "@/lib/types";
import { ReceiptDrawer } from "@/components/keystone";

afterEach(cleanup);

const receipt: Receipt = {
  demandPct: 41, trend: "rising", coveredByDegree: "no", evidenceIds: ["ev_1"],
  reason: "41% of ML engineer ads ask for Docker (and rising), and none of your modules teach it.",
};

describe("ReceiptDrawer", () => {
  it("opens from its Why? trigger with the numbers, and Escape closes it", async () => {
    const user = userEvent.setup();
    render(<ReceiptDrawer receipt={receipt} title="Week 1 · Docker" roleName="ML engineer"
      evidence={[{ id: "ev_1", url: "https://github.com/a/b", quote: "Dockerfile builds the API", source: "keystone-pod" }]} />);
    await user.click(screen.getByRole("button", { name: "Why?" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Why am I seeing this?");
    expect(dialog).toHaveTextContent("41%");
    expect(dialog).toHaveTextContent("of ML engineer ads ask for it");
    expect(dialog).toHaveTextContent("None of your modules teach it.");
    expect(dialog).toHaveTextContent("Rising");
    expect(screen.getByRole("link", { name: /Pod PR: Dockerfile builds the API/ })).toHaveAttribute("href", "https://github.com/a/b");
    expect(dialog).toHaveTextContent(receipt.reason);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
