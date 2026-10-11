import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Registers the service worker and shows an update banner when a new SW is waiting. */
export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let installingWorker: ServiceWorker | null = null;
    let cancelled = false;

    const onStateChange = () => {
      if (cancelled) return;
      if (installingWorker?.state === "installed" && navigator.serviceWorker.controller) {
        setUpdateReady(true);
      }
    };

    const onUpdateFound = () => {
      installingWorker = registration?.installing ?? null;
      if (!installingWorker) return;
      installingWorker.addEventListener("statechange", onStateChange);
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (cancelled) return;
          registration = reg;
          reg.addEventListener("updatefound", onUpdateFound);
          if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        })
        .catch((err) => console.warn("[pwa] sw registration failed", err));
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    const interval = window.setInterval(() => {
      void registration?.update();
    }, 60 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (registration) registration.removeEventListener("updatefound", onUpdateFound);
      if (installingWorker) installingWorker.removeEventListener("statechange", onStateChange);
      // load listener uses { once: true } — no remove needed if it already fired
    };
  }, []);

  function applyUpdate() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => window.location.reload(),
        { once: true },
      );
      window.setTimeout(() => window.location.reload(), 500);
    });
  }

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface p-3 shadow-soft"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <p className="text-sm text-muted">A new version of NEXA-SAVER is ready.</p>
        <Button size="sm" onClick={applyUpdate}>
          Update
        </Button>
      </div>
    </div>
  );
}
