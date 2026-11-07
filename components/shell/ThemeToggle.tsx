"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ks_theme") === "dark";
      document.documentElement.classList.toggle("dark", saved);
      setDark(saved);
    } catch { /* storage can be unavailable in private browsing */ }
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("ks_theme", next ? "dark" : "light"); } catch { /* keep the in-memory preference */ }
  }
  return <Button variant="outline" size="icon" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"}>
    {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
  </Button>;
}
