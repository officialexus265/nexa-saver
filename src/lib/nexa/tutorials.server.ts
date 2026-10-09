import type { Sql } from "@/lib/db";
import { parseYoutubeVideoId } from "./referral.server";

export type TutorialItem = {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
};

const SETTINGS_KEY = "tutorials_json";

export async function getTutorials(sql: Sql): Promise<TutorialItem[]> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${SETTINGS_KEY} limit 1
    `;
    if (!rows[0]?.value) return [];
    const parsed = JSON.parse(rows[0].value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row, i) => {
        const r = row as Record<string, unknown>;
        const youtubeId = String(r.youtubeId || r.youtube_id || "").trim();
        if (!youtubeId) return null;
        return {
          id: String(r.id || `t${i}`),
          title: String(r.title || "Tutorial").slice(0, 120),
          description: String(r.description || "").slice(0, 300),
          youtubeId,
        };
      })
      .filter(Boolean) as TutorialItem[];
  } catch {
    return [];
  }
}

export async function setTutorials(
  sql: Sql,
  items: Array<{ title: string; description?: string; urlOrId: string }>,
): Promise<TutorialItem[]> {
  const out: TutorialItem[] = [];
  for (let i = 0; i < items.length && out.length < 12; i++) {
    const it = items[i]!;
    const youtubeId = parseYoutubeVideoId(it.urlOrId.trim());
    if (!youtubeId) continue;
    out.push({
      id: `tut_${i}_${youtubeId.slice(0, 8)}`,
      title: (it.title || `Tutorial ${i + 1}`).trim().slice(0, 120),
      description: (it.description || "").trim().slice(0, 300),
      youtubeId,
    });
  }
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${SETTINGS_KEY}, ${JSON.stringify(out)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return out;
}
