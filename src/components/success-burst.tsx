import { useEffect } from "react";
import { SUCCESS_TOAST_MS } from "@/lib/nexa/constants";

export function SuccessBurst({
  title,
  body,
  onDone,
}: {
  title: string;
  body: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, SUCCESS_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center stagger-in">
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
      </div>
    </div>
  );
}
