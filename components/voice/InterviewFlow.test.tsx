// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEMO_VARS } from "./InterviewFlow";

const h = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), speak: vi.fn(async (text: string) => void text), startConversation: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({ apiGet: h.apiGet, apiPost: h.apiPost }));
vi.mock("./speech", () => ({
  speak: h.speak, stopSpeaking: vi.fn(), canSpeak: () => true, speechRecognitionCtor: () => null, listen: () => null,
}));
vi.mock("./elevenlabsConversation", () => ({ startConversation: h.startConversation }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { InterviewFlow } from "./InterviewFlow";

const result = {
  userId: "aisha", roleId: "ml-engineer", scores: { content: 5, structure: 5, clarity: 5, confidence: 4 }, fillerWordsPerMin: 2.1,
  strengths: ["S1", "S2"], improvements: ["I1", "I2"], createdAt: "2026-11-07T15:00:00Z", id: "iv_1", durationSec: 150,
  skillId: "docker", skillName: "Docker", scoredBy: "rules",
  evidence: [{ id: "e1", skillId: "communication", label: "Communication", level: 2 }, { id: "e2", skillId: "docker", label: "Docker (explained)", level: 3 }],
};

function renderFlow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><InterviewFlow /></QueryClientProvider>);
}

beforeEach(() => {
  h.apiGet.mockReset().mockResolvedValue({ agentId: "practice", dynamicVariables: DEMO_VARS });
  h.apiPost.mockReset().mockResolvedValue(result);
  h.speak.mockClear();
  h.startConversation.mockReset();
});

afterEach(cleanup);

describe("InterviewFlow (Practice mode)", () => {
  it("pre-call names the pod issue, then asks 4 spoken questions and posts the transcript for feedback", async () => {
    const user = userEvent.setup();
    renderFlow();
    expect(await screen.findByText("Containerise the captioning API with Docker")).toBeInTheDocument();
    expect(screen.getByText(/We'll ask about your pod project/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Start mock interview/ }));

    for (let i = 0; i < 4; i++) {
      expect((await screen.findAllByText(`Question ${i + 1} of 4`)).length).toBeGreaterThan(0);
      await user.click(screen.getByRole("button", { name: /Use sample answer/ }));
      await user.click(screen.getByRole("button", { name: i === 3 ? /Finish and get feedback/ : /Next question/ }));
    }
    expect(h.speak).toHaveBeenCalledTimes(4);
    expect(h.speak.mock.calls[0][0]).toContain("Containerise the captioning API with Docker");

    await waitFor(() => expect(h.apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = h.apiPost.mock.calls[0];
    expect(url).toBe("/api/interview/feedback");
    expect(body).toMatchObject({ userId: "aisha", roleId: "ml-engineer", skillId: "docker" });
    expect(body.transcript.split("\n").filter((l: string) => l.startsWith("user: "))).toHaveLength(4);
    expect(body.durationSec).toBeGreaterThanOrEqual(60);

    expect(await screen.findByTestId("saved-proof")).toHaveTextContent("Communication · Docker (explained)");
    expect(screen.getAllByRole("meter")).toHaveLength(4);
  });

  it("lets you type an answer and End early, and shows Retry + demo data if scoring fails", async () => {
    h.apiPost.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole("button", { name: /Start mock interview/ }));
    await user.type(screen.getByLabelText("Your answer"), "I wrote the Dockerfile.");
    await user.click(screen.getByRole("button", { name: /Next question/ }));
    await user.click(screen.getByRole("button", { name: /End interview/ }));
    expect(await screen.findByText("We couldn't score your answers")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(await screen.findByTestId("filler-rate")).toHaveTextContent("6.2/min");
  });

  it("shows an error state with demo data when the config fails", async () => {
    h.apiGet.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    renderFlow();
    expect(await screen.findByText("We couldn't load your interview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(await screen.findByRole("button", { name: /Start mock interview/ })).toBeInTheDocument();
  });

  it("falls back to Practice mode when the microphone is denied in voice mode", async () => {
    h.apiGet.mockResolvedValue({ agentId: "agent_1", signedUrl: "wss://x", dynamicVariables: DEMO_VARS });
    h.startConversation.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole("button", { name: /Start mock interview/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't access your microphone");
    expect(screen.getByText(/Practice mode: your browser reads each question/)).toBeInTheDocument();
  });
});
