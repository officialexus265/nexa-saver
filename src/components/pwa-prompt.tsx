import { useEffect, useState } from "react";
import { Share, Plus, Download } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "nexa.pwa.dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaPrompt() {
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstall | null>(null);
  const ios = isIos();

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstall);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const t = window.setTimeout(() => setOpen(true), 400);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.clearTimeout(t);
    };
  }, []);

  if (!open || isStandalone()) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
    }
    dismiss();
  }

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_40px_-24px_rgb(0_0_0_/_0.55)] stagger-in">
        <BrandLockup compact />
        <p className="mt-3 text-sm text-muted">
          Install NEXA-SAVER on your home screen for a full-screen vault on iOS and Android.
        </p>
        {ios && !deferred ? (
          <ol className="mt-3 space-y-2 text-sm text-fg">
            <li className="flex items-center gap-2">
              <Share className="size-4 text-primary" /> Tap Share
            </li>
            <li className="flex items-center gap-2">
              <Plus className="size-4 text-primary" /> Add to Home Screen
            </li>
          </ol>
        ) : null}
        <div className="mt-4 flex gap-2">
          {deferred ? (
            <Button className="flex-1" onClick={install}>
              <Download className="size-4" /> Install
            </Button>
          ) : null}
          <Button variant={deferred ? "secondary" : "primary"} className="flex-1" onClick={dismiss}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
