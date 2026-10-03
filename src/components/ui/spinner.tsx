import { cn } from "@/lib/utils";

/** Compact circular spinner for buttons and inline status. */
export function Spinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "size-4 border-[1.5px]" : size === "lg" ? "size-9 border-2" : "size-5 border-2";
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block shrink-0 rounded-full border-border border-t-primary animate-spin",
        dim,
        className,
      )}
    />
  );
}

/** Centered status block under PIN pads / gates. */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <div className="mt-5 flex flex-col items-center gap-3" role="status" aria-live="polite">
      <Spinner size="lg" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
