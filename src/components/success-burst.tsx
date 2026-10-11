import { useEffect, useRef } from "react";
import { SUCCESS_TOAST_MS } from "@/lib/nexa/constants";

export function SuccessBurst({
  title,
  body,
  onDone,
  durationMs = SUCCESS_TOAST_MS,
}: {
  title: string;
  body: string;
  onDone: () => void;
  /** Default 3000 ms */
  durationMs?: number;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = window.setTimeout(() => onDoneRef.current(), durationMs);
    return () => window.clearTimeout(t);
  }, [durationMs, title, body]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-6"
      role="status"
      aria-live="polite"
      onClick={() => onDoneRef.current()}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center stagger-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mx-auto mb-5 grid size-20 place-items-center">
          <span className="success-ring absolute inset-0 rounded-full bg-primary/30" />
          <svg viewBox="0 0 48 48" className="relative size-16 text-primary">
            <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path
              className="check-stroke"
              d="M14 25 l7 7 l13 -16"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <p className="mt-4 text-xs text-faint">Closes in a few seconds · tap outside to dismiss</p>
      </div>
    </div>
  );
}
