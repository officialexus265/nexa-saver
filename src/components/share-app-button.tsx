import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { getReferralPublicConfig } from "@/lib/nexa/fns";
import { cn } from "@/lib/utils";

/** Compact share control for header / bottom nav / login. */
export function ShareAppButton({
  className,
  variant = "nav",
  label = "Share",
}: {
  className?: string;
  variant?: "nav" | "tab" | "pill";
  label?: string;
}) {
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof getReferralPublicConfig>> | null>(null);

  useEffect(() => {
    void getReferralPublicConfig()
      .then(setCfg)
      .catch(() => null);
  }, []);

  async function share() {
    const title = cfg?.og.share.title ?? "NEXA-SAVER";
    const text = cfg?.og.share.description ?? "Save with NEXA-SAVER";
    const url = typeof window !== "undefined" ? window.location.origin : "https://nexa-saver.vercel.app";
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        window.alert("App link copied.");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        window.alert("App link copied.");
      } catch {
        window.prompt("Copy this link:", url);
      }
    }
  }

  if (variant === "tab") {
    return (
      <button
        type="button"
        onClick={() => void share()}
        className={cn("grid place-items-center gap-1 py-2 text-[11px] text-muted", className)}
        aria-label={label}
      >
        <Share2 className="size-5" />
        {label}
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={() => void share()}
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-sm text-fg hover:bg-surface",
          className,
        )}
      >
        <Share2 className="size-4" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted hover:text-fg",
        className,
      )}
    >
      <Share2 className="size-4" />
      {label}
    </button>
  );
}
