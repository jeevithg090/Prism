// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardPage from "@/app/(app)/onboard/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

describe("onboarding wizard", () => {
  beforeEach(() => { localStorage.clear(); push.mockClear(); });
  it("requires a name before continuing and persists the draft", () => {
    render(<OnboardPage/>);
    const next = screen.getByRole("button", { name: "Continue" });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Aisha" } });
    expect(next).toBeEnabled(); expect(localStorage.getItem("ks_onboard_draft")).toContain("Aisha");
  });
  it("shows the live theory and practice sentence at 70 percent", () => {
    render(<OnboardPage/>); fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Aisha" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Mostly building \(70%\), some reading \(30%\)/)).toBeInTheDocument();
  });
  it("shows a GitHub avatar preview once a username is entered", () => {
    render(<OnboardPage/>); fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Aisha" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); fireEvent.click(screen.getByRole("button", { name: "Continue" })); fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/GitHub username/), { target: { value: "octocat" } });
    expect(screen.getByRole("img", { name: /octocat GitHub avatar/ })).toHaveAttribute("src", "https://github.com/octocat.png?size=80");
  });
});
