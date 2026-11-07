// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentEvent } from "@/lib/types";

const h = vi.hoisted(() => ({
  apiPost: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  activity: { runId: null as string | null, status: "idle", events: [] as AgentEvent[], open: false, live: false, start: vi.fn(), setOpen: vi.fn() },
}));
vi.mock("@/lib/fetcher", () => ({ apiPost: h.apiPost, apiGet: vi.fn(), apiPatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), h.toast) }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));
vi.mock("@/components/shell/ActivityPanel", () => ({
  useActivity: () => h.activity,
  HighlightNumbers: ({ text }: { text: string }) => <>{text}</>,
}));

import { OnboardingWizard } from "./OnboardingWizard";

const continueBtn = () => screen.getByRole("button", { name: /^Continue/ });

async function fillToLastStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Sam Okafor");
  await user.click(continueBtn());
  await user.click(screen.getByRole("radio", { name: /ML engineer/ }));
  await user.click(screen.getByRole("radio", { name: /Placement year 2027\/28/ }));
  await user.click(continueBtn());
  fireEvent.change(screen.getByLabelText("Theory or practice?"), { target: { value: "70" } });
  await user.click(continueBtn());
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(h.activity, { runId: null, status: "idle", events: [] });
  document.cookie = "ks_uid=; max-age=0; path=/";
});
afterEach(cleanup);

describe("OnboardingWizard", () => {
  it("step 1: Continue is disabled until you add a name, and the UoM programme URL is prefilled", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    expect(screen.getByRole("heading", { level: 1, name: "Build your bridge" })).toBeInTheDocument();
    expect(screen.getByLabelText("Programme page URL")).toHaveValue("https://www.manchester.ac.uk/study/undergraduate/courses/2026/00560/bsc-computer-science/");
    expect(continueBtn()).toBeDisabled();
    expect(screen.getByText(/Add your name/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your name"), "Sam");
    expect(continueBtn()).toBeEnabled();
    expect(screen.getByTestId("step-count")).toHaveTextContent("Step 1 of 4");
  });

  it("shows an inline error after you leave a field invalid, and Enter moves to the next step", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    const url = screen.getByLabelText("Programme page URL");
    await user.clear(url);
    await user.tab();
    expect(url).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(/starts with https:\/\//).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Use the UoM BSc Computer Science page" }));
    await user.type(screen.getByLabelText("Your name"), "Sam{Enter}");
    expect(screen.getByRole("radio", { name: /ML engineer/ })).toBeInTheDocument();
    expect(screen.getByTestId("step-count")).toHaveTextContent("Step 2 of 4");
  });

  it("step 2 needs a role and a timeline; the hours slider reads out loud", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await user.type(screen.getByLabelText("Your name"), "Sam");
    await user.click(continueBtn());
    expect(continueBtn()).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Data analyst/ }));
    expect(continueBtn()).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Graduate job 2029/ }));
    expect(continueBtn()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Time you can give it"), { target: { value: "8" } });
    expect(screen.getByLabelText("Time you can give it")).toHaveAttribute("aria-valuetext", "8 hours a week");
  });

  it("step 3: the theory slider at 70 says Mostly building (70%) and you need at least one format", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await user.type(screen.getByLabelText("Your name"), "Sam");
    await user.click(continueBtn());
    await user.click(screen.getByRole("radio", { name: /ML engineer/ }));
    await user.click(screen.getByRole("radio", { name: /Summer internship 2027/ }));
    await user.click(continueBtn());
    fireEvent.change(screen.getByLabelText("Theory or practice?"), { target: { value: "70" } });
    expect(screen.getByText(/Mostly building \(70%\)/)).toBeInTheDocument();
    const projects = screen.getByRole("button", { name: "Projects" });
    expect(projects).toHaveAttribute("aria-pressed", "true");
    await user.click(projects);
    expect(continueBtn()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Video" }));
    expect(continueBtn()).toBeEnabled();
  });

  it("step 4: badges are explained as opt-in and never used for matching; GitHub shows an avatar preview", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await fillToLastStep(user);
    expect(screen.getByText(/only used to send help your way\. They are never used to match pods/)).toBeInTheDocument();
    const seedling = screen.getByRole("button", { name: /New to UoM/ });
    await user.click(seedling);
    expect(seedling).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("GitHub username (optional)"), "octocat");
    expect(screen.getByRole("img", { name: "GitHub avatar for octocat" }).getAttribute("src")).toContain("github.com/octocat.png");
  });

  it("finish creates the profile, then starts the run, opens the panel, and goes to /map when the agents are done", async () => {
    h.apiPost.mockImplementation(async (url: string, body: { name?: string }) =>
      url === "/api/profile" ? { ...body, id: "sam" } : { runId: "run_sam" });
    const user = userEvent.setup();
    const { rerender } = render(<OnboardingWizard />);
    await fillToLastStep(user);
    await user.click(screen.getByRole("button", { name: /New to UoM/ }));
    await user.click(screen.getByRole("button", { name: /Build my bridge/ }));

    expect(h.apiPost.mock.calls.map((c) => c[0])).toEqual(["/api/profile", "/api/onboard/run"]);
    expect(h.apiPost.mock.calls[0][1]).toMatchObject({ name: "Sam Okafor", programmeId: "uom-bsc-cs", badges: ["new-to-uni"], dna: { targetRoles: ["ml-engineer"], theoryPractice: 70 } });
    expect(h.apiPost.mock.calls[0][1]).not.toHaveProperty("id");
    expect(h.apiPost.mock.calls[1][1]).toMatchObject({ userId: "sam" });
    expect(h.activity.start).toHaveBeenCalledWith("run_sam");
    expect(document.cookie).toContain("ks_uid=sam");
    expect(screen.getByRole("heading", { name: "Building Sam's bridge" })).toBeInTheDocument();
    expect(h.push).not.toHaveBeenCalled();

    Object.assign(h.activity, { runId: "run_sam", status: "done", events: [{ runId: "run_sam", agent: "orchestrator", status: "done", message: "Bridge ready · 38% → 84%", ts: "2026-11-07T14:00:00Z" }] });
    rerender(<OnboardingWizard />);
    expect(h.push).toHaveBeenCalledWith("/map");
  });

  it("shows an error toast and Retry / Use demo data when starting fails", async () => {
    h.apiPost.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await fillToLastStep(user);
    await user.click(screen.getByRole("button", { name: /Build my bridge/ }));
    expect(h.toast.error).toHaveBeenCalledWith("Couldn't start. Try again or use the demo.");
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't start your agents");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(h.activity.start).not.toHaveBeenCalled();
  });

  it("Use Aisha's demo profile skips the form and starts her run", async () => {
    h.apiPost.mockResolvedValue({ runId: "run_aisha" });
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await user.click(screen.getByRole("button", { name: "Use Aisha's demo profile" }));
    expect(h.apiPost).toHaveBeenCalledWith("/api/onboard/run", { userId: "aisha" });
    expect(h.activity.start).toHaveBeenCalledWith("run_aisha");
    expect(document.cookie).toContain("ks_uid=aisha");
    expect(screen.getByRole("heading", { name: "Building Aisha's bridge" })).toBeInTheDocument();
  });

  it("lets you jump back to a finished step from the progress bar", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await user.type(screen.getByLabelText("Your name"), "Sam");
    await user.click(continueBtn());
    await user.click(screen.getByRole("button", { name: "Back to step 1: You" }));
    expect(screen.getByLabelText("Your name")).toHaveValue("Sam");
  });
});
