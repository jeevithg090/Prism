// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentEvent } from "@/lib/types";
import { ActivityProvider, HighlightNumbers, relativeTime, useActivity } from "./ActivityPanel";

const h = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({ apiPost: h.apiPost, apiGet: vi.fn(), apiPatch: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, ((m: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { MockEventSource.instances.push(this); }
  addEventListener(type: string, cb: (m: MessageEvent) => void) { (this.listeners[type] ??= []).push(cb); }
  close() { this.closed = true; }
  send(e: AgentEvent) { act(() => this.listeners.agent?.forEach((cb) => cb({ data: JSON.stringify(e) } as MessageEvent))); }
  fail() { act(() => this.onerror?.()); }
}

const ev = (agent: AgentEvent["agent"], status: AgentEvent["status"], message: string, data?: Record<string, unknown>): AgentEvent => ({ runId: "run_t", agent, status, message, ts: new Date().toISOString(), ...(data ? { data } : {}) });

function Starter({ id = "run_t" }: { id?: string }) {
  const { start, setOpen } = useActivity();
  return (
    <>
      <button onClick={() => start(id)}>start run</button>
      <button onClick={() => setOpen(true)}>open panel</button>
    </>
  );
}
const setup = async () => {
  const user = userEvent.setup();
  render(<ActivityProvider><Starter /></ActivityProvider>);
  await user.click(screen.getByRole("button", { name: "start run" }));
  return { user, es: MockEventSource.instances.at(-1)! };
};

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  h.apiPost.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ActivityPanel", () => {
  it("opens on start, streams the run and renders one row per event with agent names, in an aria-live region", async () => {
    const { es } = await setup();
    expect(es.url).toBe("/api/agents/stream?runId=run_t");
    expect(screen.getByText("Agents at work")).toBeInTheDocument();
    es.send(ev("syllabus", "progress", "Crawled 32 pages"));
    es.send(ev("market", "progress", "214 ML engineer ads analysed"));
    es.send(ev("evidence", "done", "Read 6 repos, 23 commits"));
    expect(screen.getAllByTestId("agent-row")).toHaveLength(3);
    for (const name of ["Syllabus Agent", "Market Agent", "Evidence Agent"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByTestId("agent-timeline")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("agents").parentElement).toHaveTextContent("3 agents");
  });

  it("groups events by agent in the order agents first appear", async () => {
    const { es } = await setup();
    es.send(ev("orchestrator", "started", "Building Aisha's bridge"));
    es.send(ev("syllabus", "started", "Reading the programme page"));
    es.send(ev("market", "started", "Searching job boards"));
    es.send(ev("syllabus", "done", "Found 41 course units"));
    const groups = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-agent"));
    expect(groups.map((g) => g.getAttribute("data-agent"))).toEqual(["orchestrator", "syllabus", "market"]);
    groups.shift();
    expect(within(groups[0]).getAllByTestId("agent-row").map((r) => r.textContent)).toEqual([expect.stringContaining("Reading the programme page"), expect.stringContaining("Found 41 course units")]);
    expect(within(groups[0]).getByText("Done")).toBeInTheDocument();
    expect(within(groups[1]).getByText("Working")).toBeInTheDocument();
    expect(screen.getByTestId("run-progress")).toHaveTextContent("1 of 2 agents finished");
  });

  it("ends a run without an orchestrator when its lead agent is done (a pod match)", async () => {
    const { es } = await setup();
    es.send(ev("matchmaker", "started", "Comparing 12 students"));
    es.send(ev("matchmaker", "done", "Pod Aurora is ready: Priya, Tom, Mei"));
    expect(es.closed).toBe(true);
    expect(screen.getByTestId("run-done")).toHaveTextContent("Pod Aurora is ready");
  });

  it("highlights numbers like 214 in a font-mono span", async () => {
    const { es } = await setup();
    es.send(ev("market", "progress", "214 ML engineer ads analysed, Docker in 41%"));
    const n = screen.getByText("214");
    expect(n.tagName).toBe("SPAN");
    expect(n).toHaveClass("font-mono", "font-semibold");
    expect(screen.getByText("41%")).toHaveClass("font-mono");
  });

  it("shows the Bridge ready card with a link to /map when the orchestrator is done, and stops listening", async () => {
    const { es } = await setup();
    es.send(ev("orchestrator", "started", "Building Aisha's bridge"));
    es.send(ev("orchestrator", "done", "Bridge ready · 38% → 84%", { readinessNow: 0.38, readinessProjected: 0.84 }));
    const card = screen.getByTestId("bridge-ready");
    expect(card).toHaveTextContent("Bridge ready · 38% → 84%");
    expect(within(card).getByRole("link", { name: "See my Bridge Map" })).toHaveAttribute("href", "/map");
    expect(es.closed).toBe(true);
    expect(screen.getByText("Finished")).toBeInTheDocument();
  });

  it("falls back to polling ?poll=1 after 2 EventSource errors", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: [ev("orchestrator", "started", "Building"), ev("market", "done", "214 ads analysed"), ev("orchestrator", "done", "Bridge ready · 38% → 84%", { readinessNow: 0.38, readinessProjected: 0.84 })] })),
    );
    const { es } = await setup();
    es.fail();
    expect(fetchSpy).not.toHaveBeenCalled();
    es.fail();
    expect(es.closed).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith("/api/agents/stream?runId=run_t&poll=1");
    expect(await screen.findByTestId("bridge-ready")).toBeInTheDocument();
    expect(screen.getAllByTestId("agent-row")).toHaveLength(3);
  });

  it("ignores duplicate events when the stream reconnects and replays history", async () => {
    const { es } = await setup();
    const a = ev("syllabus", "progress", "Crawled 32 pages");
    es.send(a);
    es.send(a);
    expect(screen.getAllByTestId("agent-row")).toHaveLength(1);
  });

  it("shows the empty state and replays the demo run from it", async () => {
    h.apiPost.mockResolvedValue({ runId: "run_demo1" });
    const user = userEvent.setup();
    render(<ActivityProvider><Starter /></ActivityProvider>);
    await user.click(screen.getByRole("button", { name: "open panel" }));
    expect(screen.getByText("No agents running")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Replay demo run" }));
    expect(h.apiPost).toHaveBeenCalledWith("/api/onboard/run", { userId: "aisha", demo: true });
    expect(MockEventSource.instances.at(-1)!.url).toBe("/api/agents/stream?runId=run_demo1");
    expect(screen.getByText("Starting your agents…")).toBeInTheDocument();
  });
});

describe("panel helpers", () => {
  it("relativeTime reads naturally", () => {
    const t = "2026-11-07T14:00:00.000Z";
    const at = (s: number) => Date.parse(t) + s * 1000;
    expect(relativeTime(t, 0)).toBe("");
    expect(relativeTime(t, at(2))).toBe("just now");
    expect(relativeTime(t, at(42))).toBe("42s ago");
    expect(relativeTime(t, at(150))).toBe("2m ago");
  });
  it("HighlightNumbers wraps every number", () => {
    const { container } = render(<p><HighlightNumbers text="LLM evaluation rising +38%/yr" /></p>);
    expect(container.querySelectorAll("span.font-mono")).toHaveLength(1);
    expect(container.textContent).toBe("LLM evaluation rising +38%/yr");
  });
});
