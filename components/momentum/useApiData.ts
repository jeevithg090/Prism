"use client";
// Minimal fetch hook (no React Query dependency, so the slot components work on any page).
import * as React from "react";
import { apiGet } from "@/lib/fetcher";

type Result<T> = { key: string; data?: T; error?: string };

export function useApiData<T>(url: string) {
  const [nonce, setNonce] = React.useState(0);
  const [result, setResult] = React.useState<Result<T> | null>(null);
  const key = `${url}#${nonce}`;

  React.useEffect(() => {
    let alive = true;
    apiGet<T>(url).then(
      (data) => { if (alive) setResult({ key, data }); },
      (e: unknown) => { if (alive) setResult({ key, error: e instanceof Error ? e.message : "Request failed" }); },
    );
    return () => { alive = false; };
  }, [url, key]);

  const current = result?.key === key ? result : null;
  const status: "loading" | "error" | "success" = !current ? "loading" : current.error !== undefined ? "error" : "success";
  const retry = React.useCallback(() => setNonce((n) => n + 1), []);
  return { status, data: current?.data, error: current?.error, retry };
}
