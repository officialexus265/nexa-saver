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
} from "@/lib/nexa/fns";
import { ALL_MESSAGE_KEYS, EN_CATALOG } from "@/lib/i18n/catalog-en";

type Lang = { code: string; name: string; enabled: boolean; isDefault?: boolean };

/**
 * Sequential phrase-by-phrase translation wizard.
 * 1) Pick or create language
 * 2) One phrase at a time → draft+continue / skip / save for now / publish
 */
export function TranslationStudio() {
  const [step, setStep] = useState<"pick" | "translate">("pick");
  const [langs, setLangs] = useState<Lang[]>([]);
  const [lang, setLang] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [english, setEnglish] = useState<Record<string, string>>({ ...EN_CATALOG });
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const keys = useMemo(() => [...ALL_MESSAGE_KEYS], []);
  const total = keys.length;
  const currentKey = keys[index] ?? null;
  const source = currentKey ? english[currentKey] ?? (EN_CATALOG as Record<string, string>)[currentKey] ?? currentKey : "";

  const loadLangs = useCallback(async () => {
    try {
      const list = await adminListLanguages();
      setLangs(list);
    } catch (e) {
      setErr(errMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadLangs();
  }, [loadLangs]);

  async function startLanguage(code: string) {
    if (code === "en") {
      setErr("English is the source catalog — pick another language to translate into.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await adminGetTranslationDraft({ data: { lang: code } });
      setDraft(res.draft || {});
      setEnglish(res.english || { ...EN_CATALOG });
      setLang(code);
      // Resume at first untranslated key
      const startAt = keys.findIndex((k) => !(res.draft?.[k] || "").trim());
      setIndex(startAt >= 0 ? startAt : 0);
      const k = keys[startAt >= 0 ? startAt : 0]!;
      setValue((res.draft?.[k] || "").trim() || "");
      setStep("translate");
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function createLanguage() {
    setBusy(true);
    setErr(null);
    try {
      await adminAddLanguage({ data: { code: newCode.trim().toLowerCase(), name: newName.trim() } });
      await loadLangs();
      setShowCreate(false);
      await startLanguage(newCode.trim().toLowerCase());
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function goTo(i: number, map: Record<string, string> = draft) {
    const next = Math.max(0, Math.min(total - 1, i));
    setIndex(next);
    const k = keys[next];
    setValue(k ? (map[k] || "").trim() : "");
  }

  /** Save only the given entries (usually one key) to draft — does not re-upload the whole catalog. */
  async function saveEntries(entries: Record<string, string>) {
    if (!lang || !Object.keys(entries).length) return;
    setBusy(true);
    setErr(null);
    try {
      await adminSaveTranslationDraft({ data: { lang, entries } });
    } catch (e) {
      setErr(errMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  /** Save current phrase to draft only, then advance. */
  async function saveDraftAndContinue() {
    if (!lang || !currentKey) return;
    const trimmed = value.trim();
    const nextMap = { ...draft, [currentKey]: trimmed };
    setDraft(nextMap);
    try {
      // Only this phrase — not every key again
      await saveEntries({ [currentKey]: trimmed });
      setMsg(null);
      if (index + 1 < total) goTo(index + 1, nextMap);
      else setMsg("All phrases reviewed. Publish when ready, or Save for now.");
    } catch {
      /* err set */
    }
  }

  function skip() {
    setMsg(null);
    if (index + 1 < total) goTo(index + 1);
    else setMsg("End of list. Publish when ready, or Save for now.");
  }

  function goPrev() {
    setMsg(null);
    if (index > 0) goTo(index - 1);
  }

  /** Save current phrase (if any), keep draft, leave studio. */
  async function saveForNow() {
    if (!lang) return;
    try {
      if (currentKey) {
        const trimmed = value.trim();
        const nextMap = { ...draft, [currentKey]: trimmed };
        setDraft(nextMap);
        await saveEntries({ [currentKey]: trimmed });
      }
      setStep("pick");
      setLang(null);
      setMsg("Draft saved. You can continue later.");
    } catch {
      /* err set */
    }
  }

  /** Publish all draft (plus current phrase) and enable language. */
  async function publishNow() {
    if (!lang) return;
    const nextMap = currentKey ? { ...draft, [currentKey]: value.trim() } : { ...draft };
    setDraft(nextMap);
    setBusy(true);
    setErr(null);
    try {
      // Include current phrase in this publish only
      const entries =
        currentKey && value.trim()
          ? { [currentKey]: value.trim() }
          : undefined;
      const r = await adminPublishTranslations({
        data: { lang, entries, enable: true },
      });
      setMsg(`Published ${r.published} phrases. Language is live.`);
      setStep("pick");
      setLang(null);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === "pick") {
    return (
      <Card className="mx-auto max-w-lg space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Translate</h2>
          <p className="text-sm text-muted">Choose a language, then translate one phrase at a time.</p>
        </div>
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        {msg ? <p className="text-sm text-primary">{msg}</p> : null}
        <ul className="overflow-hidden rounded-xl border border-border">
          {langs
            .filter((l) => l.code !== "en")
            .map((l, i, arr) => (
              <li key={l.code} className={i > 0 ? "border-t border-border" : undefined}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startLanguage(l.code)}
                  className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150 hover:bg-primary/10 active:bg-primary/15 disabled:opacity-60"
                >
                  <span>
                    <span className="font-medium text-fg transition-colors group-hover:text-primary">
                      {l.name}
                    </span>
                    <span className="ml-2 text-xs text-muted">{l.code}</span>
                  </span>
                  <span className="text-xs text-muted transition-colors group-hover:text-primary">
                    {l.enabled ? "Live" : "Draft"} →
                  </span>
                </button>
              </li>
            ))}
        </ul>
        {!showCreate ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full transition-colors duration-150 hover:border-primary/40 hover:bg-primary/10 hover:text-fg"
            onClick={() => setShowCreate(true)}
          >
            Create a new language
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="space-y-1">
              <Label>Code (e.g. ny, pt)</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8))} />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Chichewa" />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={busy || newCode.length < 2 || newName.trim().length < 2}
                onClick={() => void createLanguage()}
              >
                Create & start
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{lang}</p>
          <h2 className="font-display text-lg font-semibold">Translate this phrase</h2>
          <p className="text-xs text-muted">
            Phrase {index + 1} of {total}
            {currentKey ? ` · ${currentKey}` : ""}
          </p>
        </div>
        <Button type="button" variant="secondary" className="h-8 shrink-0 text-xs" onClick={() => void saveForNow()}>
          Save for now
        </Button>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${total ? ((index + 1) / total) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-1 rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-xs font-medium uppercase text-muted">English</p>
        <p className="text-sm text-fg">{source}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tr-val">Your translation</Label>
        <textarea
          id="tr-val"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Type the translation…"
        />
      </div>

      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          loading={busy}
          onClick={() => void saveDraftAndContinue()}
        >
          Save as draft and continue
        </Button>
        <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={skip}>
          Skip
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={busy || index <= 0}
          onClick={goPrev}
        >
          Prev
        </Button>
        <Button type="button" className="w-full" disabled={busy} loading={busy} onClick={() => void publishNow()}>
          Publish
        </Button>
      </div>
    </Card>
  );
}
