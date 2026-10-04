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
  adminLookupReference,
  adminForceCreditDeposit,
  adminAnnotateTransaction,
  getPlatformSupportPhone,
  setPlatformSupportPhone,
  adminSecuritySurveyStatus,
  adminStartSecuritySurvey,
  adminStopSecuritySurvey,
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
  const [surveyStatus, setSurveyStatus] = useState<{ active: boolean; campaignId: string | null; completed: number; totalUsers: number } | null>(null);
  const [surveyBusy, setSurveyBusy] = useState(false);
  const [surveyMsg, setSurveyMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([adminOverview(), adminUsers(), adminTransactions(), getPlatformSupportPhone(), adminSecuritySurveyStatus()])
      .then(([o, u, t, s, sv]) => {
        setOverview(o);
        setUsers(u);
        setTxs(t);
        if (s.phone) setSupportPhone(s.phone);
        setSurveyStatus(sv);
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


      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Security survey</h2>
        <p className="text-sm text-muted">
          Launch a mandatory check on every saver&apos;s dashboard. Users must confirm email, withdrawal number,
          and security question before they can continue. Starting a new survey creates a new campaign so
          everyone is asked again.
        </p>
        {surveyStatus ? (
          <p className="text-sm text-muted">
            Status:{" "}
            <span className="font-medium text-fg">{surveyStatus.active ? "Active" : "Off"}</span>
            {surveyStatus.campaignId ? ` · campaign ${surveyStatus.campaignId}` : ""}
            {surveyStatus.active
              ? ` · ${surveyStatus.completed} of ${surveyStatus.totalUsers} users finished`
              : ""}
          </p>
        ) : null}
        {surveyMsg ? <p className="text-sm text-primary">{surveyMsg}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={surveyBusy}
            onClick={() => {
              setSurveyBusy(true);
              setSurveyMsg(null);
              void adminStartSecuritySurvey()
                .then((r) => {
                  setSurveyMsg(`Survey started (${r.campaignId}). Users will see it on the next dashboard visit.`);
                  return adminSecuritySurveyStatus();
                })
                .then(setSurveyStatus)
                .catch((err) => setSurveyMsg(errMessage(err)))
                .finally(() => setSurveyBusy(false));
            }}
          >
            {surveyBusy ? "Working…" : "Start survey for all users"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={surveyBusy || !surveyStatus?.active}
            onClick={() => {
              setSurveyBusy(true);
              setSurveyMsg(null);
              void adminStopSecuritySurvey()
                .then(() => {
                  setSurveyMsg("Survey turned off. Users who have not finished will no longer be blocked.");
                  return adminSecuritySurveyStatus();
                })
                .then(setSurveyStatus)
                .catch((err) => setSurveyMsg(errMessage(err)))
                .finally(() => setSurveyBusy(false));
            }}
          >
            Stop survey
          </Button>
        </div>
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

      <SupportDesk />
    </div>
  );
}

function SupportDesk() {
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof adminLookupReference>> | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await adminLookupReference({ data: { reference: ref } });
      setResult(res);
      if (!res.found) setErr("No transaction with that reference.");
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function forceCredit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await adminForceCreditDeposit({
        data: { reference: ref, reason: reason || "Support credit after PayChangu confirmation" },
      });
      setMsg(res.already ? "Already credited." : "Deposit credited to the user wallet.");
      const again = await adminLookupReference({ data: { reference: ref } });
      setResult(again);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    setBusy(true);
    setErr(null);
    try {
      await adminAnnotateTransaction({ data: { reference: ref, note } });
      setMsg("Note saved on transaction.");
      setNote("");
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Support desk</h2>
      <p className="text-sm text-muted">
        Look up a deposit or withdrawal by reference. For stuck deposits, confirm success in PayChangu, then
        credit. For missing withdrawals, check status here and in PayChangu payouts before refunding.
      </p>
      <form onSubmit={(e) => void lookup(e)} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Reference e.g. DEP-…"
          className="flex-1"
        />
        <Button type="submit" loading={busy}>
          Look up
        </Button>
      </form>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
      {result?.found ? (
        <Card className="space-y-2 p-4 text-sm">
          <p>
            <span className="text-muted">User</span> {result.tx.name} (@{result.tx.username}) · {result.tx.email}
          </p>
          <p>
            <span className="text-muted">Type</span> {result.tx.kind} · <span className="text-muted">Status</span>{" "}
            {result.tx.status}
          </p>
          <p>
            <span className="text-muted">Amount</span> {formatKwacha(result.tx.grossTambala)} ·{" "}
            <span className="text-muted">Phone</span> {result.tx.phone ?? "—"}
          </p>
          <p className="text-xs text-muted">
            Created {result.tx.createdAt ? new Date(result.tx.createdAt).toLocaleString() : "—"}
            {result.tx.note ? ` · Note: ${result.tx.note}` : null}
          </p>
          {result.paychangu ? (
            <p>
              <span className="text-muted">PayChangu</span> {result.paychangu.status}
              {result.paychangu.ok ? " (success)" : " (not success)"} · amount {result.paychangu.amount}
            </p>
          ) : null}
          {result.tx.kind === "deposit" && result.tx.status === "pending" ? (
            <div className="space-y-2 border-t border-border pt-3">
              <Label htmlFor="credit-reason">Credit reason (audit log)</Label>
              <Input
                id="credit-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Confirmed success in PayChangu dashboard"
              />
              <Button type="button" loading={busy} onClick={() => void forceCredit()}>
                Credit deposit to wallet
              </Button>
            </div>
          ) : null}
          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="support-note">Add support note</Label>
            <Input id="support-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called user, ticket #…" />
            <Button type="button" variant="secondary" loading={busy} onClick={() => void saveNote()}>
              Save note
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
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
