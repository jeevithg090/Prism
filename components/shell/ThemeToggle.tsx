"use client";
// Light is the default (projectors). Dark mode is the `.dark` class on <html>, remembered in localStorage.
import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const THEME_KEY = "ks_theme";
const EVENT = "ks-theme-change";

function readStored(): "dark" | "light" | null {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: "dark" | "light", persist = true) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (persist) {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: the class still applies */ }
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle({ className }: { className?: string }) {
  const dark = React.useSyncExternalStore(subscribe, isDark, () => false);
  React.useEffect(() => {
    const stored = readStored();
    if (stored && (stored === "dark") !== isDark()) applyTheme(stored, false);
  }, []);
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={() => applyTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "size-10 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
