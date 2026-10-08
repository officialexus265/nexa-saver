import type { Sql } from "@/lib/db";

export type SendFeeTier = {
  minKwacha: number;
  /** null = no upper bound */
  maxKwacha: number | null;
  feeKwacha: number;
};

export const DEFAULT_SEND_FEE_TIERS: SendFeeTier[] = [
  { minKwacha: 100, maxKwacha: 14999, feeKwacha: 10 },
  { minKwacha: 15000, maxKwacha: 49999, feeKwacha: 30 },
  { minKwacha: 50000, maxKwacha: 99999, feeKwacha: 50 },
  { minKwacha: 100000, maxKwacha: null, feeKwacha: 100 },
];

const KEY = "send_fee_tiers";

export async function getSendFeeTiers(sql: Sql): Promise<SendFeeTier[]> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${KEY} limit 1
    `;
    if (!rows[0]?.value) return DEFAULT_SEND_FEE_TIERS;
    const parsed = JSON.parse(rows[0].value) as SendFeeTier[];
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_SEND_FEE_TIERS;
    return parsed.map((t) => ({
      minKwacha: Number(t.minKwacha) || 0,
      maxKwacha: t.maxKwacha == null ? null : Number(t.maxKwacha),
      feeKwacha: Math.max(0, Number(t.feeKwacha) || 0),
    }));
  } catch {
    return DEFAULT_SEND_FEE_TIERS;
  }
}

export async function setSendFeeTiers(sql: Sql, tiers: SendFeeTier[]): Promise<SendFeeTier[]> {
  const cleaned = tiers
    .map((t) => ({
      minKwacha: Math.max(0, Math.floor(Number(t.minKwacha) || 0)),
      maxKwacha: t.maxKwacha == null || t.maxKwacha === "" as never ? null : Math.floor(Number(t.maxKwacha)),
      feeKwacha: Math.max(0, Math.floor(Number(t.feeKwacha) || 0)),
    }))
    .sort((a, b) => a.minKwacha - b.minKwacha);
  if (!cleaned.length) throw new Error("Add at least one fee tier.");
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${KEY}, ${JSON.stringify(cleaned)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return cleaned;
}

/** Fee in kwacha for a send amount in kwacha. */
export function feeForSendAmount(amountKwacha: number, tiers: SendFeeTiers[]): number {
  const a = Math.floor(amountKwacha);
  for (const t of tiers) {
    if (a < t.minKwacha) continue;
    if (t.maxKwacha == null || a <= t.maxKwacha) return t.feeKwacha;
  }
  // above all defined max → use last tier if open-ended, else 0
  const last = tiers[tiers.length - 1];
  if (last && last.maxKwacha == null && a >= last.minKwacha) return last.feeKwacha;
  return 0;
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return "***";
  return `${d.slice(0, 2)}***${d.slice(-3)}`;
}
