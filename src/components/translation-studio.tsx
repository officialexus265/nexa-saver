import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

type Screen = "home" | "profile" | "auth" | "all";

/** Keys laid out on each mock screen (phrase-level, as users see them). */
const SCREEN_KEYS: Record<Exclude<Screen, "all">, string[]> = {
  home: [
    "dash.balance",
    "dash.hidden",
    "dash.reveal",
    "dash.deposit",
    "dash.withdraw",
    "dash.activity",
    "dash.lifetimeIn",
    "dash.lifetimeOut",
    "dash.dailyCap",
    "dash.remainingToday",
    "dash.lockTitle",
    "dash.lockHint",
    "dash.lockUntil",
    "dash.coolingOff",
    "dash.unlockEarly",
    "dash.cancelLockFree",
    "dash.lockWithdrawals",
    "empty.noActivity",
    "nav.home",
    "nav.profile",
    "nav.signOut",
    "help.title",
  ],
  profile: [
    "profile.title",
    "profile.changePassword",
    "profile.changePin",
    "profile.withdrawalNumber",
    "profile.bankDetails",
    "profile.email",
    "profile.vaultLock",
    "profile.sessions",
    "profile.deleteAccount",
    "profile.signInIdentifier",
    "profile.securityQuestion",
    "profile.lock.idle",
    "profile.lock.instant",
    "profile.lock.off",
    "nav.home",
    "nav.profile",
    "nav.signOut",
  ],
  auth: [
    "auth.signIn",
    "auth.signUp",
    "auth.email",
    "auth.password",
    "auth.username",
    "auth.phone",
    "auth.forgotPassword",
    "auth.noAccount",
    "auth.hasAccount",
    "auth.firstName",
    "auth.lastName",
    "auth.dateOfBirth",
    "auth.gender",
    "auth.pin",
    "auth.securityQuestion",
    "auth.securityAnswer",
    "auth.acceptTerms",
    "auth.acceptPrivacy",
    "auth.terms",
    "auth.privacy",
    "auth.step.you",
    "auth.step.contact",
    "auth.step.security",
    "auth.step.legal",
    "app.tagline",
  ],
};

function phrase(map: Record<string, string>, key: string) {
  return map[key] || (EN_CATALOG as Record<string, string>)[key] || key;
}

/** Clickable phrase chip — edit one full UI line at a time. */
function EditablePhrase({
  msgKey,
  map,
  english,
  selected,
  onSelect,
}: {
  msgKey: string;
  map: Record<string, string>;
  english: Record<string, string>;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const text = phrase(map, msgKey);
  const isChanged = text !== (english[msgKey] || text) && text !== ((EN_CATALOG as Record<string, string>)[msgKey] || "");
  return (
    <button
      type="button"
      onClick={() => onSelect(msgKey)}
      title={`English: ${english[msgKey] || msgKey}`}
      className={cn(
        "rounded-md px-1 py-0.5 text-left transition",
        selected
          ? "bg-primary/20 ring-2 ring-primary"
          : "hover:bg-primary/10 hover:ring-1 hover:ring-primary/40",
        isChanged && !selected ? "underline decoration-primary/50 decoration-dotted" : "",
      )}
    >
      {text}
    </button>
  );
}

export function TranslationStudio() {
  const [langs, setLangs] = useState<Array<{ code: string; name: string; enabled: boolean }>>([
    { code: "ny", name: "Chichewa", enabled: false },
  ]);
  const [lang, setLang] = useState("ny");
  const [english, setEnglish] = useState<Record<string, string>>({ ...EN_CATALOG });
  const [draft, setDraft] = useState<Record<string, string>>({ ...EN_CATALOG });
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedKey, setSelectedKey] = useState<string | null>("dash.deposit");
  const [editValue, setEditValue] = useState("");
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
      if (selectedKey) setEditValue(res.draft[selectedKey] || res.english[selectedKey] || "");
    } catch (e) {
      setEnglish({ ...EN_CATALOG });
      setDraft({ ...EN_CATALOG });
      setLang(code);
      setErr(
        errMessage(e) +
          " — Showing English. Redeploy so migration 0022 runs if save fails.",
      );
    } finally {
      setBusy(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        const list = await adminListLanguages();
        if (cancelled) return;
        const nonEn = list.filter((l) => l.code !== "en");
        setLangs(nonEn.length ? nonEn : [{ code: "ny", name: "Chichewa", enabled: false }]);
        await loadDraft(nonEn[0]?.code ?? "ny");
      } catch (e) {
        if (!cancelled) {
          setErr(errMessage(e));
          setDraft({ ...EN_CATALOG });
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectKey(key: string) {
    setSelectedKey(key);
    setEditValue(draft[key] ?? english[key] ?? (EN_CATALOG as Record<string, string>)[key] ?? "");
    setMsg(null);
  }

  function applyLocalEdit() {
    if (!selectedKey) return;
    setDraft((d) => ({ ...d, [selectedKey]: editValue }));
    setMsg(`Updated “${selectedKey}” in this session. Save draft to keep it.`);
  }

  const current = langs.find((l) => l.code === lang);
  const allKeysForScreen = useMemo(() => {
    if (screen === "all") return [...ALL_MESSAGE_KEYS];
    return SCREEN_KEYS[screen];
  }, [screen]);

  if (booting) {
    return <p className="text-sm text-muted">Loading translation studio…</p>;
  }

  return (
    <div className="space-y-4" data-nexa-translate-studio>
      <div>
        <h2 className="font-display text-2xl font-semibold">Translation studio</h2>
        <p className="mt-1 text-sm text-muted">
          Looks like a user account. <strong className="text-fg">Tap any highlighted phrase</strong> to translate that
          whole line (not word-by-word). Save each line, then <strong className="text-fg">Save draft</strong> or{" "}
          <strong className="text-fg">Save &amp; deploy</strong> when the full language is ready.
        </p>
      </div>

      {err ? <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {langs.map((l) => (
            <Button
              key={l.code}
              type="button"
              size="sm"
              variant={lang === l.code ? "default" : "secondary"}
              disabled={busy}
              onClick={() => void loadDraft(l.code)}
            >
              {l.name}
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
            Language enabled for users after deploy
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMsg(null);
              void adminSaveTranslationDraft({ data: { lang, entries: draft } })
                .then(() => setMsg("Draft saved — not live for users yet."))
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
              void adminPublishTranslations({ data: { lang, entries: draft, enable: true } })
                .then((r) => {
                  setMsg(`Deployed ${r.published} phrases. Language enabled.`);
                  return adminListLanguages();
                })
                .then((list) => setLangs(list.filter((l) => l.code !== "en")))
                .catch((e) => setErr(errMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            Save &amp; deploy
          </Button>
        </div>
      </Card>

      {/* Screen picker */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface-2 p-1">
        {(
          [
            { id: "home" as const, label: "Home (dashboard)" },
            { id: "profile" as const, label: "Profile" },
            { id: "auth" as const, label: "Sign in / up" },
            { id: "all" as const, label: "All phrases" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScreen(s.id)}
            className={
              screen === s.id
                ? "shrink-0 rounded-xl bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-sm"
                : "shrink-0 rounded-xl px-4 py-2.5 text-sm text-muted"
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Visual mock */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted">
            Preview — tap text to edit · language: <span className="font-medium text-fg">{lang}</span>
          </div>
          <div className="space-y-4 p-4">
            {screen === "home" || screen === "all" ? (
              <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-bg p-4">
                <p className="text-sm text-muted">Welcome back</p>
                <p className="font-display text-2xl font-semibold">Sample user</p>
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
                    <EditablePhrase
                      msgKey="dash.balance"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.balance"}
                      onSelect={selectKey}
                    />
                  </p>
                  <p className="mt-2 text-2xl tracking-widest text-muted">••••••</p>
                  <p className="mt-1 text-sm">
                    <EditablePhrase
                      msgKey="dash.hidden"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.hidden"}
                      onSelect={selectKey}
                    />
                  </p>
                  <div className="mt-3 rounded-full bg-primary py-2.5 text-center text-sm font-medium text-primary-fg">
                    <EditablePhrase
                      msgKey="dash.reveal"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.reveal"}
                      onSelect={selectKey}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    <EditablePhrase
                      msgKey="dash.dailyCap"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.dailyCap"}
                      onSelect={selectKey}
                    />{" "}
                    ·{" "}
                    <EditablePhrase
                      msgKey="dash.remainingToday"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.remainingToday"}
                      onSelect={selectKey}
                    />
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-full bg-primary py-3 text-center text-sm font-medium text-primary-fg">
                    <EditablePhrase
                      msgKey="dash.deposit"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.deposit"}
                      onSelect={selectKey}
                    />
                  </div>
                  <div className="rounded-full border border-border bg-surface-2 py-3 text-center text-sm font-medium">
                    <EditablePhrase
                      msgKey="dash.withdraw"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.withdraw"}
                      onSelect={selectKey}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <p className="font-display text-lg font-semibold">
                    <EditablePhrase
                      msgKey="dash.lockTitle"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.lockTitle"}
                      onSelect={selectKey}
                    />
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <EditablePhrase
                      msgKey="dash.lockHint"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.lockHint"}
                      onSelect={selectKey}
                    />
                  </p>
                  <div className="mt-3 rounded-full border border-border bg-surface-2 py-2 text-center text-sm">
                    <EditablePhrase
                      msgKey="dash.lockWithdrawals"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.lockWithdrawals"}
                      onSelect={selectKey}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-display text-lg font-semibold">
                    <EditablePhrase
                      msgKey="dash.activity"
                      map={draft}
                      english={english}
                      selected={selectedKey === "dash.activity"}
                      onSelect={selectKey}
                    />
                  </p>
                  <p className="text-sm text-muted">
                    <EditablePhrase
                      msgKey="empty.noActivity"
                      map={draft}
                      english={english}
                      selected={selectedKey === "empty.noActivity"}
                      onSelect={selectKey}
                    />
                  </p>
                </div>
                <div className="flex justify-around border-t border-border pt-3 text-xs text-muted">
                  <EditablePhrase
                    msgKey="nav.home"
                    map={draft}
                    english={english}
                    selected={selectedKey === "nav.home"}
                    onSelect={selectKey}
                  />
                  <EditablePhrase
                    msgKey="nav.profile"
                    map={draft}
                    english={english}
                    selected={selectedKey === "nav.profile"}
                    onSelect={selectKey}
                  />
                  <EditablePhrase
                    msgKey="nav.signOut"
                    map={draft}
                    english={english}
                    selected={selectedKey === "nav.signOut"}
                    onSelect={selectKey}
                  />
                </div>
              </div>
            ) : null}

            {screen === "profile" || screen === "all" ? (
              <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-border bg-bg p-4">
                <p className="font-display text-2xl font-semibold">
                  <EditablePhrase
                    msgKey="profile.title"
                    map={draft}
                    english={english}
                    selected={selectedKey === "profile.title"}
                    onSelect={selectKey}
                  />
                </p>
                {[
                  "profile.changePassword",
                  "profile.changePin",
                  "profile.withdrawalNumber",
                  "profile.bankDetails",
                  "profile.email",
                  "profile.vaultLock",
                  "profile.sessions",
                  "profile.deleteAccount",
                ].map((k) => (
                  <div key={k} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium">
                    <EditablePhrase
                      msgKey={k}
                      map={draft}
                      english={english}
                      selected={selectedKey === k}
                      onSelect={selectKey}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {screen === "auth" || screen === "all" ? (
              <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-border bg-bg p-4">
                <p className="text-sm text-muted">
                  <EditablePhrase
                    msgKey="app.tagline"
                    map={draft}
                    english={english}
                    selected={selectedKey === "app.tagline"}
                    onSelect={selectKey}
                  />
                </p>
                <div className="rounded-full bg-primary py-3 text-center text-sm font-medium text-primary-fg">
                  <EditablePhrase
                    msgKey="auth.signIn"
                    map={draft}
                    english={english}
                    selected={selectedKey === "auth.signIn"}
                    onSelect={selectKey}
                  />
                </div>
                <div className="rounded-full border border-border py-3 text-center text-sm font-medium">
                  <EditablePhrase
                    msgKey="auth.signUp"
                    map={draft}
                    english={english}
                    selected={selectedKey === "auth.signUp"}
                    onSelect={selectKey}
                  />
                </div>
                <p className="text-sm">
                  <EditablePhrase
                    msgKey="auth.forgotPassword"
                    map={draft}
                    english={english}
                    selected={selectedKey === "auth.forgotPassword"}
                    onSelect={selectKey}
                  />
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted">
                  {["auth.email", "auth.password", "auth.phone", "auth.username"].map((k) => (
                    <EditablePhrase
                      key={k}
                      msgKey={k}
                      map={draft}
                      english={english}
                      selected={selectedKey === k}
                      onSelect={selectKey}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {screen === "all" ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {allKeysForScreen.map((k) => (
                  <li key={k}>
                    <EditablePhrase
                      msgKey={k}
                      map={draft}
                      english={english}
                      selected={selectedKey === k}
                      onSelect={selectKey}
                    />
                    <span className="ml-2 text-[10px] text-faint">{k}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>

        {/* Editor side panel */}
        <Card className="h-fit space-y-3 p-4 lg:sticky lg:top-20">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Edit phrase</p>
          {selectedKey ? (
            <>
              <p className="font-mono text-[11px] text-faint">{selectedKey}</p>
              <p className="text-sm text-muted">
                English: <span className="text-fg">{english[selectedKey] || (EN_CATALOG as Record<string, string>)[selectedKey]}</span>
              </p>
              <label className="block text-sm">
                Natural translation (whole line)
                <textarea
                  className="mt-1 min-h-[5rem] w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Full phrase as users should read it…"
                />
              </label>
              <Button type="button" className="w-full" onClick={applyLocalEdit}>
                Apply to preview
              </Button>
              <p className="text-xs text-muted">
                Apply updates the mock only. Use <strong>Save draft</strong> above to store all phrases, then{" "}
                <strong>Save &amp; deploy</strong> when Home + Profile + Sign-in are done.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Tap a phrase on the preview.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
