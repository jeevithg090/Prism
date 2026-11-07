// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "@/data/fixtures/briefing.aisha.json";
import { BriefingPlayer, formatTime, formatWeekOf } from "./BriefingPlayer";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
const envelope = (data: unknown, status = 200) => Response.json(data, { status });

let fetchSpy: ReturnType<typeof vi.spyOn>;
let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

function routeFetch(route: Route) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => route(String(input), init));
}

beforeEach(() => {
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => "blob:briefing");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BriefingPlayer", () => {
  it("toggles play and pause on the audio element and shows the transcript under Read instead", async () => {
    routeFetch(() => envelope({ ok: true, data: fixture }));
    const user = userEvent.setup();
    const { container } = render(<BriefingPlayer userId="aisha" />);

    const play = await screen.findByRole("button", { name: "Play briefing" });
    expect(screen.getByText("🎧 Your weekly briefing")).toBeInTheDocument();
    expect(screen.getByText("Week of 9 Nov")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("/api/briefing/aisha");

    await user.click(play);
    expect(playSpy).toHaveBeenCalledTimes(1);
    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("/demo/briefing-aisha.mp3");
    const pause = await screen.findByRole("button", { name: "Pause briefing" });
    expect(screen.getByText("Playing your briefing.")).toBeInTheDocument();

    await user.click(pause);
    expect(pauseSpy).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Play briefing" })).toBeInTheDocument();

    const summary = screen.getByText("Read instead");
    const details = summary.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent(fixture.script.slice(0, 60));
    expect(details).toHaveTextContent(fixture.topTasks[0]);
  });

  it("switches speed between 1× and 1.25×", async () => {
    routeFetch(() => envelope({ ok: true, data: fixture }));
    const user = userEvent.setup();
    const { container } = render(<BriefingPlayer userId="aisha" />);
    const speed = await screen.findByRole("button", { name: /playback speed 1×/i });
    await user.click(speed);
    expect(container.querySelector("audio")!.playbackRate).toBe(1.25);
    expect(screen.getByRole("button", { name: /playback speed 1\.25×/i })).toHaveTextContent("1.25×");
  });

  it("falls back to POST /api/tts with the script when there is no audioUrl", async () => {
    const { audioUrl: _drop, ...noAudio } = fixture;
    routeFetch((url, init) => {
      if (url === "/api/tts") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ text: fixture.script });
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
      }
      return envelope({ ok: true, data: noAudio });
    });
    const user = userEvent.setup();
    const { container } = render(<BriefingPlayer userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: "Play briefing" }));
    await screen.findByRole("button", { name: "Pause briefing" });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(container.querySelector("audio")!.getAttribute("src")).toBe("blob:briefing");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("opens the transcript when no audio can be made", async () => {
    const { audioUrl: _drop, ...noAudio } = fixture;
    routeFetch((url) =>
      url === "/api/tts"
        ? envelope({ ok: false, error: { code: "not_ready", message: "Audio isn't ready yet." } }, 501)
        : envelope({ ok: true, data: noAudio }),
    );
    const user = userEvent.setup();
    render(<BriefingPlayer userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: "Play briefing" }));
    expect(await screen.findByText(/audio isn't available right now/i)).toBeInTheDocument();
    expect(screen.getByText("Read instead").closest("details")).toHaveAttribute("open");
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("shows an error with Retry, then loads on retry", async () => {
    let calls = 0;
    routeFetch(() =>
      ++calls === 1
        ? envelope({ ok: false, error: { code: "internal", message: "Something went wrong" } }, 500)
        : envelope({ ok: true, data: fixture }),
    );
    const user = userEvent.setup();
    render(<BriefingPlayer userId="aisha" />);
    expect(await screen.findByText("Couldn't load your briefing.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Play briefing" })).toBeInTheDocument();
  });

  it("shows the empty state on 404", async () => {
    routeFetch(() => envelope({ ok: false, error: { code: "not_found", message: "No briefing yet. Your first one arrives Monday." } }, 404));
    render(<BriefingPlayer userId="newbie" />);
    expect(await screen.findByText("Your first briefing arrives Monday.")).toBeInTheDocument();
  });

  it("shows a loading state first", async () => {
    routeFetch(() => new Promise<Response>(() => {}));
    const { container } = render(<BriefingPlayer userId="aisha" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Loading your briefing…")).toBeInTheDocument());
  });
});

// Browser-like media: play() fires "play" and stays pending while the file buffers;
// pause() rejects pending play() promises with AbortError (HTML spec "internal pause steps").
describe("BriefingPlayer with buffering audio", () => {
  let pending: { reject: (e: unknown) => void }[] = [];
  const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));
  const ttsCalls = () => fetchSpy.mock.calls.filter((c: unknown[]) => String(c[0]) === "/api/tts").length;

  beforeEach(() => {
    pending = [];
    playSpy.mockImplementation(function (this: HTMLMediaElement) {
      setTimeout(() => this.dispatchEvent(new Event("play")), 0);
      return new Promise<void>((_res, reject) => pending.push({ reject }));
    });
    pauseSpy.mockImplementation(function (this: HTMLMediaElement) {
      const p = pending;
      pending = [];
      p.forEach((x) => x.reject(new DOMException("The play() request was interrupted by a call to pause().", "AbortError")));
      this.dispatchEvent(new Event("pause"));
    });
  });

  it("pausing while the MP3 is still buffering just pauses: no TTS call and no second play()", async () => {
    routeFetch((url) =>
      url === "/api/tts"
        ? new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } })
        : envelope({ ok: true, data: fixture }),
    );
    const user = userEvent.setup();
    const { container } = render(<BriefingPlayer userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: "Play briefing" }));
    await user.click(await screen.findByRole("button", { name: "Pause briefing" }));
    await settle();
    expect(await screen.findByRole("button", { name: "Play briefing" })).toBeInTheDocument();
    expect(ttsCalls()).toBe(0);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")!.getAttribute("src")).toBe("/demo/briefing-aisha.mp3");
    expect(screen.queryByText(/audio isn't available right now/i)).not.toBeInTheDocument();
  });

  it("unmounting while play() is pending doesn't fetch TTS or play again", async () => {
    routeFetch((url) =>
      url === "/api/tts"
        ? new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } })
        : envelope({ ok: true, data: fixture }),
    );
    const user = userEvent.setup();
    const { unmount } = render(<BriefingPlayer userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: "Play briefing" }));
    act(() => unmount());
    await settle();
    expect(ttsCalls()).toBe(0);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("unmounting while /api/tts is generating aborts the request and starts nothing", async () => {
    const { audioUrl: _drop, ...noAudio } = fixture;
    let ttsSignal: AbortSignal | undefined;
    routeFetch((url, init) => {
      if (url !== "/api/tts") return envelope({ ok: true, data: noAudio });
      ttsSignal = init?.signal ?? undefined;
      return new Promise<Response>((_res, reject) =>
        ttsSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      );
    });
    const user = userEvent.setup();
    const { unmount } = render(<BriefingPlayer userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: "Play briefing" }));
    expect(await screen.findByText("Preparing your audio…")).toBeInTheDocument();
    act(() => unmount());
    await settle();
    expect(ttsSignal?.aborted).toBe(true);
    expect(playSpy).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe("BriefingPlayer with a broken MP3", () => {
  it("falls back to POST /api/tts when the committed file can't be played", async () => {
    playSpy
      .mockRejectedValueOnce(new DOMException("The element has no supported sources.", "NotSupportedError"))
      .mockResolvedValue(undefined);
    routeFetch((url) =>
      url === "/api/tts"
        ? new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } })
        : envelope({ ok: true, data: fixture }),
    );
    const user = userEvent.setup();
    const { container } = render(<BriefingPlayer userId="aisha" />);
    await user.click(await screen.findByRole("button", { name: "Play briefing" }));
    expect(await screen.findByRole("button", { name: "Pause briefing" })).toBeInTheDocument();
    expect(container.querySelector("audio")!.getAttribute("src")).toBe("blob:briefing");
    expect(playSpy).toHaveBeenCalledTimes(2);
  });
});

describe("formatters", () => {
  it("formats week and time", () => {
    expect(formatWeekOf("2026-11-09")).toBe("9 Nov");
    expect(formatTime(65.4)).toBe("1:05");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});
