import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getSignupIntroVideo } from "@/lib/nexa/fns";
import { useT } from "@/lib/i18n/client";
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
  const { t } = useT();
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

  function markDoneAndProceed() {
    try {
      sessionStorage.setItem("nexa-signup-intro-done", "1");
    } catch {
      /* ignore */
    }
    setPhase("ready");
    onProceed();
  }

  function onYes() {
    markDoneAndProceed();
  }

  function onNo() {
    setPhase("video");
  }

  function onSkipVideo() {
    markDoneAndProceed();
  }

  function onProceedFromVideo() {
    markDoneAndProceed();
  }

  if (phase === "ready") return null;

  if (phase === "ask") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-bg/95 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-lg">
          <div>
            <h1 className="font-display text-xl font-semibold">{t("signup.introTitle")}</h1>
            <p className="mt-2 text-sm text-muted">{t("signup.introBody")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button type="button" className="w-full" onClick={onYes}>
              {t("signup.introYes")}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={onNo}>
              {t("signup.introNo")}
            </Button>
            <Link
              to="/"
              className="mt-1 text-center text-sm text-muted hover:text-fg"
            >
              {t("signup.introCancel")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // phase === "video"
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-lg">
        <div>
          <h1 className="font-display text-xl font-semibold">{t("signup.videoTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("signup.videoHint")}</p>
        </div>
        {videoLoaded && videoId ? (
          <div className="aspect-video overflow-hidden rounded-xl border border-border bg-black">
            <iframe
              ref={iframeRef}
              title="NEXA-SAVER system guide"
              className="size-full"
              src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : videoLoaded ? (
          <p className="text-sm text-muted">
            {t("signup.videoMissing")}
          </p>
        ) : (
          <p className="text-sm text-muted">{t("common.loading")}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="flex-1" onClick={onSkipVideo}>
            {t("signup.skipVideo")}
          </Button>
          <Button type="button" className="flex-1" onClick={onProceedFromVideo}>
            {t("signup.proceed")}
          </Button>
        </div>
        <p className="text-center text-xs text-muted">{t("signup.ready")}</p>
      </div>
    </div>
  );
}
