// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { CapstoneRoadmap } from "./CapstoneRoadmap";

function renderRoadmap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CapstoneRoadmap userId="aisha" roleId="ml-engineer" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CapstoneRoadmap", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(Response.json({ ok: true, data: [] })));
  });

  it("keeps the page heading in the empty state", async () => {
    renderRoadmap();
    await screen.findByText("No capstone projects yet");
    expect(screen.getByRole("heading", { level: 1, name: "Your capstone roadmap" })).toBeInTheDocument();
  });

  it("opens the create dialog from the empty state's New project button", async () => {
    renderRoadmap();
    await screen.findByText("No capstone projects yet");
    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(await screen.findByRole("dialog", { name: "New capstone project" })).toBeInTheDocument();
  });

  it("shows an error state with Retry when loading fails", async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(Response.json({ ok: false, error: { message: "down" } }, { status: 500 })));
    renderRoadmap();
    expect(await screen.findByText("We could not load your capstone projects")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
