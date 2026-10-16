import { useEffect, useState } from "react";
import { MessageCircle, Phone, Facebook, X, MessageSquare } from "lucide-react";
import { listHelpLinesPublic, type HelpLine } from "@/lib/nexa/fns";
import { cn } from "@/lib/utils";

function channelHref(line: HelpLine): string {
  const v = line.value.trim();
  switch (line.channel) {
    case "whatsapp": {
      const digits = v.replace(/\D/g, "");
      return `https://wa.me/${digits}`;
    }
    case "call":
      return `tel:${v.replace(/\s/g, "")}`;
    case "sms":
      return `sms:${v.replace(/\s/g, "")}`;
    case "facebook":
      return v.startsWith("http") ? v : `https://facebook.com/${v.replace(/^@/, "")}`;
    default:
      return v.startsWith("http") ? v : `https://${v}`;
  }
}

function ChannelIcon({ channel }: { channel: HelpLine["channel"] }) {
  const cls = "size-5";
  if (channel === "whatsapp") return <MessageCircle className={cls} />;
  if (channel === "call") return <Phone className={cls} />;
  if (channel === "sms") return <MessageSquare className={cls} />;
  if (channel === "facebook") return <Facebook className={cls} />;
  return <MessageCircle className={cls} />;
}

export function HelpFab() {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [lines, setLines] = useState<HelpLine[]>([]);

  useEffect(() => {
    void listHelpLinesPublic()
      .then(setLines)
      .catch(() => setLines([]));
  }, []);

  if (!lines.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-30 flex flex-col items-end sm:bottom-8 sm:right-6">
      <div
        className={cn(
          "mb-3 flex flex-col-reverse items-end gap-2",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
        {...(!open ? ({ inert: true } as React.HTMLAttributes<HTMLDivElement>) : {})}
      >
        {lines.map((line, i) => (
          <a
            key={line.id}
            href={open ? channelHref(line) : undefined}
            target={line.channel === "call" || line.channel === "sms" ? undefined : "_blank"}
            rel="noopener noreferrer"
            tabIndex={open ? 0 : -1}
            className={cn(
              "help-fab-chip flex items-center gap-3 rounded-full border border-border bg-surface/95 py-2 pl-4 pr-2.5 shadow-md backdrop-blur-sm",
              open ? "help-fab-chip-in" : hasOpened ? "help-fab-chip-out" : "help-fab-chip-idle",
            )}
            style={{ "--chip-i": open ? i : lines.length - 1 - i } as React.CSSProperties}
            onClick={(e) => {
              if (!open) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              setOpen(false);
            }}
          >
            <span className="max-w-[10rem] truncate text-sm font-medium text-fg">{line.label}</span>
            <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
              <ChannelIcon channel={line.channel} />
            </span>
          </a>
        ))}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        onClick={() => setOpen((v) => { const next = !v; if (next) setHasOpened(true); return next; })}
        className={cn(
          "help-fab-main pointer-events-auto relative size-14 shrink-0 overflow-hidden rounded-full",
          "bg-white shadow-md ring-1 ring-black/5",
          "transition-[transform,box-shadow] duration-200 ease-out",
          "hover:shadow-lg hover:ring-primary/30 active:scale-[0.97]",
          open && "ring-primary/40 shadow-lg",
        )}
      >
        {/* Soft idle glow — very light */}
        {!open ? <span className="help-fab-glow" aria-hidden /> : null}

        <img
          src="/help-agent.png"
          alt=""
          className={cn(
            "absolute inset-0 size-full object-cover object-center",
            "transition-opacity duration-250 ease-out",
            open ? "opacity-0" : "opacity-100",
          )}
        />

        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-surface text-fg",
            "transition-opacity duration-250 ease-out",
            open ? "opacity-100" : "opacity-0",
          )}
          aria-hidden={!open}
        >
          <X
            className={cn(
              "size-5 transition-transform duration-250 ease-out",
              open ? "scale-100" : "scale-90",
            )}
          />
        </span>
      </button>
    </div>
  );
}
