import { getSql, withTransaction, type Sql } from "@/lib/db";

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type CreditResult = {
  already: boolean;
  grossTambala: number;
  creditedTambala: number;
  feeTambala: number;
};

/**
 * Atomically claim a pending deposit and credit the wallet + ledger.
 *
 * Uses `UPDATE … WHERE status = 'pending' RETURNING` so a concurrent
 * second caller finds nothing to credit. All three writes live in one
 * transaction: status flip, wallet bump, ledger rows.
 */
export async function creditDeposit(reference: string): Promise<CreditResult> {
  return withTransaction(async (tx) => {
    // Claim: only one concurrent caller can flip pending → success.
    const claimed = await tx<{
      id: number;
      user_id: string;
      status: string;
      gross_tambala: number;
      credited_tambala: number;
      platform_profit_tambala: number;
      payout_reserve_tambala: number;
    }>`
      update transactions
      set status = ${"success"}, completed_at = now()
      where reference = ${reference}
        and kind = ${"deposit"}
        and status = ${"pending"}
      returning id, user_id, status, gross_tambala, credited_tambala,
                platform_profit_tambala, payout_reserve_tambala
    `;

    if (claimed.length) {
      const txRow = claimed[0];
      const gross = asInt(txRow.gross_tambala);
      const credited = asInt(txRow.credited_tambala);
      const profit = asInt(txRow.platform_profit_tambala);
      const reserve = asInt(txRow.payout_reserve_tambala);

      await tx`
        update wallets
        set balance_tambala = balance_tambala + ${credited},
            payout_reserve_tambala = payout_reserve_tambala + ${reserve},
            lifetime_deposited_tambala = lifetime_deposited_tambala + ${gross},
            updated_at = now()
        where user_id = ${txRow.user_id}
      `;

      await tx`
        insert into platform_ledger (transaction_id, entry_type, amount_tambala)
        values
          (${txRow.id}, ${"deposit_gross"}, ${gross}),
          (${txRow.id}, ${"user_credit"}, ${credited}),
          (${txRow.id}, ${"platform_profit"}, ${profit}),
          (${txRow.id}, ${"payout_reserve"}, ${reserve})
      `;

      return {
        already: false as const,
        grossTambala: gross,
        creditedTambala: credited,
        feeTambala: gross - credited,
      };
    }

    // Already claimed (or never existed / wrong kind).
    const existing = await tx<{
      status: string;
      gross_tambala: number;
      credited_tambala: number;
    }>`
      select status, gross_tambala, credited_tambala
      from transactions
      where reference = ${reference} and kind = ${"deposit"}
      limit 1
    `;
    const row = existing[0];
    if (!row) throw new Error("Deposit not found");
    if (row.status === "success") {
      const gross = asInt(row.gross_tambala);
      const credited = asInt(row.credited_tambala);
      return {
        already: true as const,
        grossTambala: gross,
        creditedTambala: credited,
        feeTambala: gross - credited,
      };
    }
    throw new Error("This deposit can no longer be completed");
  });
}

export async function finalizeWithdrawalSuccess(
  tx: Sql,
  opts: { txId: number; amount: number; reserveShare: number },
): Promise<void> {
  await tx`
    update transactions
    set status = ${"success"}, completed_at = now()
    where id = ${opts.txId} and status in (${"pending"}, ${"processing"})
  `;
  await tx`
    insert into platform_ledger (transaction_id, entry_type, amount_tambala)
    values
      (${opts.txId}, ${"withdrawal"}, ${opts.amount}),
      (${opts.txId}, ${"payout_fee_used"}, ${opts.reserveShare})
  `;
}

export async function finalizeWithdrawalFailure(
  tx: Sql,
  opts: {
    txId: number;
    userId: string;
    amount: number;
    reserveShare: number;
    note: string;
  },
): Promise<void> {
  await tx`
    update wallets
    set balance_tambala = balance_tambala + ${opts.amount},
        lifetime_withdrawn_tambala = greatest(lifetime_withdrawn_tambala - ${opts.amount}, 0),
        payout_reserve_tambala = payout_reserve_tambala + ${opts.reserveShare},
        updated_at = now()
    where user_id = ${opts.userId}
  `;
  await tx`
    update transactions
    set status = ${"failed"}, note = ${opts.note}, completed_at = now()
    where id = ${opts.txId} and status in (${"pending"}, ${"processing"})
  `;
}

/** Lookup helper used by webhook verify path. */
export async function getDepositByReference(reference: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    user_id: string;
    status: string;
    gross_tambala: number;
    credited_tambala: number;
    kind: string;
  }>`
    select id, user_id, status, gross_tambala, credited_tambala, kind
    from transactions
    where reference = ${reference}
    limit 1
  `;
  return rows[0] ?? null;
}
