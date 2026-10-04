import { useEffect, useState } from "react";
import { MessageCircle, Phone, Facebook, Plus, X, MessageSquare } from "lucide-react";
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
    <div className="pointer-events-none fixed bottom-20 right-4 z-30 flex flex-col items-end gap-0 sm:bottom-8 sm:right-6">
      {/* Expanded stack grows upward from the + */}
      <div
        className={cn(
          "pointer-events-none mb-3 flex flex-col-reverse items-end gap-2 transition-all duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
      >
        {lines.map((line, i) => (
          <a
            key={line.id}
            href={channelHref(line)}
            target={line.channel === "call" || line.channel === "sms" ? undefined : "_blank"}
            rel="noopener noreferrer"
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface py-2 pl-4 pr-3 shadow-lg transition-all duration-300",
              open ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-90 opacity-0",
            )}
            style={{
              transitionDelay: open ? `${i * 50}ms` : `${(lines.length - 1 - i) * 30}ms`,
            }}
            onClick={() => setOpen(false)}
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
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-lg transition-transform duration-300",
          open && "rotate-45",
        )}
      >
        {open ? <X className="size-6" /> : <Plus className="size-6" />}
      </button>
    </div>
  );
}
