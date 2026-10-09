import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { EN_CATALOG, en } from "./catalog-en";
import { getPublishedTranslations, listPublicLanguages } from "@/lib/nexa/fns";

type LangInfo = { code: string; name: string; enabled: boolean; isDefault?: boolean };

type I18nCtx = {
  lang: string;
  setLang: (code: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  languages: LangInfo[];
  ready: boolean;
  previewMode: boolean;
  /** Force re-fetch published maps + language list (after admin deploy). */
  refresh: () => Promise<void>;
};

const Ctx = createContext<I18nCtx | null>(null);
const STORAGE_KEY = "nexa-lang";

function format(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

async function loadLangMap(code: string): Promise<Record<string, string>> {
  if (code === "en") return { ...EN_CATALOG };
  try {
    const pub = await getPublishedTranslations({ data: { lang: code } });
    // Published overlays English so missing keys still show English.
    return { ...EN_CATALOG, ...(pub || {}) };
  } catch {
    return { ...EN_CATALOG };
  }
}

export function I18nProvider({
  children,
  previewMap,
  previewLang,
}: {
  children: React.ReactNode;
  previewMap?: Record<string, string>;
  previewLang?: string;
}) {
  const [lang, setLangState] = useState("en");
  const [map, setMap] = useState<Record<string, string>>({ ...EN_CATALOG });
  const [languages, setLanguages] = useState<LangInfo[]>([
    { code: "en", name: "English", enabled: true, isDefault: true },
  ]);
  const [ready, setReady] = useState(false);
  const previewMode = Boolean(previewMap);

  const bootstrap = useCallback(async () => {
    if (previewMap) {
      setMap({ ...EN_CATALOG, ...previewMap });
      if (previewLang) setLangState(previewLang);
      setReady(true);
      return;
    }
    try {
      const langs = await listPublicLanguages();
      setLanguages(langs);
      let preferred = "en";
      try {
        preferred = localStorage.getItem(STORAGE_KEY) || "en";
      } catch {
        preferred = "en";
      }
      const allowed = langs.find((l) => l.code === preferred && (l.enabled || l.code === "en"));
      const code = allowed ? preferred : "en";
      setLangState(code);
      setMap(await loadLangMap(code));
    } catch {
      setMap({ ...EN_CATALOG });
    } finally {
      setReady(true);
    }
  }, [previewMap, previewLang]);

  useEffect(() => {
    let cancelled = false;
    void bootstrap().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  const setLang = useCallback(
    async (code: string) => {
      if (previewMode) {
        setLangState(code);
        return;
      }
      try {
        // Re-fetch list so a language just enabled after publish is selectable.
        const langs = await listPublicLanguages();
        setLanguages(langs);
        const allowed = langs.find((l) => l.code === code && (l.enabled || l.code === "en"));
        if (!allowed && code !== "en") {
          // Not live yet — stay on current / fall back to en.
          return;
        }
        try {
          localStorage.setItem(STORAGE_KEY, code);
        } catch {
          /* ignore */
        }
        setLangState(code);
        setMap(await loadLangMap(code));
      } catch {
        setLangState("en");
        setMap({ ...EN_CATALOG });
      }
    },
    [previewMode],
  );

  const refresh = useCallback(async () => {
    await bootstrap();
  }, [bootstrap]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = map[key] ?? en(key);
      return format(raw, vars);
    },
    [map],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, languages, ready, previewMode, refresh }),
    [lang, setLang, t, languages, ready, previewMode, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      lang: "en",
      setLang: () => undefined,
      t: (key: string, vars?: Record<string, string | number>) => format(en(key), vars),
      languages: [{ code: "en", name: "English", enabled: true, isDefault: true }],
      ready: true,
      previewMode: false,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
