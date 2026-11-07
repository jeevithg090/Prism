import "server-only";
import { subscribe, getLog } from "@/lib/agents/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  if (!runId) {
    return Response.json({ ok: false, error: { code: "bad_request", message: "runId is required" } }, { status: 400 });
  }
  // Fallback for flaky SSE: ?poll=1 returns the logged events as JSON.
  if (url.searchParams.get("poll") === "1") return Response.json({ ok: true, data: getLog(runId) });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsub = () => {};
      let hb: ReturnType<typeof setInterval> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        if (hb) clearInterval(hb);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      };
      cleanup = close;
      hb = setInterval(() => { if (!closed) controller.enqueue(enc.encode(": ping\n\n")); }, 15_000);
      unsub = subscribe(runId, (ev) => {
        if (closed) return;
        controller.enqueue(enc.encode(`event: agent\ndata: ${JSON.stringify(ev)}\n\n`));
        if (ev.agent === "orchestrator" && (ev.status === "done" || ev.status === "error")) close();
      });
      if (closed) unsub(); // closed during replay, before unsub was assigned
      req.signal.addEventListener("abort", close);
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
