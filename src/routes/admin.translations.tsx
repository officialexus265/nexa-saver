import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { SessionGate } from "@/components/session-gate";
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
import { ALL_MESSAGE_KEYS } from "@/lib/i18n/catalog-en";

export const Route = createFileRoute("/admin/translations")({
  component: () => (
    <SessionGate>
      {(ctx) =>
        ctx.profile.role === "admin" ? <Studio /> : <p className="p-6 text-sm text-danger">Admin only</p>
      }
    </SessionGate>
  ),
});

function Studio() {
  const navigate = useNavigate();
  const [langs, setLangs] = useState<Array<{ code: string; name: string; enabled: boolean }>>([]);
  const [lang, setLang] = useState("ny");
  const [english, setEnglish] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  function reloadLangs() {
    return adminListLanguages()
      .then(setLangs)
      .catch((e) => setErr(errMessage(e)));
  }

  function loadDraft(code: string) {
    setBusy(true);
    setErr(null);
    void adminGetTranslationDraft({ data: { lang: code } })
      .then((res) => {
        setEnglish(res.english);
        setDraft(res.draft);
        setLang(code);
      })
      .catch((e) => setErr(errMessage(e)))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    void reloadLangs().then(() => loadDraft("ny"));
  }, []);

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

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Admin</p>
          <h1 className="font-display text-3xl font-semibold">Translation studio</h1>
          <p className="mt-1 text-sm text-muted">
            Edit every front-end phrase. Save draft keeps work private. Save & deploy publishes to users and can enable
            the language.
          </p>
        </div>
        <Link to="/admin" className="text-sm text-primary">
          Back to admin
        </Link>
      </div>

      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <Card className="space-y-3 p-4">
        <Label>Language</Label>
        <div className="flex flex-wrap gap-2">
          {langs
            .filter((l) => l.code !== "en")
            .map((l) => (
              <Button
                key={l.code}
                type="button"
                variant={lang === l.code ? "default" : "secondary"}
                size="sm"
                onClick={() => loadDraft(l.code)}
              >
                {l.name} ({l.code}){l.enabled ? " · live" : ""}
              </Button>
            ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Code e.g. pt" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <Input placeholder="Name e.g. Portuguese" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button
            type="button"
            variant="secondary"
            disabled={!newCode || !newName}
            onClick={() => {
              void adminAddLanguage({ data: { code: newCode, name: newName } })
                .then((list) => {
                  setLangs(list);
                  setNewCode("");
                  setNewName("");
                  setMsg("Language added. Fill phrases, then deploy.");
                  loadDraft(newCode.trim().toLowerCase());
                })
                .catch((e) => setErr(errMessage(e)));
            }}
          >
            Add language
          </Button>
        </div>
        {current && current.code !== "en" ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(e) => {
                void adminSetLanguageEnabled({ data: { code: lang, enabled: e.target.checked } })
                  .then(setLangs)
                  .catch((er) => setErr(errMessage(er)));
              }}
            />
            Language enabled for users (they can select it; still needs published phrases)
          </label>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || lang === "en"}
            onClick={() => {
              setBusy(true);
              setMsg(null);
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
            disabled={busy || lang === "en"}
            onClick={() => {
              setBusy(true);
              setMsg(null);
              void adminPublishTranslations({ data: { lang, entries: draft, enable: true } })
                .then((r) => {
                  setMsg(`Save & deploy: ${r.published} phrases live. Language enabled.`);
                  return reloadLangs();
                })
                .catch((e) => setErr(errMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            Save & deploy
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // stash draft in sessionStorage for preview route
              try {
                sessionStorage.setItem("nexa-i18n-preview", JSON.stringify({ lang, map: draft }));
              } catch {
                /* ignore */
              }
              void navigate({ to: "/admin/translations/preview" });
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
        <p className="text-xs text-muted">{keys.length} phrases · English left, translation right</p>
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {keys.map((key) => (
            <li key={key} className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-[11px] font-mono text-faint">{key}</p>
              <p className="mt-1 text-sm text-muted">{english[key] || key}</p>
              <Input
                className="mt-2 w-full"
                value={draft[key] ?? ""}
                placeholder={english[key] || key}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
