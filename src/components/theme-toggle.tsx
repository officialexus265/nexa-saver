import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "nexa-theme";

function applyTheme(mode: "day" | "night") {
  const root = document.documentElement;
  if (mode === "day") root.classList.add("light");
  else root.classList.remove("light");
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "day" ? "#f4f7f5" : "#07110e");
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<"day" | "night">("night");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      const next = saved === "day" ? "day" : "night";
      setMode(next);
      applyTheme(next);
    } catch {
      applyTheme("night");
    }
  }, []);

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface-2 px-3 text-sm text-fg",
        className,
      )}
      aria-label={mode === "day" ? "Switch to night mode" : "Switch to day mode"}
      onClick={() => {
        const next = mode === "day" ? "night" : "day";
        setMode(next);
        applyTheme(next);
      }}
    >
      {mode === "day" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      <span className="hidden sm:inline">{mode === "day" ? "Night" : "Day"}</span>
    </button>
  );
}

/** Inline script for FOUC prevention — call from root head if needed. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('nexa-theme');if(t==='day')document.documentElement.classList.add('light');}catch(e){}})();`;
