import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 shadow-[0_18px_40px_-24px_rgb(0_0_0_/_0.55)]",
        className,
      )}
      {...props}
    />
  );
}
