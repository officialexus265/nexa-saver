import { useEffect, useState } from "react";
import { Share, Plus, Download } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "nexa.pwa.dismissed";
const INSTALLED_KEY = "nexa.pwa.installed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean; getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (nav.standalone === true) return true;
  const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;
  for (const mode of modes) {
    try {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) return true;
    } catch {
      /* ignore */
    }
  }
  // Some desktop PWAs launch without standalone; remember after successful install.
  try {
    if (localStorage.getItem(INSTALLED_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1" || sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function PwaPrompt() {
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstall | null>(null);
  const ios = isIos();

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      // Browser only fires this when the app is NOT installed.
      setDeferred(e as BeforeInstall);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires beforeinstallprompt — show manual instructions once, not on every visit forever.
    let iosTimer: number | undefined;
    if (ios) {
      iosTimer = window.setTimeout(() => {
        if (!isStandalone() && !wasDismissed()) setOpen(true);
      }, 800);
    }

    // If related apps API is available, hide when already installed.
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ id?: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps === "function") {
      void nav.getInstalledRelatedApps().then((apps) => {
        if (apps && apps.length > 0) {
          try {
            localStorage.setItem(INSTALLED_KEY, "1");
          } catch {
            /* ignore */
          }
          setOpen(false);
        }
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, [ios]);

  if (!open || isStandalone()) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        try {
          localStorage.setItem(INSTALLED_KEY, "1");
        } catch {
          /* ignore */
        }
      }
    }
    dismiss();
  }

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
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
            <Button className="flex-1" onClick={() => void install()}>
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
