// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import fixture from "@/data/fixtures/interview.feedback.aisha.json";

const h = vi.hoisted(() => {
  type Opts = {
    onMessage?: (m: { message: string; source: "ai" | "user"; role: "agent" | "user" }) => void;
    onError?: (message: string) => void;
    onDisconnect?: (d: { reason: string }) => void;
  };
  return {
    conv: {
      status: "connected" as string,
      isSpeaking: true,
      isMuted: false,
      startSession: vi.fn(),
      endSession: vi.fn(),
      setMuted: vi.fn(),
    },
    opts: { current: {} as Opts },
  };
});

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children?: ReactNode }) => children,
  useConversation: (opts: typeof h.opts.current) => {
    h.opts.current = opts;
    return h.conv;
  },
}));
vi.mock("@/lib/fetcher", () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn() }));
vi.mock("@/lib/voice/textInterview", () => ({ nextQuestion: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { apiGet, apiPost } from "@/lib/fetcher";
import { nextQuestion } from "@/lib/voice/textInterview";
import { toast } from "sonner";
import { InterviewClient, formatClock, questionNumber, toTranscript } from "./InterviewClient";

const VARS = { name: "Aisha", year: "1", role: "ML engineer", top_skills: "Python, Docker", project_title: "VisionAid" };
const getUserMedia = vi.fn();

function voiceConfig() {
  vi.mocked(apiGet).mockResolvedValue({ agentId: "agent_123", signedUrl: "wss://signed.example", dynamicVariables: VARS });
}
function textConfig() {
  vi.mocked(apiGet).mockResolvedValue({ agentId: "text-mode", dynamicVariables: VARS });
}
async function startButton() {
  const btn = await screen.findByRole("button", { name: "Start interview" });
  await waitFor(() => expect(btn).toBeEnabled());
  return btn;
}
async function textModeButton() {
  const btn = await screen.findByRole("button", { name: "Use text mode" });
  await waitFor(() => expect(btn).toBeEnabled());
  return btn;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.conv.setMuted.mockReset();
  h.conv.status = "connected";
  h.conv.isSpeaking = true;
  h.conv.isMuted = false;
  document.cookie = "ks_uid=aisha";
  Object.defineProperty(globalThis.navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  vi.mocked(apiPost).mockResolvedValue(fixture);
});
afterEach(cleanup);

describe("InterviewClient", () => {
  it("shows the PreCallCard with role, privacy and both start options", async () => {
    voiceConfig();
    render(<InterviewClient />);
    expect(screen.getByRole("heading", { name: "Practise your interview" })).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toHaveValue("ml-engineer");
    expect(screen.getByText(/we don't store audio, only the transcript/i)).toBeInTheDocument();
    await startButton();
    expect(screen.getByRole("button", { name: "Use text mode" })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/api/interview/config?userId=aisha&roleId=ml-engineer");
  });

  it("voice: connected + speaking puts the orb in the agent state; End ends the session and posts feedback", async () => {
    voiceConfig();
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());

    await waitFor(() =>
      expect(h.conv.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ signedUrl: "wss://signed.example", connectionType: "websocket", dynamicVariables: VARS }),
      ),
    );
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    const orb = await screen.findByTestId("interview-orb");
    expect(orb).toHaveAttribute("data-state", "agent");
    expect(orb).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Your interviewer is speaking.", { selector: ".sr-only" })).toBeInTheDocument();

    act(() => {
      h.opts.current.onMessage?.({ message: "Hi Aisha, tell me about yourself.", source: "ai", role: "agent" });
      h.opts.current.onMessage?.({ message: "I build ML things.", source: "user", role: "user" });
    });
    const log = screen.getByRole("log", { name: "Live captions" });
    expect(within(log).getByText("Interviewer")).toBeInTheDocument();
    expect(within(log).getByText("I build ML things.")).toBeInTheDocument();
    expect(screen.getByText("Question 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /end interview/i }));
    expect(h.conv.endSession).toHaveBeenCalled();
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/api/interview/feedback", {
        userId: "aisha",
        roleId: "ml-engineer",
        transcript: "ai: Hi Aisha, tell me about yourself.\nuser: I build ML things.",
        durationSec: expect.any(Number),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Nice work, Aisha!" })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("🎤 Interview-ready unlocked!");
    await waitFor(() => expect(screen.getByRole("region", { name: "Your feedback" })).toHaveFocus());
    expect(screen.getByText("Your feedback is ready.", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("voice: fetches a fresh signed URL on every Start (they expire)", async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ agentId: "agent_123", signedUrl: "wss://old.example", dynamicVariables: VARS })
      .mockResolvedValue({ agentId: "agent_123", signedUrl: "wss://fresh.example", dynamicVariables: VARS });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());
    await waitFor(() =>
      expect(h.conv.startSession).toHaveBeenCalledWith(expect.objectContaining({ signedUrl: "wss://fresh.example" })),
    );
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("voice: falls back to text mode when the fresh config has no signed URL", async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ agentId: "agent_123", signedUrl: "wss://old.example", dynamicVariables: VARS })
      .mockResolvedValue({ agentId: "text-mode", dynamicVariables: VARS });
    vi.mocked(nextQuestion).mockResolvedValue({ text: "Tell me about yourself.", done: false });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());
    expect(await screen.findByLabelText("Your answer")).toBeInTheDocument();
    expect(h.conv.startSession).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
  });

  it("voice: Space toggles mute when no control has focus", async () => {
    voiceConfig();
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());
    await screen.findByTestId("interview-orb");
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard(" ");
    expect(h.conv.setMuted).toHaveBeenCalledWith(true);
  });

  it("mic denied shows the message and a Use text mode button that starts text mode", async () => {
    voiceConfig();
    getUserMedia.mockRejectedValue(new Error("NotAllowedError"));
    vi.mocked(nextQuestion).mockResolvedValue({ text: "Tell me about yourself.", done: false });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't access your microphone.");
    expect(h.conv.startSession).not.toHaveBeenCalled();
    await user.click(within(alert).getByRole("button", { name: "Use text mode" }));
    await waitFor(() => expect(nextQuestion).toHaveBeenCalledWith([], VARS));
    expect(await screen.findByLabelText("Your answer")).toBeInTheDocument();
  });

  it("mic check shows 'Sounds good' when the mic works, and the denied state when it doesn't", async () => {
    voiceConfig();
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(screen.getByRole("button", { name: "Test microphone" }));
    expect(await screen.findByText("Sounds good ✓")).toBeInTheDocument();

    getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    await user.click(screen.getByRole("button", { name: "Test microphone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't access your microphone.");
  });

  it("voice: shows the connecting state until the agent connects", async () => {
    voiceConfig();
    h.conv.status = "connecting";
    h.conv.isSpeaking = false;
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());
    expect(await screen.findByTestId("interview-orb")).toHaveAttribute("data-state", "connecting");
    expect(screen.getAllByText("Connecting to your interviewer…").length).toBeGreaterThan(0);
  });

  it("voice: Mute is disabled and Space does nothing while connecting (the SDK would throw)", async () => {
    voiceConfig();
    h.conv.status = "connecting";
    h.conv.isSpeaking = false;
    h.conv.setMuted.mockImplementation(() => {
      throw new Error("No active conversation. Call startSession() first.");
    });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());
    await screen.findByTestId("interview-orb");
    expect(screen.getByRole("button", { name: "Mute" })).toBeDisabled();
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard(" ");
    expect(h.conv.setMuted).not.toHaveBeenCalled();
  });

  it("disables both start options while the config loads", async () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}));
    render(<InterviewClient />);
    expect(await screen.findByRole("button", { name: "Start interview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use text mode" })).toBeDisabled();
  });

  it("text mode: answering in the textarea asks nextQuestion with the history", async () => {
    textConfig();
    vi.mocked(nextQuestion)
      .mockResolvedValueOnce({ text: "Tell me about yourself.", done: false })
      .mockResolvedValueOnce({ text: "What did you build in VisionAid?", done: false });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton()); // no signedUrl -> text mode

    expect(await screen.findByText("Tell me about yourself.")).toBeInTheDocument();
    const box = screen.getByLabelText("Your answer");
    await user.type(box, "I love building things");
    await user.click(screen.getByRole("button", { name: /send answer/i }));

    await waitFor(() =>
      expect(nextQuestion).toHaveBeenLastCalledWith(
        [
          { role: "ai", text: "Tell me about yourself." },
          { role: "user", text: "I love building things" },
        ],
        VARS,
      ),
    );
    expect(await screen.findByText("What did you build in VisionAid?")).toBeInTheDocument();
    expect(screen.getByText("Question 2")).toBeInTheDocument();
    expect(box).toHaveValue("");
    expect(h.conv.startSession).not.toHaveBeenCalled();
  });

  it("text mode: done:true scores the interview automatically", async () => {
    textConfig();
    vi.mocked(nextQuestion)
      .mockResolvedValueOnce({ text: "Tell me about yourself.", done: false })
      .mockResolvedValueOnce({ text: "That's the end of your practice interview.", done: true });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await textModeButton());
    await screen.findByText("Tell me about yourself.");
    await user.type(screen.getByLabelText("Your answer"), "Hi, I'm Aisha{Enter}");

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiPost).mock.calls[0][1]).toMatchObject({
      transcript: "ai: Tell me about yourself.\nuser: Hi, I'm Aisha\nai: That's the end of your practice interview.",
    });
    expect(await screen.findByRole("heading", { name: "Nice work, Aisha!" })).toBeInTheDocument();
  });

  it("voice drop switches to text mode with a toast", async () => {
    voiceConfig();
    vi.mocked(nextQuestion).mockResolvedValue({ text: "Tell me about yourself.", done: false });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await startButton());
    await screen.findByTestId("interview-orb");

    act(() => h.opts.current.onError?.("socket closed"));
    expect(toast.error).toHaveBeenCalledWith("Voice connection dropped. Switching to text mode.");
    expect(await screen.findByLabelText("Your answer")).toBeInTheDocument();
    await waitFor(() => expect(nextQuestion).toHaveBeenCalledWith([], VARS));
  });

  it("ending before any answer returns to the PreCallCard without scoring", async () => {
    textConfig();
    vi.mocked(nextQuestion).mockResolvedValue({ text: "Tell me about yourself.", done: false });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await textModeButton());
    await screen.findByText("Tell me about yourself.");
    await user.click(screen.getByRole("button", { name: /end interview/i }));
    expect(apiPost).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Start interview" })).toBeInTheDocument();
  });

  it("shows an error with retry and demo feedback when scoring fails", async () => {
    textConfig();
    vi.mocked(apiPost).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(nextQuestion).mockResolvedValue({ text: "Tell me about yourself.", done: false });
    const user = userEvent.setup();
    render(<InterviewClient />);
    await user.click(await textModeButton());
    await screen.findByText("Tell me about yourself.");
    await user.type(screen.getByLabelText("Your answer"), "An answer");
    await user.click(screen.getByRole("button", { name: /send answer/i }));
    await waitFor(() => expect(nextQuestion).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: /end interview/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't score your answers");
    await user.click(within(alert).getByRole("button", { name: /use demo data/i }));
    expect(await screen.findByRole("heading", { name: "Nice work, Aisha!" })).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("formats the countdown and transcript", () => {
    expect(formatClock(360)).toBe("06:00");
    expect(formatClock(252)).toBe("04:12");
    expect(formatClock(-3)).toBe("00:00");
    expect(toTranscript([{ role: "ai", text: "Hi" }, { role: "user", text: "Hello" }])).toBe("ai: Hi\nuser: Hello");
  });

  it("counts questions: every AI line in text mode, only AI turns after an answer in voice mode", () => {
    const lines = [
      { role: "ai" as const, text: "Tell me about yourself." },
      { role: "ai" as const, text: "Are you still there?" },
      { role: "user" as const, text: "Yes, sorry." },
      { role: "ai" as const, text: "Tell me about a skill." },
    ];
    expect(questionNumber([], true)).toBe(1);
    expect(questionNumber(lines, false)).toBe(3);
    expect(questionNumber(lines, true)).toBe(2);
    const closing = [...lines, { role: "user" as const, text: "Done" }, { role: "ai" as const, text: "That's the end of your practice interview." }];
    expect(questionNumber(closing, true)).toBe(5);
  });
});
