"use client";
import * as React from "react";
/** Current user id from the `ks_uid` cookie (contract §8, lib/session). Falls back to the demo user. */
export function readViewerId(cookie: string = typeof document === "undefined" ? "" : document.cookie): string {
  const m = cookie.match(/(?:^|;\s*)ks_uid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "aisha";
}
const noopSubscribe = () => () => {};
export function useViewerId(): string {
  return React.useSyncExternalStore(noopSubscribe, () => readViewerId(), () => "aisha");
}
