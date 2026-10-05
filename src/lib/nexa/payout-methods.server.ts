import type { Sql } from "@/lib/db";

export type PayoutMethods = {
  momo: boolean;
  bank: boolean;
};

const KEY_MOMO = "payout_momo_enabled";
const KEY_BANK = "payout_bank_enabled";

export async function getPayoutMethods(sql: Sql): Promise<PayoutMethods> {
  const rows = await sql<{ key: string; value: string }>`
    select key, value from platform_settings
    where key in (${KEY_MOMO}, ${KEY_BANK})
  `;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // Default both on when unset (backward compatible).
  return {
    momo: map[KEY_MOMO] !== "false",
    bank: map[KEY_BANK] !== "false",
  };
}

export async function setPayoutMethods(
  sql: Sql,
  methods: PayoutMethods,
): Promise<void> {
  if (!methods.momo && !methods.bank) {
    throw new Error("At least one payout method must stay enabled.");
  }
  await sql`
    insert into platform_settings (key, value, updated_at)
    values
      (${KEY_MOMO}, ${methods.momo ? "true" : "false"}, now()),
      (${KEY_BANK}, ${methods.bank ? "true" : "false"}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export function assertMethodAllowed(methods: PayoutMethods, method: "momo" | "bank"): void {
  if (method === "momo" && !methods.momo) {
    throw new Error("Mobile money withdrawals are turned off by the platform right now.");
  }
  if (method === "bank" && !methods.bank) {
    throw new Error("Bank withdrawals are turned off by the platform right now.");
  }
}
