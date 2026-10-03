import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SessionGate } from "@/components/session-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import {
  adminOverview,
  adminTransactions,
  adminUsers,
  getPlatformSupportPhone,
  setPlatformSupportPhone,
} from "@/lib/nexa/fns";
import { formatKwacha, tambalaToKwacha } from "@/lib/nexa/money";
import type { AdminOverview, AdminUserRow, PublicTx } from "@/lib/nexa/types";

export const Route = createFileRoute("/admin")({ component: AdminPage });

/** Charts are admin-only — load recharts only when this page mounts. */
const AdminChart = lazy(async () => {
  const mod = await import("recharts");
  function Chart({
    data,
  }: {
    data: Array<{ day: string; deposits: number; withdrawals: number; profit: number }>;
  }) {
    const { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } = mod;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="day" stroke="var(--color-muted)" fontSize={12} />
          <YAxis stroke="var(--color-muted)" fontSize={12} />
          <Tooltip
            contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          />
          <Area
            type="monotone"
            dataKey="deposits"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.15}
          />
          <Area
            type="monotone"
            dataKey="withdrawals"
            stroke="var(--color-muted)"
            fill="var(--color-muted)"
            fillOpacity={0.08}
          />
          <Area
            type="monotone"
            dataKey="profit"
            stroke="var(--color-warn)"
            fill="var(--color-warn)"
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return { default: Chart };
});

function AdminPage() {
  return <SessionGate admin>{() => <Console />}</SessionGate>;
}

function Console() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [txs, setTxs] = useState<Array<PublicTx & { username: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState("");
  const [supportMsg, setSupportMsg] = useState<string | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);

  useEffect(() => {
    Promise.all([adminOverview(), adminUsers(), adminTransactions(), getPlatformSupportPhone()])
      .then(([o, u, t, s]) => {
        setOverview(o);
        setUsers(u);
        setTxs(t);
        if (s.phone) setSupportPhone(s.phone);
      })
      .catch((err) => setError(errMessage(err)));
  }, []);

  async function saveSupportPhone(e: React.FormEvent) {
    e.preventDefault();
    setSupportBusy(true);
    setSupportMsg(null);
    try {
      const res = await setPlatformSupportPhone({ data: { phone: supportPhone } });
      setSupportPhone(res.phone);
      setSupportMsg("Support number saved. Users over the daily limit will see this number.");
    } catch (err) {
      setSupportMsg(errMessage(err));
    } finally {
      setSupportBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!overview) {
    return (
      <div className="space-y-3">
        <div className="h-24 rounded-2xl bg-surface-2 shimmer" />
        <div className="h-48 rounded-2xl bg-surface-2 shimmer" />
      </div>
    );
  }

  const chart = overview.series.map((row) => ({
    day: row.day.slice(5),
    deposits: tambalaToKwacha(row.deposits),
    withdrawals: tambalaToKwacha(row.withdrawals),
    profit: tambalaToKwacha(row.profit),
  }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">Platform</p>
        <h1 className="font-display text-3xl font-semibold">Performance</h1>
        {overview.demoPayments ? (
          <p className="mt-1 text-sm text-warn">
            Demo payments are ON (development only). No real money moves.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Deposits" value={formatKwacha(overview.totalDepositsTambala, { compact: true })} />
        <Stat label="Withdrawals" value={formatKwacha(overview.totalWithdrawalsTambala, { compact: true })} />
        <Stat label="User balances" value={formatKwacha(overview.userBalancesTambala, { compact: true })} />
        <Stat label="Platform profit" value={formatKwacha(overview.platformProfitTambala, { compact: true })} />
        <Stat label="Payout reserve" value={formatKwacha(overview.payoutReserveTambala, { compact: true })} />
        <Stat label="Savers" value={String(overview.userCount)} />
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Large-withdrawal support number</h2>
        <p className="text-sm text-muted">
          Shown to users who need more than the automatic daily limit (final tier 1,000,000 MWK). They contact
          this number for help. Use a Malawi mobile the platform monitors.
        </p>
        <form
          onSubmit={(e) => void saveSupportPhone(e)}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="support-phone">Platform support phone</Label>
            <Input
              id="support-phone"
              inputMode="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="09… or 08…"
            />
          </div>
          <Button type="submit" disabled={supportBusy || supportPhone.trim().length < 8}>
            {supportBusy ? "Saving…" : "Save"}
          </Button>
        </form>
        {supportMsg ? <p className="text-sm text-muted">{supportMsg}</p> : null}
      </Card>

      <Card className="h-64 p-4">
        {chart.length ? (
          <Suspense fallback={<p className="grid h-full place-items-center text-sm text-muted">Loading chart…</p>}>
            <AdminChart data={chart} />
          </Suspense>
        ) : (
          <p className="grid h-full place-items-center text-sm text-muted">No activity in the last two weeks yet.</p>
        )}
      </Card>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Accounts</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Balance</th>
                <th className="px-3 py-2 font-medium">In</th>
                <th className="px-3 py-2 font-medium">Out</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-t border-border">
                  <td className="px-3 py-2">
                    {u.username}
                    {u.role === "admin" ? <span className="ml-2 text-xs text-primary">admin</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{u.phone}</td>
                  <td className="px-3 py-2 tabular-nums">{formatKwacha(u.balanceTambala, { compact: true })}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatKwacha(u.lifetimeDepositedTambala, { compact: true })}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatKwacha(u.lifetimeWithdrawnTambala, { compact: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Ledger</h2>
        <ul className="space-y-2">
          {txs.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {tx.username} · {tx.kind}
                </p>
                <p className="text-xs text-muted">
                  {tx.status} · {tx.reference}
                </p>
              </div>
              <p className="tabular-nums">{formatKwacha(tx.grossTambala, { compact: true })}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
