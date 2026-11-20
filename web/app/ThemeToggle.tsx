"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";
import { getBtnClass } from "./button-styles";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("procureyeti-theme");
    const dark = savedTheme === "dark";

    // Hydrate saved theme from client localStorage on initial mount (SSR cannot access localStorage)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    setMounted(true);
  }, []);

  function toggleTheme() {
    const nextIsDark = !isDark;

    setIsDark(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    localStorage.setItem("procureyeti-theme", nextIsDark ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!mounted}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Loading theme"}
      aria-pressed={mounted && isDark}
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Loading theme"}
      className={getBtnClass("secondary", "sm", "h-10 px-3")}
    >
      {mounted ? (
        isDark ? (
          <SunIcon size={16} className="text-amber-400" />
        ) : (
          <MoonIcon size={16} className="text-slate-600" />
        )
      ) : (
        <span className="h-4 w-4 rounded-full bg-slate-300 dark:bg-slate-700 animate-pulse" />
      )}
      <span className="hidden sm:inline">
        {mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
      </span>
    </button>
  );
}
