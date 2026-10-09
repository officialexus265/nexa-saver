import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { getPublicTutorials } from "@/lib/nexa/fns";

type Item = { id: string; title: string; description: string; youtubeId: string };

/**
 * Shown on sign-up (and optionally login): opens admin-configured tutorial videos.
 */
export function TutorialsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<Item | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getPublicTutorials()
      .then((list) => {
        setItems(list);
        setLoaded(true);
      })
      .catch(() => {
        setItems([]);
        setLoaded(true);
      });
  }, []);

  // Hide the control entirely when admin has not configured any tutorials
  if (loaded && items.length === 0) return null;

  return (
    <>
      <div className={className}>
        <p className="text-xs text-muted">Not familiar with the system?</p>
        <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={() => setOpen(true)}>
          Tutorials
        </Button>
      </div>

      <Modal open={open && !active} onClose={() => setOpen(false)} title="Tutorials">
        <p className="text-sm text-muted">
          Short videos about NEXA-SAVER. Pick one to watch — you can close anytime and continue signing up.
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
        <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setOpen(false)}>
          Close
        </Button>
      </Modal>

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.title || "Tutorial"}
      >
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
    </>
  );
}
