import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand";

function isLikelyOffline(message?: string | null): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("network error") ||
    m.includes("fetch failed") ||
    m.includes("err_internet") ||
    m.includes("err_network") ||
    m.includes("offline")
  );
}

/**
 * Full-page offline / connection error with retry.
 */
export function OfflineScreen({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry: () => void;
}) {
  const offline = isLikelyOffline(message);
  const [retrying, setRetrying] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Auto-retry once when the browser reports connectivity again
  useEffect(() => {
    if (!online) return;
    if (!offline && message) return;
    const t = window.setTimeout(() => {
      onRetry();
    }, 400);
    return () => window.clearTimeout(t);
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry() {
    setRetrying(true);
    try {
      onRetry();
    } finally {
      window.setTimeout(() => setRetrying(false), 800);
    }
  }

  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <BrandLockup />
        </div>
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-border bg-surface-2">
          <WifiOff className="size-8 text-muted" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold text-fg">
          {offline || !online ? "You’re offline" : "Connection problem"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {offline || !online
            ? "NEXA-SAVER can’t reach the server right now. Check your mobile data or Wi‑Fi, then try again. Your money and account data are safe on the server."
            : "We couldn’t load your vault. This is often a short network issue — wait a moment and retry."}
        </p>
        {!online ? (
          <p className="mt-2 text-xs text-muted">Waiting for a connection…</p>
        ) : null}
        <Button className="mt-6 w-full" loading={retrying} disabled={retrying} onClick={() => void handleRetry()}>
          {retrying ? "Trying…" : "Try again"}
        </Button>
        <button
          type="button"
          className="mt-3 text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}

export { isLikelyOffline };
