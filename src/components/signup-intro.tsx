import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getSignupIntroVideo } from "@/lib/nexa/fns";
import { cn } from "@/lib/utils";

type Phase = "ask" | "video" | "ready";

/**
 * Pre-signup gate: ask familiarity → optional YouTube explainer → proceed or cancel.
 * Video id comes from admin settings. If none is set, "No" still proceeds to signup.
 */
export function SignupIntroGate({
  onProceed,
  forceDone,
}: {
  onProceed: () => void;
  forceDone?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(() => {
    if (forceDone) return "ready";
    if (typeof window === "undefined") return "ask";
    try {
      if (sessionStorage.getItem("nexa-signup-intro-done") === "1") return "ready";
    } catch {
      /* ignore */
    }
    return "ask";
  });
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (forceDone) setPhase("ready");
  }, [forceDone]);

  useEffect(() => {
    void getSignupIntroVideo()
      .then((r) => {
        setVideoId(r.videoId);
        setVideoLoaded(true);
      })
      .catch(() => {
        setVideoId(null);
        setVideoLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (phase !== "video" || !videoId) return;

    function onMessage(event: MessageEvent) {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.event === "onStateChange" && (data.info === 0 || data?.info?.data === 0)) {
          setVideoEnded(true);
        }
        if (data?.event === "infoDelivery" && data?.info?.playerState === 0) {
          setVideoEnded(true);
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [phase, videoId]);

  function markDoneAndProceed() {
    try {
      sessionStorage.setItem("nexa-signup-intro-done", "1");
    } catch {
      /* ignore */
    }
    setPhase("ready");
    onProceed();
  }

  if (phase === "ready") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-intro-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
      >
        {phase === "ask" ? (
          <div className="space-y-4 p-5 sm:p-6">
            <h2 id="signup-intro-title" className="font-display text-xl font-semibold text-fg">
              Before you open a vault
            </h2>
            <p className="text-sm text-muted">
              Are you already familiar with how NEXA-SAVER works (deposits, fees, withdrawals, and locks)?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={!videoLoaded}
                onClick={() => {
                  if (!videoId) {
                    markDoneAndProceed();
                    return;
                  }
                  setPhase("video");
                  setVideoEnded(false);
                }}
              >
                No — show me how it works
              </Button>
              <Button type="button" className="w-full sm:w-auto" onClick={() => markDoneAndProceed()}>
                Yes — go to sign up
              </Button>
            </div>
            <p className="text-center text-xs text-faint">
              <Link to="/" className="text-primary underline-offset-2 hover:underline">
                Cancel and go home
              </Link>
            </p>
          </div>
        ) : null}

        {phase === "video" ? (
          <div className="space-y-3 p-4 sm:p-5">
            <h2 id="signup-intro-title" className="font-display text-lg font-semibold text-fg">
              How NEXA-SAVER works
            </h2>
            <p className="text-sm text-muted">Watch the short guide. You can skip anytime.</p>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              {videoId ? (
                <iframe
                  ref={iframeRef}
                  title="NEXA-SAVER system guide"
                  className="absolute inset-0 h-full w-full"
                  src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted">
                  Explainer video is not available. You can proceed to sign up.
                </div>
              )}
            </div>
            <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between")}>
              {!videoEnded ? (
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setVideoEnded(true)}>
                  Skip video
                </Button>
              ) : (
                <span className="self-center text-xs text-muted">Ready when you are.</span>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  to="/"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface sm:w-auto"
                >
                  Cancel
                </Link>
                {(videoEnded || !videoId) && (
                  <Button type="button" className="w-full sm:w-auto" onClick={() => markDoneAndProceed()}>
                    Proceed to sign up
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
