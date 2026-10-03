import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Registers the service worker and shows an update banner when a new SW is waiting. */
export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }
      });
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          registration = reg;
          reg.addEventListener("updatefound", onUpdateFound);
          // Already waiting from a previous visit?
          if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        })
        .catch((err) => console.warn("[pwa] sw registration failed", err));
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    // Periodically check for updates while the tab is open.
    const interval = window.setInterval(() => {
      void registration?.update();
    }, 60 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  function applyUpdate() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
      // Reload once the new worker takes control.
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => window.location.reload(),
        { once: true },
      );
      // If skipWaiting is handled, also try a soft reload shortly.
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
