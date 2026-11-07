// Fetch helpers that keep the API error code (404 "no challenge for this skill" reads differently from a failure).
import type { ApiResult } from "@/lib/types";

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); this.name = "ApiError"; }
}

async function handle<T>(res: Response): Promise<T> {
  let json: ApiResult<T> | null = null;
  try { json = (await res.json()) as ApiResult<T>; } catch { /* not JSON */ }
  if (!json) throw new ApiError("We couldn't reach Keystone.", "network", res.status);
  if (!json.ok) throw new ApiError(json.error.message, json.error.code, res.status);
  return json.data;
}

export async function getJSON<T>(url: string): Promise<T> { return handle<T>(await fetch(url)); }
export async function sendJSON<T>(url: string, body: unknown, method: "POST" | "PUT" = "POST"): Promise<T> {
  return handle<T>(await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}
