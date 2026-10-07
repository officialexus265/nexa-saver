import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import {
  adminAddLanguage,
  adminGetTranslationDraft,
  adminListLanguages,
  adminPublishTranslations,
  adminSaveTranslationDraft,
  adminSetLanguageEnabled,
} from "@/lib/nexa/fns";
import { ALL_MESSAGE_KEYS, EN_CATALOG } from "@/lib/i18n/catalog-en";

export function TranslationStudio() {
  const [langs, setLangs] = useState<Array<{ code: string; name: string; enabled: boolean }>>([
    { code: "ny", name: "Chichewa", enabled: false },
  ]);
  const [lang, setLang] = useState("ny");
  const [english, setEnglish] = useState<Record<string, string>>({ ...EN_CATALOG });
  const [draft, setDraft] = useState<Record<string, string>>({ ...EN_CATALOG });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const loadDraft = useCallback(async (code: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminGetTranslationDraft({ data: { lang: code } });
      setEnglish(res.english);
      setDraft(res.draft);
      setLang(code);
    } catch (e) {
      // Still show catalog so the page is usable
      setEnglish({ ...EN_CATALOG });
      setDraft({ ...EN_CATALOG });
      setLang(code);
      setErr(
        errMessage(e) +
          " — Showing English catalog. If tables are missing, redeploy so migration 0022 runs, then refresh.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        const list = await adminListLanguages();
        if (cancelled) return;
        const nonEn = list.filter((l) => l.code !== "en");
        setLangs(nonEn.length ? nonEn : [{ code: "ny", name: "Chichewa", enabled: false }]);
        const start = nonEn[0]?.code ?? "ny";
        await loadDraft(start);
      } catch (e) {
        if (!cancelled) {
          setErr(errMessage(e));
          setLangs([{ code: "ny", name: "Chichewa", enabled: false }]);
          setEnglish({ ...EN_CATALOG });
          setDraft({ ...EN_CATALOG });
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDraft]);

  const keys = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return ALL_MESSAGE_KEYS.filter((k) => {
      if (!qq) return true;
      const en = (english[k] || k).toLowerCase();
      const dr = (draft[k] || "").toLowerCase();
      return k.toLowerCase().includes(qq) || en.includes(qq) || dr.includes(qq);
    });
  }, [q, english, draft]);

  const current = langs.find((l) => l.code === lang);

  if (booting) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <p className="text-sm text-muted">Loading translation studio…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Admin</p>
          <h1 className="font-display text-3xl font-semibold">Translation studio</h1>
          <p className="mt-1 text-sm text-muted">
            Translate <strong className="text-fg">whole phrases as users see them</strong> — not word by word. Example:
            English &quot;I want tea&quot; → Chichewa &quot;Ndikufuna tiyi&quot;. Save draft is private; Save &amp; deploy
            publishes to users.
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-primary"
          onClick={() => {
            window.location.assign("/admin");
          }}
        >
          Back to admin
        </button>
      </div>

      {err ? <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
      {busy ? <p className="text-xs text-muted">Working…</p> : null}

      <Card className="space-y-3 p-4">
        <Label>Language</Label>
        <div className="flex flex-wrap gap-2">
          {langs.map((l) => (
            <Button
              key={l.code}
              type="button"
              variant={lang === l.code ? "default" : "secondary"}
              size="sm"
              disabled={busy}
              onClick={() => void loadDraft(l.code)}
            >
              {l.name} ({l.code})
              {l.enabled ? " · live" : ""}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Code e.g. pt" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <Input placeholder="Name e.g. Portuguese" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button
            type="button"
            variant="secondary"
            disabled={!newCode || !newName || busy}
            onClick={() => {
              void adminAddLanguage({ data: { code: newCode, name: newName } })
                .then((list) => {
                  setLangs(list.filter((l) => l.code !== "en"));
                  setNewCode("");
                  setNewName("");
                  setMsg("Language added. Fill phrases, then deploy.");
                  return loadDraft(newCode.trim().toLowerCase());
                })
                .catch((e) => setErr(errMessage(e)));
            }}
          >
            Add language
          </Button>
        </div>
        {current ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(e) => {
                void adminSetLanguageEnabled({ data: { code: lang, enabled: e.target.checked } })
                  .then((list) => setLangs(list.filter((l) => l.code !== "en")))
                  .catch((er) => setErr(errMessage(er)));
              }}
            />
            Language enabled for users (needs published phrases to be useful)
          </label>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMsg(null);
              setErr(null);
              void adminSaveTranslationDraft({ data: { lang, entries: draft } })
                .then(() => setMsg("Draft saved (not live yet)."))
                .catch((e) => setErr(errMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            Save draft
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMsg(null);
              setErr(null);
              void adminPublishTranslations({ data: { lang, entries: draft, enable: true } })
                .then((r) => {
                  setMsg(`Save & deploy: ${r.published} phrases live. Language enabled.`);
                  return adminListLanguages();
                })
                .then((list) => setLangs(list.filter((l) => l.code !== "en")))
                .catch((e) => setErr(errMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            Save &amp; deploy
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              try {
                sessionStorage.setItem("nexa-i18n-preview", JSON.stringify({ lang, map: draft }));
              } catch {
                /* ignore */
              }
              window.location.assign("/admin/translations/preview");
            }}
          >
            Open testing preview
          </Button>
        </div>
        <Input
          placeholder="Search phrases…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full"
        />
        <p className="text-xs text-muted">
          {keys.length} full UI phrases · top = English as on screen · bottom = your natural translation
        </p>
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {keys.map((key) => (
            <li key={key} className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-[11px] font-mono text-faint">{key}</p>
              <p className="mt-1 text-sm text-fg">{english[key] || key}</p>
              <p className="mt-0.5 text-[11px] text-faint">Translate this whole line naturally</p>
              <textarea
                className="mt-2 min-h-[2.75rem] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg"
                value={draft[key] ?? ""}
                placeholder="Full phrase in the target language…"
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                rows={2}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
