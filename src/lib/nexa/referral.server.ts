import type { Sql } from "@/lib/db";

/** Accept full YouTube URL or bare video id. */
export function parseYoutubeVideoId(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const embed = parts.indexOf("embed");
      if (embed >= 0 && parts[embed + 1]) return parts[embed + 1];
      const shorts = parts.indexOf("shorts");
      if (shorts >= 0 && parts[shorts + 1]) return parts[shorts + 1];
    }
  } catch {
    /* not a url */
  }
  return null;
}

export async function getSignupIntroYoutubeId(sql: Sql): Promise<string | null> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${"signup_intro_youtube"} limit 1
    `;
    return parseYoutubeVideoId(rows[0]?.value ?? "");
  } catch {
    return null;
  }
}


export async function isReferralProgramEnabled(sql: Sql): Promise<boolean> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${"referral_program_enabled"} limit 1
    `;
    return (rows[0]?.value ?? "true").toLowerCase() !== "false";
  } catch {
    return true;
  }
}

export async function getReferralRates(sql: Sql): Promise<{
  commissionRate: number;
  withdrawMinKwacha: number;
  withdrawFeeRate: number;
}> {
  const read = async (key: string, fallback: number) => {
    try {
      const rows = await sql<{ value: string }>`select value from platform_settings where key = ${key} limit 1`;
      const n = Number(rows[0]?.value);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    commissionRate: await read("referral_commission_rate", 0.01),
    withdrawMinKwacha: await read("referral_withdraw_min_kwacha", 500),
    withdrawFeeRate: await read("referral_withdraw_fee_rate", 0.03),
  };
}

export async function getOgSettings(sql: Sql): Promise<{
  share: { title: string; description: string; image: string };
  referral: { title: string; description: string; image: string };
}> {
  const g = async (key: string, fb: string) => {
    try {
      const rows = await sql<{ value: string }>`select value from platform_settings where key = ${key} limit 1`;
      return rows[0]?.value || fb;
    } catch {
      return fb;
    }
  };
  return {
    share: {
      title: await g("og_share_title", "NEXA-SAVER — save with confidence"),
      description: await g("og_share_description", "A simple vault for Malawi."),
      image: await g("og_share_image", "/og.jpg"),
    },
    referral: {
      title: await g("og_referral_title", "Join me on NEXA-SAVER"),
      description: await g("og_referral_description", "Open your vault with my invite."),
      image: await g("og_referral_image", "/og.jpg"),
    },
  };
}

export function generateAffiliateCode(username: string): string {
  const base = username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "NEXA";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${suffix}`;
}

/**
 * Pay referral commission from the deposit's platform-profit slice (not from the user credit,
 * not on top of full profit). Reserve is left untouched.
 *
 * commission = min(gross * rate, availableProfit)
 * → affiliate wallet
 * → reduce platform_treasury and transactions.platform_profit_tambala
 * → ledger entry referral_commission
 */
export async function maybePayReferralCommission(
  tx: Sql,
  opts: {
    depositorUserId: string;
    depositReference: string;
    depositTxId: number;
    grossTambala: number;
    availableProfitTambala: number;
  },
): Promise<number> {
  const enabled = await isReferralProgramEnabled(tx);
  if (!enabled) return 0;

  const prof = await tx<{
    referred_by_user_id: string | null;
    first_deposit_referral_paid: boolean;
  }>`
    select referred_by_user_id, first_deposit_referral_paid
    from profiles where user_id = ${opts.depositorUserId} limit 1
  `;
  const p = prof[0];
  if (!p?.referred_by_user_id || p.first_deposit_referral_paid) return 0;

  const rates = await getReferralRates(tx);
  let commission = Math.floor(opts.grossTambala * rates.commissionRate);
  // Never take more than booked platform profit — reserve stays intact.
  commission = Math.min(commission, Math.max(0, opts.availableProfitTambala));
  if (commission <= 0) {
    await tx`
      update profiles set first_deposit_referral_paid = true, updated_at = now()
      where user_id = ${opts.depositorUserId}
    `;
    return 0;
  }

  try {
    await tx`
      insert into affiliate_earnings (
        affiliate_user_id, from_user_id, deposit_reference,
        gross_deposit_tambala, commission_tambala
      ) values (
        ${p.referred_by_user_id}, ${opts.depositorUserId}, ${opts.depositReference},
        ${opts.grossTambala}, ${commission}
      )
    `;
  } catch {
    await tx`
      update profiles set first_deposit_referral_paid = true, updated_at = now()
      where user_id = ${opts.depositorUserId}
    `;
    return 0;
  }

  await tx`
    insert into affiliate_wallets (user_id, balance_tambala, lifetime_earned_tambala, updated_at)
    values (${p.referred_by_user_id}, ${commission}, ${commission}, now())
    on conflict (user_id) do update set
      balance_tambala = affiliate_wallets.balance_tambala + ${commission},
      lifetime_earned_tambala = affiliate_wallets.lifetime_earned_tambala + ${commission},
      updated_at = now()
  `;

  await tx`
    insert into platform_ledger (transaction_id, entry_type, amount_tambala)
    values (${opts.depositTxId}, ${"referral_commission"}, ${commission})
  `;

  await tx`
    update profiles set first_deposit_referral_paid = true, updated_at = now()
    where user_id = ${opts.depositorUserId}
  `;
  return commission;
}
