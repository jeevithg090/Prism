// Live Lab Pulse: client calls to /api/labs/pulse/*.
import { apiGet, apiPost } from "@/lib/fetcher";
import type { DecideReq, DecisionResult, PulseSnapshot, PulseSource, SessionStart } from "@/lib/labs/pulse/model";

export const startSession = (body: { challengeId?: string; source?: PulseSource }) =>
  apiPost<SessionStart>("/api/labs/pulse/session", body);

export const fetchSnapshot = (sessionId: string, minute?: number) =>
  apiGet<PulseSnapshot>(`/api/labs/pulse?sessionId=${encodeURIComponent(sessionId)}${minute !== undefined ? `&minute=${minute}` : ""}`);

export const decide = (body: DecideReq) => apiPost<DecisionResult>("/api/labs/pulse/decide", body);

/** The challenges Lab Pulse can run (fixture packs in data/fixtures/labs/pulse.json). */
export const PULSE_CHALLENGES = [
  { id: "ch_docker_01", label: "Docker" },
  { id: "ch_python_01", label: "Python" },
  { id: "ch_sql_01", label: "SQL" },
] as const;
