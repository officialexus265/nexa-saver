import type { Sql } from "@/lib/db";

export type KycStatus = "none" | "pending" | "verified" | "rejected";
export type KycIdType = "national_id" | "passport" | "drivers_license";

export const KYC_ID_TYPES: Array<{ value: KycIdType; label: string }> = [
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver’s licence" },
];

const THRESHOLD_KEY = "kyc_withdraw_threshold_kwacha";
const DEFAULT_THRESHOLD_KWACHA = 100_000;

export async function getKycWithdrawThresholdKwacha(sql: Sql): Promise<number> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${THRESHOLD_KEY} limit 1
    `;
    const n = Number(rows[0]?.value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  } catch {
    /* */
  }
  return DEFAULT_THRESHOLD_KWACHA;
}

export async function setKycWithdrawThresholdKwacha(sql: Sql, kwacha: number): Promise<number> {
  const v = Math.max(0, Math.floor(kwacha));
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${THRESHOLD_KEY}, ${String(v)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return v;
}

export function normalizeIdNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().slice(0, 40);
}

export async function getProfileKyc(sql: Sql, userId: string) {
  const rows = await sql<{
    kyc_status: string;
    kyc_id_type: string | null;
    kyc_id_number: string | null;
    kyc_id_name: string | null;
    kyc_submitted_at: Date | string | null;
    kyc_reviewed_at: Date | string | null;
    kyc_review_note: string | null;
  }>`
    select kyc_status, kyc_id_type, kyc_id_number, kyc_id_name,
           kyc_submitted_at, kyc_reviewed_at, kyc_review_note
    from profiles where user_id = ${userId} limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  const status = (r.kyc_status || "none") as KycStatus;
  return {
    status,
    idType: r.kyc_id_type as KycIdType | null,
    idNumberMasked: r.kyc_id_number
      ? r.kyc_id_number.length <= 4
        ? "****"
        : `${"*".repeat(Math.max(0, r.kyc_id_number.length - 4))}${r.kyc_id_number.slice(-4)}`
      : null,
    idName: r.kyc_id_name,
    submittedAt: r.kyc_submitted_at ? new Date(r.kyc_submitted_at).toISOString() : null,
    reviewedAt: r.kyc_reviewed_at ? new Date(r.kyc_reviewed_at).toISOString() : null,
    reviewNote: r.kyc_review_note,
  };
}

/** Block large withdrawals until verified. Pending still blocked above threshold. */
export async function assertKycAllowsWithdraw(
  sql: Sql,
  userId: string,
  amountKwacha: number,
): Promise<void> {
  const threshold = await getKycWithdrawThresholdKwacha(sql);
  if (amountKwacha < threshold) return;

  const rows = await sql<{ kyc_status: string }>`
    select kyc_status from profiles where user_id = ${userId} limit 1
  `;
  const status = (rows[0]?.kyc_status || "none") as KycStatus;
  if (status === "verified") return;

  if (status === "pending") {
    throw new Error(
      `Withdrawals of ${threshold.toLocaleString()} MWK or more need identity verification. Your details are under review — try a smaller amount or wait for approval.`,
    );
  }
  if (status === "rejected") {
    throw new Error(
      `Withdrawals of ${threshold.toLocaleString()} MWK or more need identity verification. Your previous submission was not accepted — update KYC in Profile and resubmit.`,
    );
  }
  throw new Error(
    `Withdrawals of ${threshold.toLocaleString()} MWK or more need a quick identity check. Open Profile → Identity (KYC), submit your ID details, then try again after approval.`,
  );
}
