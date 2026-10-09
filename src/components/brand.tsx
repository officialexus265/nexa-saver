import { Link, useRouterState } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/nexa/constants";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

export function NexaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-10", className)} aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-bg" />
      <path
        d="M 32.00 10.00 L 51.05 21.00 L 51.05 43.00 L 32.00 54.00 L 12.95 43.00 L 12.95 21.00 Z"
        className="fill-primary"
      />
    </svg>
  );
}

/**
 * Logged in → refresh current app page (never bounce through login).
 * Logged out → home / login only (never dashboard).
 */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!isPending && user) {
    return (
      <button
        type="button"
        className="flex items-center gap-3 text-fg"
        aria-label={`${APP_NAME} — refresh`}
        title="Refresh"
        onClick={() => {
          // Stay in the app; soft refresh of this view
          window.location.assign(pathname || "/dashboard");
        }}
      >
        <NexaMark className={compact ? "size-8" : "size-10"} />
        <span className="font-display text-lg font-semibold tracking-tight">{APP_NAME}</span>
      </button>
    );
  }

  return (
    <Link to="/" className="flex items-center gap-3 text-fg" aria-label={APP_NAME}>
      <NexaMark className={compact ? "size-8" : "size-10"} />
      <span className="font-display text-lg font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}
