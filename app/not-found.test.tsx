// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotFound from "./not-found";
import RootError from "./error";

afterEach(cleanup);

describe("not-found page", () => {
  it("names the problem in one heading and offers a way home and to the dashboard", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "We can't find that page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the home page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Open your dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});

describe("root error boundary", () => {
  it("retries when asked", async () => {
    const retry = vi.fn();
    render(<RootError error={new Error("boom")} retry={retry} />);
    expect(screen.getByRole("heading", { level: 1, name: "This page didn't load" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
