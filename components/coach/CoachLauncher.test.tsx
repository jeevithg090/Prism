// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/fetcher", () => ({ apiPost: vi.fn(), apiGet: vi.fn(), apiPatch: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/community/useViewerId", () => ({ useViewerId: () => "aisha" }));

import { CoachLauncher } from "./CoachLauncher";

afterEach(cleanup);

describe("CoachLauncher", () => {
  it("opens the Coach in a sheet from the floating Ask Keystone button", async () => {
    const user = userEvent.setup();
    render(<CoachLauncher />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask Keystone" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Keystone Coach");
    expect(screen.getByRole("button", { name: "What should I do this week?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ask the Coach")).toBeInTheDocument();
  });
});
