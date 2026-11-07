import type { ApiResult } from "@/lib/types";
async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}
export async function apiGet<T>(url: string): Promise<T> { return handle<T>(await fetch(url)); }
export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return handle<T>(await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}
export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return handle<T>(await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}
