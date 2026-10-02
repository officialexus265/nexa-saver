import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/nexa/constants";
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

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 text-fg">
      <NexaMark className={compact ? "size-8" : "size-10"} />
      <span className="font-display text-lg font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}
