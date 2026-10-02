import { getSql } from "@/lib/db";

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function creditDeposit(reference: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    user_id: string;
    status: string;
    gross_tambala: number;
    credited_tambala: number;
    platform_profit_tambala: number;
    payout_reserve_tambala: number;
  }>`select id, user_id, status, gross_tambala, credited_tambala, platform_profit_tambala, payout_reserve_tambala from transactions where reference = ${reference} limit 1`;
  const tx = rows[0];
  if (!tx) throw new Error("Deposit not found");
  if (tx.status === "success") {
    return {
      already: true as const,
      grossTambala: asInt(tx.gross_tambala),
      creditedTambala: asInt(tx.credited_tambala),
      feeTambala: asInt(tx.gross_tambala) - asInt(tx.credited_tambala),
    };
  }
  if (tx.status !== "pending") throw new Error("This deposit can no longer be completed");

  await sql`
    update transactions
    set status = ${"success"}, completed_at = now()
    where id = ${tx.id} and status = ${"pending"}
  `;
  await sql`
    update wallets
    set balance_tambala = balance_tambala + ${asInt(tx.credited_tambala)},
        payout_reserve_tambala = payout_reserve_tambala + ${asInt(tx.payout_reserve_tambala)},
        lifetime_deposited_tambala = lifetime_deposited_tambala + ${asInt(tx.gross_tambala)},
        updated_at = now()
    where user_id = ${tx.user_id}
  `;
  await sql`
    insert into platform_ledger (transaction_id, entry_type, amount_tambala)
    values
      (${tx.id}, ${"deposit_gross"}, ${asInt(tx.gross_tambala)}),
      (${tx.id}, ${"user_credit"}, ${asInt(tx.credited_tambala)}),
      (${tx.id}, ${"platform_profit"}, ${asInt(tx.platform_profit_tambala)}),
      (${tx.id}, ${"payout_reserve"}, ${asInt(tx.payout_reserve_tambala)})
  `;
  return {
    already: false as const,
    grossTambala: asInt(tx.gross_tambala),
    creditedTambala: asInt(tx.credited_tambala),
    feeTambala: asInt(tx.gross_tambala) - asInt(tx.credited_tambala),
  };
}
