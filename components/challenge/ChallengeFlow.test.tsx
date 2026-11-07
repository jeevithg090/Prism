// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEMO_CHALLENGE, DEMO_MENU } from "./demo";
import type { GradeResult } from "./model";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

import { ChallengeFlow } from "./ChallengeFlow";

const failed: GradeResult = {
  challengeId: DEMO_CHALLENGE.id, skillId: "docker", skillName: "Docker", passed: false, rubricMet: 1, checksPassed: 3, usedSample: false,
  feedback: "Not yet, and that's what a first attempt is for.", feedbackSource: "rules", runId: "run_1",
  rubric: [
    { id: "deps-layer", title: "Dependencies install in their own cached layer", met: false, hint: "Which layers does Docker rebuild when you change one line?" },
    { id: "slim-base", title: "Starts from a smaller base image", met: true },
    { id: "non-root", title: "Runs as a non-root user", met: false, hint: "Which user would they be?" },
    { id: "pip-cache", title: "Leaves no pip cache behind", met: false, hint: "Does the image still need the download?" },
  ],
  checks: [
    { id: "serves-8000", title: "uvicorn listens on 0.0.0.0:8000", met: true },
    { id: "exec-form", title: "CMD uses the exec form", met: true },
    { id: "workdir", title: "Sets a working directory", met: true },
  ],
};
const passed: GradeResult = {
  ...failed, passed: true, rubricMet: 4, evidenceId: "ev_mc_aisha_docker", feedback: "You've tried Docker for real.",
  rubric: failed.rubric.map((r) => ({ id: r.id, title: r.title, met: true })),
};

let grades: GradeResult[] = [];
let menuCalls = 0;
const calls: { url: string; body?: unknown }[] = [];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(status < 400 ? { ok: true, data } : data), { status });

beforeEach(() => {
  calls.length = 0;
  menuCalls = 0;
  grades = [failed, passed];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    // After a pass the server moves the focus to the next gap; the page must stay on the skill you just passed.
    if (url.startsWith("/api/challenges?")) return json(menuCalls++ === 0 ? DEMO_MENU : { ...DEMO_MENU, focusSkillId: "pytorch" });
    if (url === "/api/challenges/generate") {
      return json(body?.skillId === "pytorch"
        ? { ...DEMO_CHALLENGE, id: "ch_pytorch_01", skillId: "pytorch", skillName: "PyTorch", title: "Caption 64 images in one forward pass" }
        : { ...DEMO_CHALLENGE, runId: "run_gen" });
    }
    if (url === "/api/challenges/grade") return json(grades.shift());
    if (url === "/api/challenges/sample") return json({ sampleAnswer: "FROM python:3.12-slim\n" });
    if (url.startsWith("/api/proof-ladder/")) {
      return json({ userId: "aisha", generatedAt: "", skills: [{ skillId: "docker", skillName: "Docker", level: 0, rungs: [
        { rung: 1, label: "Tried it", status: "open" }, { rung: 2, label: "Built it", status: "open" }, { rung: 3, label: "Can teach it", status: "open" },
      ] }] });
    }
    return json({ ok: false, error: { code: "not_found", message: "nope" } }, 404);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const renderFlow = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ChallengeFlow /></QueryClientProvider>,
);

describe("ChallengeFlow", () => {
  it("defaults to the focus skill, shows the task, a labelled editor and the timer", async () => {
    renderFlow();
    expect(await screen.findByRole("heading", { name: DEMO_CHALLENGE.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Docker/, pressed: true })).toBeInTheDocument();
    const editor = screen.getByLabelText("Dockerfile");
    expect(editor).toHaveValue(DEMO_CHALLENGE.starter);
    expect(screen.getByRole("timer")).toHaveTextContent("20:00");
    expect(calls.find((c) => c.url === "/api/challenges/generate")?.body).toEqual({ userId: "aisha", skillId: "docker" });
  });

  it("Tab indents inside the editor instead of leaving it", async () => {
    renderFlow();
    const editor = await screen.findByLabelText("Dockerfile");
    await userEvent.clear(editor);
    await userEvent.type(editor, "RUN");
    await userEvent.keyboard("{Tab}");
    expect(editor).toHaveValue("RUN  ");
    expect(editor).toHaveFocus();
  });

  it("Check my work shows ✓/○ with Socratic hints; then a pass shows Rung 1 · Tried it and the pod link", async () => {
    renderFlow();
    await screen.findByRole("heading", { name: DEMO_CHALLENGE.title });
    await userEvent.click(screen.getByRole("button", { name: "Check my work" }));
    const results = screen.getByRole("region", { name: "Your results" });
    expect(await within(results).findByText("Rubric ·", { exact: false })).toHaveTextContent("1 of 4 met");
    expect(within(results).getByText("Which layers does Docker rebuild when you change one line?")).toBeInTheDocument();
    expect(within(results).getAllByText("Not yet:", { exact: false })).toHaveLength(3);
    expect(calls.find((c) => c.url === "/api/challenges/grade")?.body).toMatchObject({ userId: "aisha", challengeId: DEMO_CHALLENGE.id, submission: DEMO_CHALLENGE.starter });

    await userEvent.click(screen.getByRole("button", { name: /Use sample answer/ }));
    expect(await screen.findByDisplayValue(/python:3\.12-slim/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check my work" }));
    expect(await screen.findByRole("heading", { name: "You've tried Docker for real" })).toBeInTheDocument();
    expect(screen.getByTestId("ladder-step")).toHaveTextContent("Rung 1 · Tried it");
    expect(screen.getByRole("link", { name: /Next: build it in your pod/ })).toHaveAttribute("href", "/pods");
    expect(screen.getByRole("link", { name: "See your passport" })).toHaveAttribute("href", "/profile/aisha");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("heading", { name: DEMO_CHALLENGE.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You've tried Docker for real" })).toBeInTheDocument();
  });

  it("shows Retry and Use demo data when the menu fails, and the demo challenge after choosing it", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async () => json({ ok: false, error: { code: "internal", message: "down" } }, 500));
    renderFlow();
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(await screen.findByRole("heading", { name: DEMO_CHALLENGE.title })).toBeInTheDocument();
    expect(screen.getAllByText("Demo data").length).toBeGreaterThan(0);
  });
});
