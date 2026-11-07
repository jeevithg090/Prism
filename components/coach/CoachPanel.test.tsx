// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CoachRes } from "@/lib/schemas/coach";

const { apiPost, start, toast } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  start: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/fetcher", () => ({ apiPost, apiGet: vi.fn(), apiPatch: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/shell/ActivityPanel", () => ({ useActivity: () => ({ start, events: [], open: false, setOpen: vi.fn(), runId: null }) }));
vi.mock("@/components/community/useViewerId", () => ({ useViewerId: () => "aisha" }));

import { CoachPanel, plannerLabel } from "./CoachPanel";

const weekRes: CoachRes = {
  runId: "run_week",
  planner: "rules",
  steps: [
    { kind: "context", text: "Read your context: Aisha · readiness 38% → 84%", args: { brief: "Student: Aisha" } },
    { kind: "plan", text: "Plan: 1) Read this week's roadmap plan", args: { planner: "rules", reason: "demo" } },
    { kind: "tool_call", text: "Read this week's roadmap plan", tool: "get_week_plan", args: {}, status: "ok", durationMs: 12 },
    { kind: "observation", text: "Week 1: focus Docker.", tool: "get_week_plan", status: "ok" },
    { kind: "reflection", text: "Grounding check: every number (1, 41%) comes from your data or a tool result.", status: "ok" },
    { kind: "answer", text: "Here's your week, Aisha.\nReceipt · Docker: 41% of ML engineer ads; no module covers it." },
    { kind: "memory", text: "Noted: you prefer project-based learning. You can delete this anytime.", args: { id: "aisha:1", kind: "preference" }, status: "ok" },
  ],
  answer: "Here's your week, Aisha.\nReceipt · Docker: 41% of ML engineer ads; no module covers it.",
  suggestions: ["Why Docker?", "Find me a pod"],
};

const pending = { tool: "start_pod_project", title: "Start your pod project", args: { podId: "pod_1" }, effect: "external" as const, reason: "This creates a public GitHub repo in keystone-demo and opens 7 issues." };
const pendingRes: CoachRes = {
  runId: "run_pending",
  planner: "rules",
  steps: [
    { kind: "context", text: "Read your context" },
    { kind: "plan", text: "Plan: 1) Ask the Architect", args: { planner: "rules", reason: "demo" } },
    { kind: "approval_request", text: "Start your pod project: …", tool: "start_pod_project", args: { podId: "pod_1" }, status: "needs_approval" },
    { kind: "reflection", text: "Grounding check ok", status: "ok" },
    { kind: "answer", text: "Before I go ahead: This creates a public GitHub repo. You decide." },
  ],
  answer: "Before I go ahead: This creates a public GitHub repo. You decide.",
  pendingApproval: pending,
};
const doneRes: CoachRes = { runId: "run_done", planner: "rules", steps: [{ kind: "tool_call", text: "Start your pod project", tool: "start_pod_project", status: "ok" }, { kind: "answer", text: "Your project is ready." }], answer: "Your project is ready." };

afterEach(cleanup);
beforeEach(() => {
  apiPost.mockReset();
  start.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("CoachPanel", () => {
  it("shows starter prompts, sends one, and renders the step timeline, receipt, memory and suggestions", async () => {
    apiPost.mockResolvedValueOnce(weekRes);
    const user = userEvent.setup();
    render(<CoachPanel />);
    for (const p of ["What should I do this week?", "Why Docker?", "Find me a pod", "Who's been where I want to go?"]) {
      expect(screen.getByRole("button", { name: p })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "What should I do this week?" }));
    expect(apiPost).toHaveBeenCalledWith("/api/coach", expect.objectContaining({ userId: "aisha", message: "What should I do this week?", history: [], runId: expect.stringMatching(/^run_[a-z0-9]{8}$/) }));

    const article = await screen.findByRole("article", { name: "Coach answer" });
    const steps = within(article).getByRole("list", { name: "What the Coach did" });
    expect(within(steps).getByText("Read your context: Aisha · readiness 38% → 84%")).toBeInTheDocument();
    expect(within(steps).getByText("Read this week's roadmap plan")).toBeInTheDocument();
    expect(within(steps).getByText("Read")).toBeInTheDocument(); // effect pill
    expect(within(steps).getByText("Week 1: focus Docker.")).toBeInTheDocument();
    expect(within(steps).getByText(/Grounding check: every number/)).toBeInTheDocument();
    expect(within(article).getByText("Planned by Keystone rules (demo mode)")).toBeInTheDocument();
    expect(within(article).getByText(/Docker: 41% of ML engineer ads; no module covers it\./)).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "Why Docker?" })).toBeInTheDocument();
    expect(screen.getByText(/^Coach: Here's your week/)).toHaveAttribute("aria-live", "polite");
    expect(screen.getByLabelText("Ask the Coach")).toHaveFocus();
  });

  it("Forget deletes the memory note", async () => {
    apiPost.mockResolvedValueOnce(weekRes);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { deleted: true } })));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.type(screen.getByLabelText("Ask the Coach"), "What should I do this week?{Enter}");
    await user.click(await screen.findByRole("button", { name: "Forget" }));
    expect(fetchSpy).toHaveBeenCalledWith("/api/coach/memory?userId=aisha&id=aisha%3A1", { method: "DELETE" });
    expect(await screen.findByText("Forgotten.")).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("Approve calls the API with the exact pending approval and the original message", async () => {
    apiPost.mockResolvedValueOnce(pendingRes).mockResolvedValueOnce(doneRes);
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.type(screen.getByLabelText("Ask the Coach"), "Start our project{Enter}");
    const card = await screen.findByRole("group", { name: "Start your pod project" });
    expect(within(card).getByText("You decide")).toBeInTheDocument();
    expect(within(card).getByText(/opens 7 issues/)).toBeInTheDocument();
    expect(within(card).getByText("External")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Approve" }));
    expect(apiPost).toHaveBeenLastCalledWith("/api/coach", expect.objectContaining({
      userId: "aisha", message: "Start our project",
      approval: { tool: "start_pod_project", args: { podId: "pod_1" }, decision: "approve" },
      history: [{ role: "user", content: "Start our project" }, { role: "assistant", content: pendingRes.answer }],
    }));
    expect(await screen.findByText("Your project is ready.")).toBeInTheDocument();
    expect(screen.getByText("Approve: Start your pod project")).toBeInTheDocument();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("Not now sends a deny decision", async () => {
    apiPost.mockResolvedValueOnce(pendingRes).mockResolvedValueOnce({ ...doneRes, answer: "No problem, I won't do that." });
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.type(screen.getByLabelText("Ask the Coach"), "Start our project{Enter}");
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(apiPost).toHaveBeenLastCalledWith("/api/coach", expect.objectContaining({ approval: { tool: "start_pod_project", args: { podId: "pod_1" }, decision: "deny" } }));
    expect(await screen.findByText("No problem, I won't do that.")).toBeInTheDocument();
  });

  it("shows an error state with Retry when the API fails", async () => {
    apiPost.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(weekRes);
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.type(screen.getByLabelText("Ask the Coach"), "What should I do this week?{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The Coach couldn't answer");
    expect(toast.error).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("article", { name: "Coach answer" })).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledTimes(2);
  });

  it("streams to the Activity panel on the full page", async () => {
    apiPost.mockResolvedValueOnce(weekRes);
    const user = userEvent.setup();
    render(<CoachPanel streamToActivity />);
    await user.click(screen.getByRole("button", { name: "Find me a pod" }));
    expect(start).toHaveBeenCalledWith(apiPost.mock.calls[0][1].runId);
  });

  it("labels the planner honestly", () => {
    expect(plannerLabel({ planner: "llm", steps: [] })).toBe("Planned by the AI model");
    expect(plannerLabel({ planner: "rules", steps: [{ kind: "plan", text: "", args: { reason: "demo" } }] })).toBe("Planned by Keystone rules (demo mode)");
    expect(plannerLabel({ planner: "rules", steps: [{ kind: "plan", text: "", args: { reason: "fallback" } }] })).toBe("Planned by Keystone rules (AI model unavailable)");
  });
});
