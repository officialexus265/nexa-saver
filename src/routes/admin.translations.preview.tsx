import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { SessionGate } from "@/components/session-gate";
import { I18nProvider, useT } from "@/lib/i18n/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/translations/preview")({
  component: () => (
    <SessionGate>
      {(ctx) =>
        ctx.profile.role === "admin" ? <PreviewBoot /> : <p className="p-6 text-sm text-danger">Admin only</p>
      }
    </SessionGate>
  ),
});

function PreviewBoot() {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  const [lang, setLang] = useState("ny");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nexa-i18n-preview");
      if (raw) {
        const parsed = JSON.parse(raw) as { lang: string; map: Record<string, string> };
        setLang(parsed.lang);
        setMap(parsed.map || {});
      } else {
        setMap({});
      }
    } catch {
      setMap({});
    }
  }, []);

  if (!map) return <p className="p-6 text-sm text-muted">Loading preview…</p>;

  return (
    <I18nProvider previewMap={map} previewLang={lang}>
      <PreviewShell />
    </I18nProvider>
  );
}

function PreviewShell() {
  const { t, lang } = useT();
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-primary">Testing preview · {lang}</p>
          <h1 className="font-display text-2xl font-semibold">{t("i18n.testingAccount")}</h1>
          <p className="text-sm text-muted">{t("i18n.testingHint")}</p>
        </div>
        <Link to="/admin/translations" className="text-sm text-primary">
          {t("i18n.backAdmin")}
        </Link>
      </div>

      <Card className="space-y-2 p-4">
        <p className="text-sm text-muted">{t("dash.balance")}</p>
        <p className="font-display text-3xl font-semibold tabular-nums">••••</p>
        <p className="text-xs text-muted">{t("dash.hidden")}</p>
        <div className="flex gap-2 pt-2">
          <Button className="flex-1">{t("dash.deposit")}</Button>
          <Button className="flex-1" variant="secondary">
            {t("dash.withdraw")}
          </Button>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">{t("dash.activity")}</h2>
        <p className="text-sm text-muted">{t("empty.noActivity")}</p>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">{t("dash.lockTitle")}</h2>
        <p className="text-sm text-muted">{t("dash.lockHint")}</p>
        <Button variant="secondary">{t("dash.lockWithdrawals")}</Button>
      </Card>

      <Card className="space-y-1 p-4 text-sm">
        <p>{t("nav.home")} · {t("nav.profile")} · {t("nav.signOut")}</p>
        <p className="text-muted">{t("app.tagline")}</p>
      </Card>
    </div>
  );
}
