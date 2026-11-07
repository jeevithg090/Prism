import type { ApiResult } from "@/lib/types";

// ApiResult envelope helpers for P4's route handlers (contract §6).
export function ok<T>(data: T, status = 200): Response {
  const body: ApiResult<T> = { ok: true, data };
  return Response.json(body, { status });
}

export function fail(code: string, message: string, status: number): Response {
  const body: ApiResult<never> = { ok: false, error: { code, message } };
  return Response.json(body, { status });
}

export const badRequest = (message = "Invalid request") => fail("bad_request", message, 400);
export const unauthorized = () => fail("unauthorized", "Missing or wrong x-keystone-secret", 401);
export const internal = () => fail("internal", "Something went wrong", 500);

export const isDemo = () => process.env.DEMO_MODE === "true";
