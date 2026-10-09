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
      phone: string | null;
    }>`
      update transactions
      set status = ${"success"}, completed_at = now()
      where reference = ${reference}
        and kind = ${"deposit"}
        and status = ${"pending"}
      returning id, user_id, status, gross_tambala, credited_tambala,
                platform_profit_tambala, payout_reserve_tambala, phone
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
            lifetime_deposited_tambala = lifetime_deposited_tambala + ${credited},
            updated_at = now()
        where user_id = ${txRow.user_id}
      `;

      // Referral commission is carved from platform profit only (not user credit or payout reserve).
      let referralCommission = 0;
      try {
        const { maybePayReferralCommission } = await import("./referral.server");
        referralCommission = await maybePayReferralCommission(tx, {
          depositorUserId: txRow.user_id,
          depositReference: reference,
          depositTxId: txRow.id,
          grossTambala: gross,
          availableProfitTambala: profit,
        });
      } catch {
        referralCommission = 0;
      }
      const netProfit = Math.max(0, profit - referralCommission);

      await tx`
        insert into platform_ledger (transaction_id, entry_type, amount_tambala)
        values
          (${txRow.id}, ${"deposit_gross"}, ${gross}),
          (${txRow.id}, ${"user_credit"}, ${credited}),
          (${txRow.id}, ${"platform_profit"}, ${netProfit}),
          (${txRow.id}, ${"payout_reserve"}, ${reserve})
      `;
      if (referralCommission > 0) {
        // already inserted referral_commission inside maybePayReferralCommission; keep net profit on tx row
        await tx`
          update transactions
          set platform_profit_tambala = ${netProfit}
          where id = ${txRow.id}
        `;
      }

      // Book net true profit into treasury (after referral carve-out).
      if (netProfit > 0) {
        await tx`
          insert into platform_treasury (id, balance_tambala, lifetime_in_tambala, updated_at)
          values (1, ${netProfit}, ${netProfit}, now())
          on conflict (id) do update set
            balance_tambala = platform_treasury.balance_tambala + ${netProfit},
            lifetime_in_tambala = platform_treasury.lifetime_in_tambala + ${netProfit},
            updated_at = now()
        `;
      }

      // If the payer number matches the registered withdraw number, mark it verified.
      if (txRow.phone) {
        await tx`
          update profiles
          set phone_verified_at = coalesce(phone_verified_at, now()),
              updated_at = now()
          where user_id = ${txRow.user_id}
            and phone = ${txRow.phone}
            and phone_verified_at is null
        `;
      }

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

/**
 * Re-check a pending deposit with PayChangu:
 * - success → credit (idempotent)
 * - failed / cancelled / expired → mark failed (clears stuck queue, no wallet credit)
 * - still pending / unknown → leave pending
 */
export async function resolvePendingDepositWithProvider(reference: string): Promise<{
  action: "credited" | "already_credited" | "marked_failed" | "still_pending" | "not_found" | "not_deposit";
  paychanguStatus?: string;
  message: string;
}> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    kind: string;
    status: string;
    user_id: string;
    gross_tambala: number;
  }>`
    select id, kind, status, user_id, gross_tambala from transactions
    where reference = ${reference} limit 1
  `;
  if (!rows.length) {
    return { action: "not_found", message: "No transaction with that reference." };
  }
  const row = rows[0];
  if (row.kind !== "deposit") {
    return { action: "not_deposit", message: "Reference is not a deposit." };
  }
  if (row.status === "success") {
    return { action: "already_credited", message: "Already credited." };
  }
  if (row.status !== "pending") {
    return {
      action: "still_pending",
      message: `Deposit is in status "${row.status}" — not pending.`,
    };
  }

  const { paychanguConfigured, demoPaymentsEnabled, verifyPayment } = await import("./paychangu.server");
  if (!paychanguConfigured()) {
    if (demoPaymentsEnabled()) {
      return {
        action: "still_pending",
        message: "PayChangu not configured (demo mode). Use demo confirm or wait for webhook.",
      };
    }
    return { action: "still_pending", message: "PayChangu is not configured." };
  }

  let v: { ok: boolean; amount: number; status: string };
  try {
    v = await verifyPayment(reference);
  } catch (err) {
    return {
      action: "still_pending",
      message: `Could not reach PayChangu: ${(err as Error).message}`,
    };
  }

  if (v.ok) {
    const verifiedTambala = await (async () => {
      const { kwachaToTambala } = await import("./money");
      return kwachaToTambala(v.amount);
    })();
    if (verifiedTambala > 0 && verifiedTambala !== asInt(row.gross_tambala)) {
      return {
        action: "still_pending",
        paychanguStatus: v.status,
        message: `PayChangu success but amount mismatch (provider ${v.amount} vs our record). Manual review required.`,
      };
    }
    const result = await creditDeposit(reference);
    return {
      action: result.already ? "already_credited" : "credited",
      paychanguStatus: v.status,
      message: result.already ? "Already credited." : "PayChangu success — wallet credited.",
    };
  }

  const st = (v.status || "").toLowerCase();
  const terminalFail = [
    "failed",
    "fail",
    "cancelled",
    "canceled",
    "expired",
    "rejected",
    "declined",
    "error",
  ].some((x) => st.includes(x));

  if (terminalFail) {
    await sql`
      update transactions
      set status = ${"failed"},
          note = case
            when note is null or note = '' then ${"Auto-closed: PayChangu status " + v.status}
            else note || ${" | Auto-closed: PayChangu status " + v.status}
          end,
          completed_at = now()
      where reference = ${reference} and status = ${"pending"}
    `;
    return {
      action: "marked_failed",
      paychanguStatus: v.status,
      message: `PayChangu reports "${v.status}" — deposit marked failed (no credit). Clears stuck pending.`,
    };
  }

  return {
    action: "still_pending",
    paychanguStatus: v.status,
    message: `PayChangu still shows "${v.status || "pending"}". Leave as pending until paid or failed.`,
  };
}
