import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function listFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null,
  );
}

/**
 * Full-screen (or modal) overlay that traps Tab focus and blocks interaction with
 * anything behind it. Use for PIN lock, passkey challenge, and dialogs.
 */
export function FocusTrap({
  children,
  className,
  label,
  active = true,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  active?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Initial focus: first focusable, or the panel itself
    const focusFirst = () => {
      const list = listFocusable(root);
      if (list.length) list[0]!.focus();
      else {
        root.tabIndex = -1;
        root.focus();
      }
    };
    // Defer so PinPad / buttons have mounted
    const focusTimer = window.setTimeout(focusFirst, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Overlays that shouldn't dismiss on Escape simply ignore this
        return;
      }
      if (e.key !== "Tab") return;
      const list = listFocusable(root);
      if (!list.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !root.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !root.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    // Catch focus that tries to leave (e.g. browser chrome → page)
    const onFocusIn = (e: FocusEvent) => {
      if (root.contains(e.target as Node)) return;
      e.stopPropagation();
      const list = listFocusable(root);
      (list[0] ?? root).focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cn(
        // High z-index + solid backdrop so nothing behind is clickable or visible as interactive
        "fixed inset-0 z-[80]",
        className,
      )}
      // Block pointer events reaching the page under the overlay
      style={{ pointerEvents: "auto" }}
    >
      {children}
    </div>
  );
}
