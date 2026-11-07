// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const el = vi.hoisted(() => ({
  startSession: vi.fn(),
  endSession: vi.fn(),
  sendContextualUpdate: vi.fn(),
  status: "disconnected" as "disconnected" | "connecting" | "connected" | "error",
  isSpeaking: false,
  hookOptions: undefined as undefined | { onMessage?: (m: { message: string; source: "user" | "ai" }) => void },
}));

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useConversation: (opts: typeof el.hookOptions) => {
    el.hookOptions = opts;
    return {
      startSession: el.startSession,
      endSession: el.endSession,
      sendContextualUpdate: el.sendContextualUpdate,
      status: el.status,
      isSpeaking: el.isSpeaking,
      isMuted: false,
      setMuted: vi.fn(),
    };
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { VoiceOnboardButton } from "./VoiceOnboardButton";

const envelope = (data: unknown, ok = true) =>
  new Response(JSON.stringify(ok ? { ok: true, data } : { ok: false, error: { code: "internal", message: "boom" } }), { status: ok ? 200 : 500 });

// A fresh Response per call: the component fetches the config on mount and again on every Talk.
function mockConfig(data: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => envelope(data, ok));
}

/** Each call answers with the next item; the last one repeats. */
function mockConfigSequence(items: { data: unknown; ok?: boolean }[]) {
  let i = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const it = items[Math.min(i++, items.length - 1)];
    return envelope(it.data, it.ok ?? true);
  });
}

function deferredMic() {
  let grant!: () => void;
  const getUserMedia = vi.fn(
    () =>
      new Promise((resolve) => {
        grant = () => resolve({ getTracks: () => [{ stop: vi.fn() }] });
      }),
  );
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return { getUserMedia, grant: () => grant() };
}

function mockMic(result: "granted" | "denied" = "granted") {
  const getUserMedia =
    result === "granted"
      ? vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
      : vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return getUserMedia;
}

type StartOpts = { signedUrl: string; connectionType: string; clientTools: { save_dna: (p: Record<string, unknown>) => Promise<string> } };
const lastStartOpts = () => el.startSession.mock.calls.at(-1)![0] as StartOpts;

const SIGNED = { agentId: "agent_onboard", signedUrl: "wss://example.test/convai?token=abc", dynamicVariables: { name: "Aisha" } };

beforeEach(() => {
  el.status = "disconnected";
  el.isSpeaking = false;
  el.hookOptions = undefined;
  document.cookie = "ks_uid=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  el.startSession.mockReset();
  el.endSession.mockReset();
  el.sendContextualUpdate.mockReset();
});

async function startTalking() {
  const user = userEvent.setup();
  const onComplete = vi.fn();
  render(<VoiceOnboardButton onComplete={onComplete} />);
  await user.click(await screen.findByRole("button", { name: /talk to the coach instead/i }));
  await waitFor(() => expect(el.startSession).toHaveBeenCalledTimes(1));
  return { user, onComplete };
}

describe("VoiceOnboardButton", () => {
  it("renders null when the config returns text-mode", async () => {
    const fetchSpy = mockConfig({ agentId: "text-mode", dynamicVariables: {} });
    const { container } = render(<VoiceOnboardButton onComplete={vi.fn()} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(String(fetchSpy.mock.calls[0][0])).toBe("/api/interview/config?userId=aisha&agent=onboard");
  });

  it("renders null when the config request fails", async () => {
    const fetchSpy = mockConfig(null, false);
    const { container } = render(<VoiceOnboardButton onComplete={vi.fn()} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the ks_uid cookie for the config request", async () => {
    document.cookie = "ks_uid=ben";
    const fetchSpy = mockConfig(SIGNED);
    render(<VoiceOnboardButton onComplete={vi.fn()} />);
    await screen.findByRole("button", { name: /talk to the coach instead/i });
    expect(String(fetchSpy.mock.calls[0][0])).toBe("/api/interview/config?userId=ben&agent=onboard");
  });

  it("starts a websocket session with the signed URL and a save_dna client tool", async () => {
    mockConfig(SIGNED);
    const getUserMedia = mockMic();
    await startTalking();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    const opts = lastStartOpts();
    expect(opts.signedUrl).toBe(SIGNED.signedUrl);
    expect(opts.connectionType).toBe("websocket");
    expect(typeof opts.clientTools.save_dna).toBe("function");
    // While active: status text and a Stop button; Stop ends the session.
    expect(screen.getByText("Connecting to your coach…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(el.endSession).toHaveBeenCalledTimes(1);
  });

  it("[Apply to form] calls onComplete with a mapped Partial<LearningDNA> and ends the session", async () => {
    mockConfig(SIGNED);
    mockMic();
    const { user, onComplete } = await startTalking();

    let result: string | undefined;
    await act(async () => {
      result = await lastStartOpts().clientTools.save_dna({
        targetRoles: ["ML engineer", "astronaut"],
        timelineLabel: "Summer internship 2027",
        hoursPerWeek: 60,
        theoryPractice: 70,
        budget: "free only",
        constraints: ["part-time job"],
      });
    });
    expect(result).toBe("saved");

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("ML engineer")).toBeInTheDocument();
    expect(within(sheet).getByText("40 hours")).toBeInTheDocument();
    expect(within(sheet).getByText("Free resources only")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled(); // the coach never submits anything itself

    await user.click(within(sheet).getByRole("button", { name: "Apply to form" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      targetRoles: ["ml-engineer"],
      timelineLabel: "Summer internship 2027",
      hoursPerWeek: 40,
      theoryPractice: 70,
      budget: "free",
      constraints: ["part-time job"],
    });
    expect(el.endSession).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("[Edit] closes the sheet and keeps talking", async () => {
    mockConfig(SIGNED);
    mockMic();
    const { user, onComplete } = await startTalking();
    el.status = "connected";
    await act(async () => {
      await lastStartOpts().clientTools.save_dna({ hoursPerWeek: 8 });
    });
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(el.endSession).not.toHaveBeenCalled();
    expect(el.sendContextualUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /review your answers/i })).toBeInTheDocument();
  });

  it("fetches a fresh signed URL each time the student taps Talk", async () => {
    const fetchSpy = mockConfigSequence([
      { data: SIGNED },
      { data: { ...SIGNED, signedUrl: "wss://example.test/convai?token=fresh1" } },
      { data: { ...SIGNED, signedUrl: "wss://example.test/convai?token=fresh2" } },
    ]);
    mockMic();
    const { user } = await startTalking();
    expect(lastStartOpts().signedUrl).toBe("wss://example.test/convai?token=fresh1");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1][0])).toBe("/api/interview/config?userId=aisha&agent=onboard");

    await user.click(screen.getByRole("button", { name: "Stop" }));
    await user.click(await screen.findByRole("button", { name: /talk to the coach instead/i }));
    await waitFor(() => expect(el.startSession).toHaveBeenCalledTimes(2));
    expect(lastStartOpts().signedUrl).toBe("wss://example.test/convai?token=fresh2");
  });

  it("shows a kind error and does not start when the fresh config fails", async () => {
    mockConfigSequence([{ data: SIGNED }, { data: null, ok: false }]);
    mockMic();
    const user = userEvent.setup();
    render(<VoiceOnboardButton onComplete={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /talk to the coach instead/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't reach your coach/i)));
    expect(el.startSession).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /talk to the coach instead/i })).toBeInTheDocument();
  });

  it("does not start a session if the student presses Stop while the mic prompt is open", async () => {
    const fetchSpy = mockConfig(SIGNED);
    const mic = deferredMic();
    const user = userEvent.setup();
    render(<VoiceOnboardButton onComplete={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /talk to the coach instead/i }));
    await waitFor(() => expect(mic.getUserMedia).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await act(async () => {
      mic.grant();
    });
    expect(el.startSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no fresh config fetch either
    expect(screen.getByRole("button", { name: /talk to the coach instead/i })).toBeInTheDocument();
  });

  it("does not start a session if the component unmounts while the mic prompt is open", async () => {
    mockConfig(SIGNED);
    const mic = deferredMic();
    const user = userEvent.setup();
    const { unmount } = render(<VoiceOnboardButton onComplete={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /talk to the coach instead/i }));
    await waitFor(() => expect(mic.getUserMedia).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      mic.grant();
    });
    await act(async () => {});
    expect(el.startSession).not.toHaveBeenCalled();
  });

  it("keeps the answers when the chat has ended: [Close] then [Review your answers] reopens them", async () => {
    mockConfig(SIGNED);
    mockMic();
    const { user, onComplete } = await startTalking();
    await act(async () => {
      await lastStartOpts().clientTools.save_dna({ hoursPerWeek: 8, budget: "free" });
    });
    // The call is not connected any more (cap or end_call), so the button says Close, not Edit.
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(el.sendContextualUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /review your answers/i }));
    const reopened = screen.getByRole("dialog");
    expect(within(reopened).getByText("8 hours")).toBeInTheDocument();
    await user.click(within(reopened).getByRole("button", { name: "Apply to form" }));
    expect(onComplete).toHaveBeenCalledWith({ hoursPerWeek: 8, budget: "free" });
    expect(screen.queryByRole("button", { name: /review your answers/i })).not.toBeInTheDocument();
  });

  it("moves keyboard focus to Stop when the chat starts and back to Talk when it ends", async () => {
    mockConfig(SIGNED);
    mockMic();
    const { user } = await startTalking();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop" }));
    await user.keyboard("{Enter}");
    expect(el.endSession).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(await screen.findByRole("button", { name: /talk to the coach instead/i }));
  });

  it("keeps the speaking/listening status out of the live regions", async () => {
    mockConfig(SIGNED);
    mockMic();
    await startTalking();
    expect(screen.getByText("Connecting to your coach…").closest("[aria-live]")).toBeNull();
  });

  it("shows live captions from onMessage", async () => {
    mockConfig(SIGNED);
    mockMic();
    await startTalking();
    act(() => {
      el.hookOptions?.onMessage?.({ message: "Hi! What role are you aiming for?", source: "ai" });
      el.hookOptions?.onMessage?.({ message: "ML engineer", source: "user" });
    });
    const captions = screen.getByRole("list", { name: "Live captions" });
    expect(captions).toHaveAttribute("aria-live", "polite");
    expect(within(captions).getByText("Hi! What role are you aiming for?")).toBeInTheDocument();
    expect(within(captions).getByText("ML engineer")).toBeInTheDocument();
    expect(within(captions).getByText("Coach:")).toBeInTheDocument();
    expect(within(captions).getByText("You:")).toBeInTheDocument();
  });

  it("tells the student when the microphone is blocked and does not start a session", async () => {
    mockConfig(SIGNED);
    mockMic("denied");
    const user = userEvent.setup();
    render(<VoiceOnboardButton onComplete={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /talk to the coach instead/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't access your microphone/i);
    expect(el.startSession).not.toHaveBeenCalled();
  });
});
