import { getRunEvents, subscribe } from "@/lib/agents/events";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import type { AgentEvent } from "@/lib/types";

// GET /api/agents/stream?runId= → server-sent events (contract §6): `event: agent`, `data: <AgentEvent JSON>`.
// Past events are replayed first, a `: ping` heartbeat keeps proxies from closing the connection, and the
// stream ends after the orchestrator's done/error. `&poll=1` returns AgentEvent[] as JSON (the fallback).
const HEARTBEAT_MS = 15_000;
const MAX_STREAM_MS = 5 * 60_000;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Onboarding (and proof) runs end with the orchestrator's done/error. Runs without an orchestrator
// (a pod match, a PR review) end when the agent that started them reports done.
const isRunEnd = (e: AgentEvent, lead: AgentEvent) =>
  e.agent === "orchestrator" ? e.status === "done" || e.status === "error" : lead.agent !== "orchestrator" && e.agent === lead.agent && e.status === "done";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId")?.trim() ?? "";
  if (!runId) return badRequest("Add ?runId=… (you get one from POST /api/onboard/run).");
  if (!RUN_ID.test(runId)) return badRequest("That runId doesn't look right.");

  if (url.searchParams.get("poll") === "1") {
    try {
      return ok(getRunEvents(runId));
    } catch {
      return internal();
    }
  }

  // On reconnect the browser sends the last id it saw; skip what it already has.
  const lastSeen = Number.parseInt(req.headers.get("last-event-id") ?? "", 10);
  const skipThrough = Number.isFinite(lastSeen) ? lastSeen : -1;
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let seq = 0;
      let unsubscribe: (() => void) | undefined;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(cap);
        unsubscribe?.();
        req.signal.removeEventListener("abort", close);
        try { controller.close(); } catch { /* already closed by the client */ }
      };
      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { close(); }
      };
      stop = close;

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      const cap = setTimeout(close, MAX_STREAM_MS);
      send("retry: 2000\n: connected\n\n");
      if (req.signal.aborted) return close();
      req.signal.addEventListener("abort", close);

      try {
        let lead: AgentEvent | undefined;
        unsubscribe = subscribe(runId, (ev) => {
          lead ??= ev;
          const id = seq++;
          if (id > skipThrough) send(`id: ${id}\nevent: agent\ndata: ${JSON.stringify(ev)}\n\n`);
          if (isRunEnd(ev, lead)) close();
        });
      } catch {
        send(`event: agent\ndata: ${JSON.stringify({ runId, agent: "orchestrator", status: "error", message: "We lost the agent stream. Showing demo data.", ts: new Date().toISOString() } satisfies AgentEvent)}\n\n`);
        close();
      }
      // The run may already have finished during the replay above.
      if (closed) unsubscribe?.();
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
