import { useState } from "react";
import { Languages } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, languages, t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-sm text-fg"
        aria-label={t("nav.language")}
        onClick={() => setOpen((v) => !v)}
      >
        <Languages className="size-4" />
        <span className="hidden sm:inline">{t("nav.language")}</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 min-w-[12rem] rounded-xl border border-border bg-surface p-1 shadow-soft">
            <p className="px-3 py-2 text-xs text-muted">{t("lang.choose")}</p>
            {languages.map((l) => {
              const canUse = l.enabled || l.code === "en";
              return (
                <button
                  key={l.code}
                  type="button"
                  disabled={!canUse}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm",
                    lang === l.code ? "bg-surface-2 text-fg" : "text-muted",
                    !canUse && "opacity-50",
                  )}
                  onClick={() => {
                    if (!canUse) return;
                    void setLang(l.code);
                    setOpen(false);
                  }}
                >
                  <span>{l.name}</span>
                  {!canUse ? (
                    <span className="text-[10px] uppercase tracking-wide text-faint">{t("lang.comingSoon")}</span>
                  ) : lang === l.code ? (
                    <span className="text-primary">✓</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
