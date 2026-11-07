// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const joinWaitlist = vi.fn();
vi.mock("@/lib/voice/waitlist", () => ({ joinWaitlist: (...args: unknown[]) => joinWaitlist(...args) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LaunchPage, METRICS, POSTERS, TIMELINE, VOICEOVER_SCRIPT } from "./LaunchPage";
import { WaitlistForm, CONSENT_TEXT } from "./WaitlistForm";

function waitlistSection() {
  return document.getElementById("waitlist") as HTMLElement;
}

describe("LaunchPage", () => {
  beforeEach(() => {
    joinWaitlist.mockReset();
  });
  afterEach(cleanup);

  it("renders the slogan as the single h1 with the emphasised second sentence", () => {
    render(<LaunchPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Your degree is the foundation. Build the bridge.");
    expect(within(h1s[0]).getByText("Build the bridge.").tagName).toBe("STRONG");
    expect(
      screen.getByText("Bridge Week · University of Manchester · first 500 students, 100 pods, 6 weeks"),
    ).toBeInTheDocument();
  });

  it("hero CTAs point at the waitlist form and the ambassador section, which both exist", () => {
    render(<LaunchPage />);
    const join = screen.getAllByRole("link", { name: /join the waitlist/i });
    expect(join.length).toBeGreaterThan(0);
    join.forEach((a) => expect(a).toHaveAttribute("href", "#waitlist"));
    expect(screen.getByRole("link", { name: /become a trajectory ambassador/i })).toHaveAttribute("href", "#ambassadors");
    expect(document.getElementById("waitlist")).not.toBeNull();
    expect(document.getElementById("ambassadors")).not.toBeNull();
    expect(within(waitlistSection()).getByRole("textbox", { name: /email/i })).toBeInTheDocument();
  });

  it("renders the poster headlines as real text headings", () => {
    render(<LaunchPage />);
    expect(screen.getByRole("heading", { name: /Proof, not claims/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Don't pay for a course your degree already teaches/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Find your pod/ })).toBeInTheDocument();
    expect(screen.getAllByText("Scan to join · keystone landing")).toHaveLength(POSTERS.length);
    expect(document.querySelectorAll("#posters img")).toHaveLength(0);
  });

  it("shows the Bridge Week timeline as an ordered list of 5 steps ending in demo day", () => {
    render(<LaunchPage />);
    const section = document.getElementById("bridge-week") as HTMLElement;
    const items = within(within(section).getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(TIMELINE).toHaveLength(5);
    expect(section.querySelector("ol")).not.toBeNull();
    expect(items[0]).toHaveTextContent(/Week 0/);
    expect(items[0]).toHaveTextContent(/freshers' groups and the CS society/);
    expect(items[1]).toHaveTextContent(/Pods formed/);
    expect(items[4]).toHaveTextContent(/Demo day \+ passports/);
  });

  it("labels every success metric as a pilot goal, not a result", () => {
    render(<LaunchPage />);
    const goals = document.getElementById("goals") as HTMLElement;
    expect(within(goals).getByText(/goals for the 6-week pilot, not results/i)).toBeInTheDocument();
    expect(within(goals).getAllByText("Pilot goal")).toHaveLength(METRICS.length);
    for (const label of ["Readiness change", "Verified skills per student", "Pods with merged PRs", "Newcomer help response time"]) {
      expect(within(goals).getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the ambassador pitch and the 30-second voiceover script", () => {
    render(<LaunchPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: /Seniors: share your journey, earn .*Helper and a certificate/ }),
    ).toBeInTheDocument();
    const quote = document.querySelector("#film blockquote");
    expect(quote).toHaveTextContent(VOICEOVER_SCRIPT);
  });

  it("puts the h1 and hero calls to action inside <main>, with the banner outside it", () => {
    render(<LaunchPage />);
    const main = screen.getByRole("main");
    expect(main).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(within(main).getByRole("link", { name: /become a trajectory ambassador/i })).toBeInTheDocument();
    expect(within(main).getAllByRole("link", { name: /join the waitlist/i }).length).toBeGreaterThan(0);
    const banner = screen.getByRole("banner");
    expect(main).not.toContainElement(banner);
    expect(within(banner).getByRole("navigation", { name: "Launch page sections" })).toBeInTheDocument();
  });

  it("only puts <li> elements directly inside the timeline list", () => {
    render(<LaunchPage />);
    const ol = document.querySelector("#bridge-week ol") as HTMLOListElement;
    expect(Array.from(ol.children).map((c) => c.tagName)).toEqual(TIMELINE.map(() => "LI"));
  });

  it("keeps heading levels in order (no skipped levels)", () => {
    render(<LaunchPage />);
    const levels = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });
});

describe("WaitlistForm", () => {
  beforeEach(() => {
    joinWaitlist.mockReset();
  });
  afterEach(cleanup);

  it("shows the success message after a valid submit", async () => {
    joinWaitlist.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await user.type(screen.getByRole("textbox", { name: /email/i }), "Aisha@Student.Manchester.ac.uk");
    await user.click(screen.getByRole("checkbox", { name: CONSENT_TEXT }));
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(await screen.findByText("You're on the list")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/aisha@student\.manchester\.ac\.uk/);
    expect(joinWaitlist).toHaveBeenCalledWith("Aisha@Student.Manchester.ac.uk", true, "student");
  });

  it("tabs from the email field to the consent box before the submit button", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await user.tab();
    expect(screen.getByRole("textbox", { name: /email/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: CONSENT_TEXT })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /join the waitlist/i })).toHaveFocus();
  });

  it("moves focus to the confirmation on success, and back to the email field for another sign-up", async () => {
    joinWaitlist.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<WaitlistForm />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    await user.type(screen.getByRole("textbox", { name: /email/i }), "sam@uni.ac.uk");
    await user.click(screen.getByRole("checkbox"));
    await user.keyboard("{Enter}");
    const heading = await screen.findByText("You're on the list");
    // Same live region as before submit, now filled, so it gets announced.
    expect(screen.getByRole("status")).toBe(status);
    expect(heading).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);

    await user.click(screen.getByRole("button", { name: "Add another email" }));
    const email = screen.getByRole("textbox", { name: /email/i });
    expect(email).toHaveValue("");
    expect(email).toHaveFocus();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("shows inline errors and does not call the server for a bad email or missing consent", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm />);
    const email = screen.getByRole("textbox", { name: /email/i });
    await user.type(email, "not-an-email");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/tick the box/i)).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveFocus();
    expect(joinWaitlist).not.toHaveBeenCalled();
  });

  it("shows the server's error next to the right field", async () => {
    joinWaitlist.mockResolvedValue({ ok: false, field: "email", error: "Please enter a valid email address." });
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await user.type(screen.getByRole("textbox", { name: /email/i }), "a@b.co");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(screen.queryByText("You're on the list")).not.toBeInTheDocument();
  });

  it("shows a kind retry message when the server action throws", async () => {
    joinWaitlist.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await user.type(screen.getByRole("textbox", { name: /email/i }), "sam@uni.ac.uk");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(await screen.findByText(/couldn't reach Keystone/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join the waitlist/i })).toBeEnabled();
  });

  it("signs ambassadors up with the ambassador role", async () => {
    joinWaitlist.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<WaitlistForm role="ambassador" submitLabel="Sign me up" />);
    await user.type(screen.getByRole("textbox", { name: /email/i }), "senior@uni.ac.uk");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Sign me up" }));
    expect(await screen.findByText("You're on the list")).toBeInTheDocument();
    expect(joinWaitlist).toHaveBeenCalledWith("senior@uni.ac.uk", true, "ambassador");
  });
});
