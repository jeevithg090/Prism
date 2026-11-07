// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trajectory } from "@/lib/types";

const { draftMock, apiPostMock, toastSuccess, toastError } = vi.hoisted(() => ({
  draftMock: vi.fn(), apiPostMock: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn(),
}));
vi.mock("./actions", () => ({ draftChatRequest: draftMock }));
vi.mock("@/lib/fetcher", () => ({ apiPost: apiPostMock, apiGet: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { AskChatDialog } from "./AskChatDialog";

const priya: Trajectory = {
  id: "traj_priya", userId: "priya", name: "Priya Shah", programmeId: "uom-bsc-cs", outcomeRole: "ML engineer", advice: "Ask early.",
  isDemo: true, openToChat: true, steps: [{ year: 3, kind: "placement", label: "Year in industry at an ML consultancy" }],
};

afterEach(cleanup);

describe("AskChatDialog", () => {
  beforeEach(() => {
    draftMock.mockReset().mockResolvedValue({ draft: "Hi Priya, could we chat about your placement?", source: "template" });
    apiPostMock.mockReset().mockResolvedValue({ id: "help_x" });
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("drafts on open, lets you edit, sends a chat-15 help request and toasts", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<AskChatDialog trajectory={priya} viewerId="aisha" open onOpenChange={onOpenChange} />);

    const box = await screen.findByRole("textbox", { name: "Your message to Priya" });
    expect(box).toHaveValue("Hi Priya, could we chat about your placement?");
    expect(draftMock).toHaveBeenCalledWith({ viewerId: "aisha", trajectory: priya });
    expect(screen.getByText(/never sends anything outside the app/)).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "Hi Priya! How did you find your placement?");
    expect(box).toHaveValue("Hi Priya! How did you find your placement?");

    await user.click(screen.getByRole("button", { name: /Send request/ }));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith("/api/help", {
      fromUserId: "aisha", toUserId: "priya", kind: "chat-15", message: "Hi Priya! How did you find your placement?",
    }));
    expect(toastSuccess).toHaveBeenCalledWith("Request sent: they'll see it in Community.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast and stays open when sending fails", async () => {
    apiPostMock.mockRejectedValue(new Error("message is required"));
    const onOpenChange = vi.fn();
    render(<AskChatDialog trajectory={priya} viewerId="aisha" open onOpenChange={onOpenChange} />);
    await screen.findByRole("textbox", { name: "Your message to Priya" });
    await userEvent.click(screen.getByRole("button", { name: /Send request/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
