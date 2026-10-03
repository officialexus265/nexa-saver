import { useEffect, useRef } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function PinPad({
  value,
  onChange,
  disabled,
  error,
  onComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: boolean;
  /** Called once when the 4th digit is entered (pad or keyboard). */
  onComplete?: (pin: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const completedFor = useRef<string | null>(null);

  function press(key: string) {
    if (disabled) return;
    if (key === "del") {
      completedFor.current = null;
      onChange(value.slice(0, -1));
      return;
    }
    if (key && value.length < 4) {
      const next = value + key;
      onChange(next);
    }
  }

  // Keyboard: digits and Backspace while this pad is mounted.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (disabled) return;
      // Don't steal typing from text fields (forgot-PIN form, amount inputs, etc.).
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        completedFor.current = null;
        onChange(value.slice(0, -1));
        return;
      }
      if (/^[0-9]$/.test(e.key) && value.length < 4) {
        e.preventDefault();
        onChange(value + e.key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [value, disabled, onChange]);

  // Fire onComplete when we reach 4 digits (once per full pin).
  useEffect(() => {
    if (value.length !== 4 || !onComplete || disabled) return;
    if (completedFor.current === value) return;
    completedFor.current = value;
    onComplete(value);
  }, [value, onComplete, disabled]);

  return (
    <div ref={rootRef} className="space-y-5" tabIndex={-1}>
      <div className={cn("flex justify-center gap-3", error && "shake")}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full border border-border transition-[background-color,transform] duration-150",
              i < value.length ? "scale-110 bg-primary" : "bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              className="tap grid h-14 place-items-center rounded-xl bg-surface-2 text-lg font-medium text-fg hover:bg-border"
            >
              {key === "del" ? <Delete className="size-5" /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
