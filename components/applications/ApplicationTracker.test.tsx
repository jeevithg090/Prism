// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import ApplicationTracker from "./ApplicationTracker";

const respond = (data: unknown) => Promise.resolve(Response.json({ ok: true, data }));

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() => respond([]));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ApplicationTracker", () => {
  it("renders a page heading and never nests a button inside another button", async () => {
    const { container } = render(<ApplicationTracker userId="aisha" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Application tracker" })).toBeInTheDocument();
    await screen.findByText("No applications yet");
    expect(container.querySelector("button button")).toBeNull();
  });

  it("opens the add dialog from the empty state", async () => {
    render(<ApplicationTracker userId="aisha" />);
    await userEvent.click(await screen.findByRole("button", { name: "Add your first application" }));
    expect(await screen.findByRole("dialog", { name: "Add application" })).toBeInTheDocument();
  });

  it("opens the add dialog from the header button", async () => {
    render(<ApplicationTracker userId="aisha" />);
    await userEvent.click(await screen.findByRole("button", { name: "Add application" }));
    expect(await screen.findByRole("dialog", { name: "Add application" })).toBeInTheDocument();
  });
});
