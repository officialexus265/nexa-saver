import type { Sql } from "@/lib/db";
import { ALL_MESSAGE_KEYS, EN_CATALOG, en } from "./catalog-en";

export type LangRow = {
  code: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
};

export async function listLanguages(sql: Sql): Promise<LangRow[]> {
  try {
    const rows = await sql<{ code: string; name: string; enabled: boolean; is_default: boolean }>`
      select code, name, enabled, is_default from app_languages order by is_default desc, name asc
    `;
    if (!rows.length) {
      return [
        { code: "en", name: "English", enabled: true, isDefault: true },
        { code: "ny", name: "Chichewa", enabled: false, isDefault: false },
      ];
    }
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      enabled: Boolean(r.enabled),
      isDefault: Boolean(r.is_default),
    }));
  } catch {
    return [
      { code: "en", name: "English", enabled: true, isDefault: true },
      { code: "ny", name: "Chichewa", enabled: false, isDefault: false },
    ];
  }
}

export async function addLanguage(sql: Sql, code: string, name: string): Promise<void> {
  const c = code.trim().toLowerCase().slice(0, 12);
  if (!/^[a-z]{2,8}$/.test(c)) throw new Error("Language code must be 2–8 letters (e.g. ny, pt, fr).");
  if (c === "en") throw new Error("English is built-in.");
  await sql`
    insert into app_languages (code, name, enabled, is_default)
    values (${c}, ${name.trim().slice(0, 80)}, ${false}, ${false})
    on conflict (code) do update set name = excluded.name, updated_at = now()
  `;
}

export async function setLanguageEnabled(sql: Sql, code: string, enabled: boolean): Promise<void> {
  if (code === "en") throw new Error("English stays enabled.");
  await sql`
    update app_languages set enabled = ${enabled}, updated_at = now() where code = ${code}
  `;
}

/** Published map for a language (fallback en). */
export async function getPublishedMap(sql: Sql, lang: string): Promise<Record<string, string>> {
  if (lang === "en") return { ...EN_CATALOG };
  const map: Record<string, string> = { ...EN_CATALOG };
  try {
    const rows = await sql<{ msg_key: string; published_value: string | null }>`
      select msg_key, published_value from app_translations
      where lang_code = ${lang} and published_value is not null and published_value <> ''
    `;
    for (const r of rows) {
      if (r.published_value) map[r.msg_key] = r.published_value;
    }
  } catch {
    /* table missing */
  }
  return map;
}

/** Draft preferred, else published, else en — for admin studio. */
export async function getDraftMap(sql: Sql, lang: string): Promise<Record<string, string>> {
  if (lang === "en") return { ...EN_CATALOG };
  const map: Record<string, string> = { ...EN_CATALOG };
  try {
    const rows = await sql<{ msg_key: string; draft_value: string | null; published_value: string | null }>`
      select msg_key, draft_value, published_value from app_translations where lang_code = ${lang}
    `;
    for (const r of rows) {
      const v = (r.draft_value && r.draft_value.length ? r.draft_value : r.published_value) || "";
      if (v) map[r.msg_key] = v;
    }
  } catch {
    /* no table yet — return English catalog as starting point */
  }
  return map;
}

export async function saveDraft(
  sql: Sql,
  lang: string,
  entries: Record<string, string>,
): Promise<number> {
  if (lang === "en") throw new Error("Edit other languages; English is the source catalog.");
  let n = 0;
  try {
    for (const [key, value] of Object.entries(entries)) {
      void ALL_MESSAGE_KEYS;
      const v = value ?? "";
      await sql`
        insert into app_translations (lang_code, msg_key, draft_value, updated_at)
        values (${lang}, ${key}, ${v}, now())
        on conflict (lang_code, msg_key) do update set
          draft_value = excluded.draft_value,
          updated_at = now()
      `;
      n++;
    }
    return n;
  } catch {
    throw new Error(
      "Could not save translations. Redeploy so database migration 0022 (app_languages / app_translations) runs, then try again.",
    );
  }
}

export async function publishLanguage(sql: Sql, lang: string): Promise<number> {
  if (lang === "en") throw new Error("English is always live from the catalog.");
  try {
    await sql`
      update app_translations
      set published_value = draft_value,
          published_at = now(),
          updated_at = now()
      where lang_code = ${lang}
        and draft_value is not null
        and draft_value <> ''
    `;
    const count = await sql<{ n: number }>`
      select count(*)::int as n from app_translations
      where lang_code = ${lang} and published_value is not null and published_value <> ''
    `;
    return Number(count[0]?.n ?? 0);
  } catch {
    throw new Error(
      "Could not publish translations. Redeploy so migration 0022 runs, then try again.",
    );
  }
}

export function translateKey(
  map: Record<string, string>,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let s = map[key] ?? en(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}
