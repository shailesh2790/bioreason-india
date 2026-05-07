"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "warm";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    setTheme(initial);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "warm" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("bioreason-theme", next); } catch {}
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "warm" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "warm" : "dark"} theme`}
      style={{
        width: 32,
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        color: "var(--text-2)",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 0.15s",
      }}
    >
      {mounted && theme === "warm" ? (
        // moon (click → dark)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // sun (click → warm)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
