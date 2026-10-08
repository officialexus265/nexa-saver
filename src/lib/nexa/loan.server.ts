import type { Sql } from "@/lib/db";

export async function getLoanInterestRate(sql: Sql): Promise<number> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${"loan_interest_monthly"} limit 1
    `;
    const n = Number(rows[0]?.value);
    if (Number.isFinite(n) && n >= 0 && n <= 0.5) return n;
  } catch {
    /* ignore */
  }
  return 0.03;
}

export async function getLoanLtvRate(sql: Sql): Promise<number> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${"loan_ltv_rate"} limit 1
    `;
    const n = Number(rows[0]?.value);
    if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  } catch {
    /* ignore */
  }
  return 0.9;
}

export async function setLoanPolicy(
  sql: Sql,
  opts: { interestMonthly: number; ltvRate: number },
): Promise<void> {
  if (opts.interestMonthly < 0 || opts.interestMonthly > 0.5) {
    throw new Error("Monthly interest must be between 0% and 50%.");
  }
  if (opts.ltvRate <= 0 || opts.ltvRate > 1) {
    throw new Error("Loan-to-value must be between 1% and 100%.");
  }
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${"loan_interest_monthly"}, ${String(opts.interestMonthly)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${"loan_ltv_rate"}, ${String(opts.ltvRate)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

/** Add one calendar month (same day-of-month when possible). */
export function addOneMonth(from: Date): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  // handle month overflow (Jan 31 → Mar 3 etc.) by clamping
  if (d.getDate() < day) {
    d.setDate(0); // last day of previous month
  }
  return d;
}

export function applyMonthlyInterest(dueTambala: number, rate: number): number {
  return Math.ceil(dueTambala * (1 + rate));
}

export type LoanRow = {
  id: number;
  reference: string;
  user_id: string;
  principal_tambala: number;
  balance_due_tambala: number;
  interest_rate_monthly: number;
  ltv_rate: number;
  collateral_tambala: number;
  repayment_mode: "auto" | "manual";
  status: string;
  started_at: Date | string;
  next_period_at: Date | string;
  periods_elapsed: number;
  last_notify_kind: string | null;
};

export async function recordLoanInterestEarned(
  sql: Sql,
  userId: string,
  loanRef: string,
  principalTambala: number,
  amountTakenTambala: number,
  balanceDueTambala: number,
): Promise<number> {
  /** Interest = amount taken that exceeds original principal (capped by excess of due over principal). */
  const pureInterestPossible = Math.max(0, balanceDueTambala - principalTambala);
  const interest = Math.min(amountTakenTambala, pureInterestPossible);
  if (interest <= 0) return 0;

  await sql`
    insert into transactions (
      user_id, kind, status, gross_tambala, credited_tambala,
      platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
    ) values (
      ${userId}, ${"fee"}, ${"success"}, ${interest}, ${0},
      ${interest}, ${0}, ${loanRef + "_INT"},
      ${"Loan interest"}, now()
    )
  `;
  try {
    await sql`
      insert into platform_settings (key, value, updated_at)
      values (
        ${"loan_interest_earned_tambala"},
        ${String(interest)},
        now()
      )
      on conflict (key) do update set
        value = (coalesce(nullif(platform_settings.value, ''), '0')::numeric + ${interest})::text,
        updated_at = now()
    `;
  } catch {
    /* settings row type may differ */
  }
  try {
    await sql`
      insert into platform_treasury (id, balance_tambala, lifetime_in_tambala, updated_at)
      values (1, ${interest}, ${interest}, now())
      on conflict (id) do update set
        balance_tambala = platform_treasury.balance_tambala + ${interest},
        lifetime_in_tambala = platform_treasury.lifetime_in_tambala + ${interest},
        updated_at = now()
    `;
  } catch {
    /* optional */
  }
  return interest;
}

export async function logLoanEvent(

  sql: Sql,
  loanId: number,
  eventType: string,
  detail: string,
  balanceDue?: number,
): Promise<void> {
  await sql`
    insert into loan_events (loan_id, event_type, detail, balance_due_tambala)
    values (${loanId}, ${eventType}, ${detail}, ${balanceDue ?? null})
  `;
}

/**
 * Process due periods, reminders, auto-debit, compounding, and close-when-debt ≥ balance.
 * Safe to call often (heartbeat / cron).
 */
export async function processLoansForUser(sql: Sql, userId: string): Promise<void> {
  const loans = await sql<LoanRow>`
    select * from loans where user_id = ${userId} and status = ${"active"}
  `;
  if (!loans.length) return;

  const wallet = await sql<{ balance_tambala: number }>`
    select balance_tambala from wallets where user_id = ${userId} limit 1
  `;
  let balance = Number(wallet[0]?.balance_tambala ?? 0);
  const now = Date.now();

  for (const loan of loans) {
    const nextAt = new Date(loan.next_period_at).getTime();
    const due = Number(loan.balance_due_tambala);
    const rate = Number(loan.interest_rate_monthly);

    // Reminders: 7d, 3d, due day (before midnight ends the period)
    const msLeft = nextAt - now;
    const day = 24 * 60 * 60 * 1000;
    let notifyKind: string | null = null;
    if (msLeft > 0 && msLeft <= day && loan.last_notify_kind !== "due") notifyKind = "due";
    else if (msLeft > day && msLeft <= 3 * day && loan.last_notify_kind !== "3d" && loan.last_notify_kind !== "due")
      notifyKind = "3d";
    else if (
      msLeft > 3 * day &&
      msLeft <= 7 * day &&
      !["7d", "3d", "due"].includes(loan.last_notify_kind || "")
    )
      notifyKind = "7d";

    if (notifyKind) {
      await sql`
        update loans set last_notify_kind = ${notifyKind}, last_notified_at = now(), updated_at = now()
        where id = ${loan.id}
      `;
      await logLoanEvent(sql, loan.id, "notify_" + notifyKind, `Reminder ${notifyKind} before period end`, due);
      try {
        const { sendMail } = await import("./mail.server");
        const prof = await sql<{ email: string; first_name: string }>`
          select email, first_name from profiles where user_id = ${userId} limit 1
        `;
        if (prof[0]?.email) {
          const when = new Date(loan.next_period_at).toLocaleString();
          await sendMail({
            to: prof[0].email,
            subject: `NEXA-SAVER — loan payment reminder (${notifyKind})`,
            text:
              `Hello ${prof[0].first_name},\n\n` +
              `Your loan ${loan.reference} has ${Math.round(due) / 100} MWK due by ${when}.\n` +
              (loan.repayment_mode === "auto"
                ? "Auto-deduct is on: we will take the amount from your vault if funds allow.\n"
                : "Manual repayment: pay from the app before the period ends to avoid another month of interest.\n") +
              `\nNEXA-SAVER`,
          });
        }
      } catch {
        /* best effort */
      }
    }

    if (now < nextAt) continue;

    // Period ended
    if (loan.repayment_mode === "auto") {
      if (balance >= due) {
        await sql`
          update wallets set balance_tambala = balance_tambala - ${due}, updated_at = now()
          where user_id = ${userId} and balance_tambala >= ${due}
        `;
        balance -= due;
        await sql`
          insert into transactions (
            user_id, kind, status, gross_tambala, credited_tambala,
            platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
          ) values (
            ${userId}, ${"fee"}, ${"success"}, ${due}, ${0},
            ${0}, ${0}, ${loan.reference + "_PAY"},
            ${"Loan repayment (auto)"}, now()
          )
        `;
        await recordLoanInterestEarned(
          sql,
          userId,
          loan.reference,
          Number(loan.principal_tambala),
          due,
          due,
        );
        await sql`
          update loans set status = ${"paid"}, closed_at = now(), balance_due_tambala = ${0}, updated_at = now()
          where id = ${loan.id}
        `;
        await logLoanEvent(sql, loan.id, "paid_auto", `Auto repaid ${due}`, 0);
        continue;
      }
      // insufficient for full auto pay → compound like manual, then check close
    }

    // Manual (or failed auto): compound one period
    const newDue = applyMonthlyInterest(due, rate);
    const periods = Number(loan.periods_elapsed) + 1;
    const nextPeriod = addOneMonth(new Date(loan.next_period_at));

    // Close when debt reaches or exceeds available balance (or collateral)
    const closeThreshold = Math.min(balance, Number(loan.collateral_tambala));
    if (newDue >= closeThreshold && balance > 0) {
      const take = balance;
      const breakdown = {
        principal: Number(loan.principal_tambala),
        periods,
        rate,
        finalDue: newDue,
        deducted: take,
        collateral: Number(loan.collateral_tambala),
        timeline: `Started ${loan.started_at}; compounded ${periods} period(s) at ${(rate * 100).toFixed(2)}%/month.`,
      };
      await sql`
        update wallets set balance_tambala = 0, updated_at = now()
        where user_id = ${userId}
      `;
      balance = 0;
      await sql`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
        ) values (
          ${userId}, ${"fee"}, ${"success"}, ${take}, ${0},
          ${0}, ${0}, ${loan.reference + "_CLOSE"},
          ${"Loan closed — debt reached balance; full vault applied"}, now()
        )
      `;
      await recordLoanInterestEarned(
        sql,
        userId,
        loan.reference,
        Number(loan.principal_tambala),
        take,
        newDue,
      );
      await sql`
        update loans
        set status = ${"closed_balance"},
            balance_due_tambala = ${newDue},
            periods_elapsed = ${periods},
            breakdown_json = ${JSON.stringify(breakdown)},
            closed_at = now(),
            updated_at = now()
        where id = ${loan.id}
      `;
      await logLoanEvent(sql, loan.id, "closed_balance", JSON.stringify(breakdown), newDue);
      try {
        const { sendMail } = await import("./mail.server");
        const prof = await sql<{ email: string; first_name: string }>`
          select email, first_name from profiles where user_id = ${userId} limit 1
        `;
        if (prof[0]?.email) {
          await sendMail({
            to: prof[0].email,
            subject: "NEXA-SAVER — loan closed against your balance",
            text:
              `Hello ${prof[0].first_name},\n\n` +
              `Loan ${loan.reference} was closed because the amount due reached or exceeded your available balance.\n\n` +
              `Principal: ${Number(loan.principal_tambala) / 100} MWK\n` +
              `Periods charged: ${periods}\n` +
              `Monthly rate: ${(rate * 100).toFixed(2)}%\n` +
              `Amount due at close: ${newDue / 100} MWK\n` +
              `Taken from vault: ${take / 100} MWK\n\n` +
              `${breakdown.timeline}\n\nNEXA-SAVER`,
          });
        }
      } catch {
        /* ignore */
      }
      continue;
    }

    await sql`
      update loans
      set balance_due_tambala = ${newDue},
          periods_elapsed = ${periods},
          next_period_at = ${nextPeriod},
          last_notify_kind = null,
          updated_at = now()
      where id = ${loan.id}
    `;
    await logLoanEvent(
      sql,
      loan.id,
      "compound",
      `Period ${periods}: due ${due} → ${newDue} at rate ${rate}`,
      newDue,
    );
    try {
      const { sendMail } = await import("./mail.server");
      const prof = await sql<{ email: string; first_name: string }>`
        select email, first_name from profiles where user_id = ${userId} limit 1
      `;
      if (prof[0]?.email) {
        await sendMail({
          to: prof[0].email,
          subject: "NEXA-SAVER — loan entered a new interest period",
          text:
            `Hello ${prof[0].first_name},\n\n` +
            `Your loan ${loan.reference} rolled into period ${periods}.\n` +
            `Previous due: ${due / 100} MWK\n` +
            `New amount due: ${newDue / 100} MWK (${(rate * 100).toFixed(2)}% monthly).\n` +
            `Next period ends: ${nextPeriod.toLocaleString()}\n\nNEXA-SAVER`,
        });
      }
    } catch {
      /* ignore */
    }
  }
}
