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
  const [lines, setLines] = useState<HelpLine[]>([]);

  useEffect(() => {
    void listHelpLinesPublic()
      .then(setLines)
      .catch(() => setLines([]));
  }, []);

  if (!lines.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-30 flex flex-col items-end sm:bottom-8 sm:right-6">
      {/* Help lines: explode upward from the FAB */}
      <div
        className={cn(
          "mb-3 flex flex-col-reverse items-end gap-2.5",
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
              "help-fab-chip flex items-center gap-3 rounded-full border border-border bg-surface/95 py-2 pl-4 pr-2.5 shadow-lg backdrop-blur-sm",
              open ? "help-fab-chip-in" : "help-fab-chip-out",
            )}
            style={
              {
                "--chip-i": open ? i : lines.length - 1 - i,
              } as React.CSSProperties
            }
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

      {/* Main toggle: agent ↔ X with morph */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "help-fab-main pointer-events-auto relative size-14 shrink-0 overflow-hidden rounded-full shadow-lg",
          "ring-2 ring-primary/35 transition-[box-shadow,transform] duration-300 ease-out",
          "hover:scale-105 hover:ring-primary/60 active:scale-95",
          open && "help-fab-main-open ring-primary/70 shadow-primary/20",
        )}
      >
        {/* Soft pulse ring when closed */}
        {!open ? <span className="help-fab-pulse" aria-hidden /> : null}

        {/* Agent image */}
        <img
          src="/help-agent.png"
          alt=""
          className={cn(
            "absolute inset-0 size-full object-cover object-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open
              ? "scale-50 rotate-[-90deg] opacity-0 blur-sm"
              : "scale-100 rotate-0 opacity-100 blur-0",
          )}
        />

        {/* Close X on tinted plate */}
        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-surface text-fg transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open
              ? "scale-100 rotate-0 opacity-100"
              : "scale-50 rotate-90 opacity-0",
          )}
          aria-hidden={!open}
        >
          <X
            className={cn(
              "size-6 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              open ? "rotate-0 scale-100" : "rotate-90 scale-50",
            )}
          />
        </span>
      </button>
    </div>
  );
}
