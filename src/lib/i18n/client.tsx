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
  /** When true, uses draft maps injected by admin preview */
  previewMode: boolean;
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

  useEffect(() => {
    if (previewMap) {
      setMap({ ...EN_CATALOG, ...previewMap });
      if (previewLang) setLangState(previewLang);
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const langs = await listPublicLanguages();
        if (cancelled) return;
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
        if (code === "en") {
          setMap({ ...EN_CATALOG });
        } else {
          const pub = await getPublishedTranslations({ data: { lang: code } });
          if (!cancelled) setMap({ ...EN_CATALOG, ...pub });
        }
      } catch {
        if (!cancelled) setMap({ ...EN_CATALOG });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewMap, previewLang]);

  const setLang = useCallback(
    async (code: string) => {
      if (previewMode) return;
      const info = languages.find((l) => l.code === code);
      if (!info) return;
      if (!info.enabled && code !== "en") return;
      setLangState(code);
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {
        /* ignore */
      }
      if (code === "en") {
        setMap({ ...EN_CATALOG });
        return;
      }
      try {
        const pub = await getPublishedTranslations({ data: { lang: code } });
        setMap({ ...EN_CATALOG, ...pub });
      } catch {
        setMap({ ...EN_CATALOG });
      }
    },
    [languages, previewMode],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      return format(map[key] ?? en(key), vars);
    },
    [map],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, languages, ready, previewMode }),
    [lang, setLang, t, languages, ready, previewMode],
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
      languages: [{ code: "en", name: "English", enabled: true }],
      ready: true,
      previewMode: false,
    } satisfies I18nCtx;
  }
  return ctx;
}
