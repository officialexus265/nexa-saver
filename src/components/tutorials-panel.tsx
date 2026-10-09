import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { getPublicTutorials, getSignupIntroVideo } from "@/lib/nexa/fns";
import { useT } from "@/lib/i18n/client";

type Item = { id: string; title: string; description: string; youtubeId: string };

/**
 * Sign-up tutorials helper — only when admin enables the feature.
 */
export function TutorialsButton({ className }: { className?: string }) {
  const { t } = useT();
  const [featureOn, setFeatureOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<Item | null>(null);
  const [introId, setIntroId] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([getPublicTutorials(), getSignupIntroVideo()])
      .then(([tut, intro]) => {
        setFeatureOn(Boolean(tut.enabled));
        setItems(tut.items || []);
        setIntroId(intro.videoId);
        setLoaded(true);
      })
      .catch(() => {
        setFeatureOn(false);
        setItems([]);
        setIntroId(null);
        setLoaded(true);
      });
  }, []);

  if (!loaded || !featureOn) return null;

  return (
    <>
      <div className={className}>
        <p className="max-w-[11rem] text-xs leading-snug text-muted">{t("signup.notFamiliar")}</p>
        <div className="mt-1.5 flex flex-col items-end gap-1.5">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {t("signup.tutorials")}
          </Button>
          {introId ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setIntroOpen(true)}>
              {t("signup.rewatchIntro")}
            </Button>
          ) : null}
        </div>
      </div>

      <Modal open={open && !active} onClose={() => setOpen(false)} title={t("signup.tutorialsTitle")}>
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            {t("signup.tutorialsEmpty")}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {t("signup.tutorialsHint")}
            </p>
            <ul className="mt-4 space-y-2">
              {items.map((it, index) => (
                <li key={it.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-left transition hover:border-primary/40"
                    onClick={() => setActive(it)}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">
                      {index + 1}. {it.title}
                    </p>
                    {it.description ? <p className="mt-1 text-sm text-muted">{it.description}</p> : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setOpen(false)}>
          Close
        </Button>
      </Modal>

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.title || "Tutorial"} wide>
        {active ? (
          <div className="space-y-3">
            {active.description ? <p className="text-sm text-muted">{active.description}</p> : null}
            <div className="aspect-video overflow-hidden rounded-xl border border-border bg-black">
              <iframe
                title={active.title}
                src={`https://www.youtube.com/embed/${active.youtubeId}?rel=0`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <Button type="button" className="w-full" onClick={() => setActive(null)}>
              Back to list
            </Button>
          </div>
        ) : null}
      </Modal>

      <Modal open={introOpen} onClose={() => setIntroOpen(false)} title="How NEXA-SAVER works" wide>
        {introId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">You can close this and continue signing up at any time.</p>
            <div className="aspect-video overflow-hidden rounded-xl border border-border bg-black">
              <iframe
                title="Intro"
                src={`https://www.youtube.com/embed/${introId}?rel=0`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <Button type="button" className="w-full" onClick={() => setIntroOpen(false)}>
              Close
            </Button>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
