import type { Sql } from "@/lib/db";
import { APP_NAME, BANK_FLAT_FEE_KWACHA } from "./constants";
import { getFeePolicy } from "./fee-policy.server";

export type LegalDocKind = "terms" | "privacy";

export const LEGAL_PLACEHOLDERS: Array<{ key: string; label: string; example: string }> = [
  { key: "deposit_fee_percent", label: "Deposit fee %", example: "6" },
  { key: "early_unlock_percent", label: "Early unlock fee %", example: "3" },
  { key: "early_unlock_cap_percent", label: "Early unlock cap %", example: "3" },
  { key: "bank_flat_mwk", label: "Bank flat fee (MWK)", example: "700" },
  { key: "app_name", label: "App name", example: "NEXA-SAVER" },
  { key: "support_phone", label: "Support phone", example: "099…" },
  { key: "referral_commission_percent", label: "Referral commission %", example: "1" },
];

const KEYS: Record<LegalDocKind, string> = {
  terms: "legal_terms_body",
  privacy: "legal_privacy_body",
};

export function defaultTermsBody(): string {
  return `Last updated: {{app_name}} platform. Fee figures in {{brackets}} update automatically from admin settings.

## 1. Who we are
{{app_name}} is a private digital savings vault. It is not a bank and does not take deposits under a banking licence. Balances are recorded on our ledger; collection and payout of mobile money and bank transfers are processed by independent payment partners (including PayChangu).

## 2. Eligibility
You must be at least 18 years old, provide accurate identity details, and use a phone number and email you control. One person may not open multiple accounts to evade limits, holds, or security rules.

## 3. Account security
You are responsible for your password, withdrawal PIN, security question, passkeys/hardware keys, and device access. We never ask for your PIN by email or SMS. Sessions expire after long inactivity.

## 4. Deposits
When you deposit, the platform may deduct a fee of {{deposit_fee_percent}}% of the amount you send. The remainder is credited to your vault. Exact splits and partner rails may vary; the live rate is always controlled in platform settings.

## 5. Withdrawals
Withdrawals return to your verified mobile number or registered bank details, subject to daily limits, verification holds, and any voluntary or platform locks. Bank payouts may include a channel flat fee of about {{bank_flat_mwk}} MWK charged by the bank rail (not a separate {{app_name}} percentage on top of that flat). Mobile money pricing follows the payment partner.

## 6. Voluntary withdrawal locks
You may lock withdrawals for a chosen period (within platform limits). After a cooling-off window you can cancel free; later, early unlock may cost a fee based on remaining time, capped at about {{early_unlock_cap_percent}}% of balance (base rate about {{early_unlock_percent}}%). Platform (admin) withdrawal locks are separate and only the operator can clear them.

## 7. Sending money
Peer-to-peer sends credit the recipient’s received bag. Fixed send fees may apply as configured by the operator. Reversal requests follow platform process and may freeze disputed amounts.

## 8. Loans and referrals
Loan and referral features, if enabled, follow the rules shown in the app and these terms. Referral commission on a friend’s first deposit (when the program is on) is about {{referral_commission_percent}}% and is taken from the platform fee slice, not from the friend’s credited vault balance beyond normal deposit fees.

## 9. Support
For large limits, locked withdrawals, or disputes, contact support on {{support_phone}} (or the numbers listed in the in-app help menu).

## 10. Changes
We may update these terms. Continued use after changes means you accept the updated version. Live fee placeholders always reflect current admin configuration.`;
}

export function defaultPrivacyBody(): string {
  return `Last updated: {{app_name}} platform.

## 1. Data we collect
We collect account details you provide (name, email, phone, date of birth, gender), security credentials (stored as hashes where applicable), transaction and device metadata needed to run the vault, and support communications.

## 2. How we use data
We use data to operate deposits and withdrawals, prevent fraud, enforce limits and locks, send security alerts, and improve the service. We do not sell your personal data.

## 3. Payment partners
Mobile money and bank payouts are handled by partners such as PayChangu. Their processing is subject to their own terms and privacy notices.

## 4. Security
We use encryption in transit, hashed secrets, optional passkeys, admin 2FA, and operational controls. No method is perfect; protect your password and devices.

## 5. Retention
We keep records as needed for the service, dispute resolution, and legal obligations. You may request account closure subject to outstanding balances and investigations.

## 6. Contact
Privacy questions: support on {{support_phone}} or via in-app help.

Fee-related figures that appear in product terms (for example deposit fee about {{deposit_fee_percent}}%) are configuration values, not marketing claims about third-party bank pricing.`;
}

export async function getLegalDocRaw(sql: Sql, kind: LegalDocKind): Promise<string> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${KEYS[kind]} limit 1
    `;
    if (rows[0]?.value && rows[0].value.trim()) return rows[0].value;
  } catch {
    /* missing */
  }
  return kind === "terms" ? defaultTermsBody() : defaultPrivacyBody();
}

export async function setLegalDoc(sql: Sql, kind: LegalDocKind, body: string): Promise<void> {
  const text = body.slice(0, 200_000);
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${KEYS[kind]}, ${text}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function buildPlaceholderMap(sql: Sql): Promise<Record<string, string>> {
  const fees = await getFeePolicy(sql);
  let support = "the platform support number";
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${"support_phone"} limit 1
    `;
    if (rows[0]?.value?.trim()) support = rows[0].value.trim();
  } catch {
    /* */
  }
  let referralPct = "1";
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${"referral_commission_rate"} limit 1
    `;
    if (rows[0]?.value) {
      const n = Number(rows[0].value);
      if (Number.isFinite(n)) referralPct = (n <= 1 ? n * 100 : n).toFixed(n % 1 ? 1 : 0);
    }
  } catch {
    /* */
  }

  return {
    deposit_fee_percent: (fees.depositFeeRate * 100).toFixed(fees.depositFeeRate * 100 % 1 ? 1 : 0),
    early_unlock_percent: (fees.earlyUnlockBaseRate * 100).toFixed(fees.earlyUnlockBaseRate * 100 % 1 ? 1 : 0),
    early_unlock_cap_percent: (fees.earlyUnlockCapRate * 100).toFixed(fees.earlyUnlockCapRate * 100 % 1 ? 1 : 0),
    bank_flat_mwk: String(BANK_FLAT_FEE_KWACHA),
    app_name: APP_NAME,
    support_phone: support,
    referral_commission_percent: referralPct,
  };
}

/** Replace {{key}} with live values. Unknown keys left as-is. */
export function resolveLegalPlaceholders(body: string, map: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const k = key.toLowerCase();
    return map[k] != null ? map[k]! : `{{${key}}}`;
  });
}

export async function getResolvedLegalDoc(sql: Sql, kind: LegalDocKind): Promise<{ body: string; map: Record<string, string> }> {
  const raw = await getLegalDocRaw(sql, kind);
  const map = await buildPlaceholderMap(sql);
  return { body: resolveLegalPlaceholders(raw, map), map };
}
