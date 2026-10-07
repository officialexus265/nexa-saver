import { lazy, Suspense, useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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
  adminDeleteHelpLine,
  adminUpsertHelpLine,
  adminListHelpLines,
  adminAnalytics,
  adminGetPayoutMethods,
  adminSetPayoutMethods,
  adminGetFeePolicy,
  adminSetFeePolicy,
  adminTreasuryWithdraw,
  adminExportSurveyCsv,
  adminDeleteUser,
  adminLockUser,
  adminSetWithdrawLock,
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
  const [surveyStatus, setSurveyStatus] = useState<{
    active: boolean;
    campaignId: string | null;
    completed: number;
    totalUsers: number;
    pending: number;
    unchanged: number;
    emailReverted: number;
    phoneReverted: number;
    bothReverted: number;
    emailConfirmed: number;
    phoneConfirmed: number;
    completionRate: number;
  } | null>(null);
  const [surveyBusy, setSurveyBusy] = useState(false);
  const [surveyMsg, setSurveyMsg] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof adminAnalytics>> | null>(null);
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);
  const [payoutMethods, setPayoutMethods] = useState<{ momo: boolean; bank: boolean } | null>(null);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [feeForm, setFeeForm] = useState({ deposit: "6", unlockBase: "3", unlockCap: "3" });
  const [feeMsg, setFeeMsg] = useState<string | null>(null);
  const [feeBusy, setFeeBusy] = useState(false);
  const [adminTab, setAdminTab] = useState<"overview" | "accounts" | "money" | "tools">("overview");





  useEffect(() => {
    Promise.all([adminOverview(), adminUsers(), adminTransactions(), getPlatformSupportPhone(), adminSecuritySurveyStatus(), adminAnalytics(), adminGetPayoutMethods(), adminGetFeePolicy()])
      .then(([o, u, t, s, sv, an, pm, fp]) => {
        setOverview(o);
        setUsers(u);
        setTxs(t);
        if (s.phone) setSupportPhone(s.phone);
        setSurveyStatus(sv);
        setAnalytics(an);
        setPayoutMethods(pm);
        if (fp) {
          setFeeForm({
            deposit: String(Math.round(fp.depositFeeRate * 1000) / 10),
            unlockBase: String(Math.round(fp.earlyUnlockBaseRate * 1000) / 10),
            unlockCap: String(Math.round(fp.earlyUnlockCapRate * 1000) / 10),
          });
        }
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

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "accounts" as const, label: "Accounts" },
    { id: "money" as const, label: "Fees & payouts" },
    { id: "tools" as const, label: "Tools" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted">Platform</p>
          <h1 className="font-display text-3xl font-semibold">Admin</h1>
          {overview.demoPayments ? (
            <p className="mt-1 text-sm text-warn">Demo payments are ON. No real money moves.</p>
          ) : null}
        </div>
        <Link
          to="/admin/translations"
          className="group inline-flex h-10 items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 text-sm font-semibold text-primary shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-primary-fg hover:shadow-md active:translate-y-0"
        >
          <span aria-hidden className="text-base leading-none transition-transform duration-200 group-hover:scale-110">文A</span>
          Translate
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface-2 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAdminTab(tab.id)}
            className={
              adminTab === tab.id
                ? "shrink-0 rounded-xl bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-sm"
                : "shrink-0 rounded-xl px-4 py-2.5 text-sm text-muted"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {adminTab === "overview" ? (
      <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Deposits" value={formatKwacha(overview.totalDepositsTambala, { compact: true })} />
        <Stat label="Withdrawals" value={formatKwacha(overview.totalWithdrawalsTambala, { compact: true })} />
        <Stat label="User balances" value={formatKwacha(overview.userBalancesTambala, { compact: true })} />
        <Stat label="Platform profit" value={formatKwacha(overview.platformProfitTambala, { compact: true })} />
        <Stat label="Payout reserve" value={formatKwacha(overview.payoutReserveTambala, { compact: true })} />
        <Stat label="Savers" value={String(overview.userCount)} />
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Treasury (platform profit)</h2>
        <p className="text-sm text-muted">
          Book profit is fee income from deposits. Saver balances are liabilities — never withdrawn here.
          Treasury cash-out uses deposit book profit plus early-unlock fees collected from users, minus what you already paid out. ~1.8% applies on the mobile-money rail.
        </p>
        {overview ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SurveyStat label="System profit (book)" value={formatKwacha(overview.platformProfitTambala)} />
            <SurveyStat label="Early unlock fees" value={formatKwacha(overview.earlyUnlockFeesTambala ?? 0)} />
            <SurveyStat label="Saver balances (liability)" value={formatKwacha(overview.userBalancesTambala)} />
            <SurveyStat label="Withdrawable profit" value={formatKwacha(overview.treasuryAvailableTambala)} />
          </div>
        ) : null}
        {overview && overview.treasuryPaidOutTambala > 0 ? (
          <p className="text-xs text-muted">
            Already paid out from profit: {formatKwacha(overview.treasuryPaidOutTambala)}
          </p>
        ) : null}
        <TreasuryWithdrawForm
          availableTambala={overview?.treasuryAvailableTambala ?? 0}
          onDone={() => {
            void adminOverview().then(setOverview);
          }}
        />
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

      </div>
      ) : null}

      {adminTab === "money" ? (
      <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Large-withdrawal support number</h2>
        <p className="text-sm text-muted">
          Shown to users who need more than the automatic daily limit (final tier 1,000,000 MWK). They contact
          this number for help. Use a Malawi mobile the platform monitors.
        </p>
        <form
          onSubmit={(e) => void saveSupportPhone(e)}
          className="flex w-full flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="w-full min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="support-phone">Platform support phone</Label>
            <Input
              id="support-phone"
              inputMode="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="09… or 08…"
              className="w-full"
            />
          </div>
          <Button
            type="submit"
            className="h-12 w-full shrink-0 sm:h-11 sm:w-auto"
            disabled={supportBusy || supportPhone.trim().length < 8}
          >
            {supportBusy ? "Saving…" : "Save"}
          </Button>
        </form>
        {supportMsg ? <p className="text-sm text-muted">{supportMsg}</p> : null}
      </Card>


      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Platform fees</h2>
        <p className="text-sm text-muted">
          These percentages drive deposits, early unlock, Terms, and Privacy. Deposit fee is split half profit / half
          payout reserve for bookkeeping. Early unlock uses base × remaining fraction, capped at the max you set (default
          max 3%).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="fee-dep">Deposit fee %</Label>
            <Input
              id="fee-dep"
              inputMode="decimal"
              value={feeForm.deposit}
              onChange={(e) => setFeeForm((f) => ({ ...f, deposit: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee-ub">Early unlock base %</Label>
            <Input
              id="fee-ub"
              inputMode="decimal"
              value={feeForm.unlockBase}
              onChange={(e) => setFeeForm((f) => ({ ...f, unlockBase: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee-uc">Early unlock max %</Label>
            <Input
              id="fee-uc"
              inputMode="decimal"
              value={feeForm.unlockCap}
              onChange={(e) => setFeeForm((f) => ({ ...f, unlockCap: e.target.value }))}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={feeBusy}
          onClick={() => {
            setFeeBusy(true);
            setFeeMsg(null);
            void adminSetFeePolicy({
              data: {
                depositFeePercent: Number(feeForm.deposit),
                earlyUnlockBasePercent: Number(feeForm.unlockBase),
                earlyUnlockCapPercent: Number(feeForm.unlockCap),
              },
            })
              .then(() => setFeeMsg("Fee policy saved. Terms and Privacy will show the new figures."))
              .catch((err) => setFeeMsg(errMessage(err)))
              .finally(() => setFeeBusy(false));
          }}
        >
          {feeBusy ? "Saving…" : "Save fee policy"}
        </Button>
        {feeMsg ? <p className="text-sm text-muted">{feeMsg}</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Payout methods</h2>
        <p className="text-sm text-muted">
          Choose which ways savers can withdraw. At least one method must stay on. Bank withdrawals show a 700
          MWK rail flat fee to the user (not a NEXA charge).
        </p>
        {payoutMethods ? (
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={payoutMethods.momo}
                onChange={(e) =>
                  setPayoutMethods((p) => (p ? { ...p, momo: e.target.checked } : p))
                }
              />
              Mobile money (MoMo)
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={payoutMethods.bank}
                onChange={(e) =>
                  setPayoutMethods((p) => (p ? { ...p, bank: e.target.checked } : p))
                }
              />
              Bank transfer
            </label>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={payoutBusy || (!payoutMethods.momo && !payoutMethods.bank)}
              onClick={() => {
                setPayoutBusy(true);
                setPayoutMsg(null);
                void adminSetPayoutMethods({ data: payoutMethods })
                  .then(() => setPayoutMsg("Payout methods saved."))
                  .catch((err) => setPayoutMsg(errMessage(err)))
                  .finally(() => setPayoutBusy(false));
              }}
            >
              {payoutBusy ? "Saving…" : "Save payout methods"}
            </Button>
            {payoutMsg ? <p className="text-sm text-muted">{payoutMsg}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </Card>

      </div>
      ) : null}

      {adminTab === "tools" ? (
      <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Security survey</h2>
        <p className="text-sm text-muted">
          Launch a mandatory check on every saver&apos;s dashboard. Users must confirm email, withdrawal number,
          and security question before they can continue. Starting a new survey creates a new campaign so
          everyone is asked again.
        </p>
        {surveyStatus ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Status:{" "}
              <span className="font-medium text-fg">{surveyStatus.active ? "Active" : "Off"}</span>
              {surveyStatus.campaignId ? (
                <span className="text-faint"> · {surveyStatus.campaignId}</span>
              ) : null}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <SurveyStat label="Finished" value={String(surveyStatus.completed)} />
              <SurveyStat label="Pending" value={String(surveyStatus.pending)} />
              <SurveyStat label="Completion" value={`${surveyStatus.completionRate}%`} />
              <SurveyStat label="No changes" value={String(surveyStatus.unchanged)} />
              <SurveyStat label="Email restored" value={String(surveyStatus.emailReverted)} />
              <SurveyStat label="Phone restored" value={String(surveyStatus.phoneReverted)} />
              <SurveyStat label="Both restored" value={String(surveyStatus.bothReverted)} />
              <SurveyStat label="Email OK" value={String(surveyStatus.emailConfirmed)} />
              <SurveyStat label="Phone OK" value={String(surveyStatus.phoneConfirmed)} />
            </div>
          </div>
        ) : null}
        {surveyMsg ? <p className="text-sm text-primary">{surveyMsg}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            className="w-full sm:w-auto"
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
            disabled={surveyBusy || !surveyStatus?.campaignId}
            onClick={() => {
              setSurveyBusy(true);
              setSurveyMsg(null);
              void adminExportSurveyCsv({ data: { campaignId: surveyStatus?.campaignId ?? undefined } })
                .then((res) => {
                  const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = res.filename;
                  a.click();
                  URL.revokeObjectURL(url);
                  setSurveyMsg(`Downloaded ${res.rowCount} survey response(s).`);
                })
                .catch((err) => setSurveyMsg(errMessage(err)))
                .finally(() => setSurveyBusy(false));
            }}
          >
            Download survey CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
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


      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Usage analytics</h2>
        {analytics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SurveyStat label="Visits today" value={String(analytics.todayVisits)} />
              <SurveyStat label="Active users today" value={String(analytics.todayUsers)} />
              <SurveyStat
                label="Visits (30d)"
                value={String(analytics.daily.reduce((s, d) => s + d.visits, 0))}
              />
              <SurveyStat
                label="Top activity"
                value={analytics.topActivity[0]?.label ?? "—"}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Most visited (30 days)</p>
              <ul className="space-y-1 text-sm">
                {analytics.topPaths.map((p) => (
                  <li key={p.path} className="flex justify-between gap-2 border-b border-border/60 py-1">
                    <span className="truncate text-muted">{p.path}</span>
                    <span className="tabular-nums font-medium">{p.hits}</span>
                  </li>
                ))}
                {!analytics.topPaths.length ? (
                  <li className="text-muted">No page visits recorded yet.</li>
                ) : null}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Money activity (30 days)</p>
              <ul className="space-y-1 text-sm">
                {analytics.topActivity.map((a) => (
                  <li key={a.label} className="flex justify-between gap-2 border-b border-border/60 py-1">
                    <span className="text-muted">{a.label}</span>
                    <span className="tabular-nums font-medium">{a.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Monthly visits</p>
              <ul className="space-y-1 text-sm">
                {analytics.monthly.map((m) => (
                  <li key={m.month} className="flex justify-between gap-2 border-b border-border/60 py-1">
                    <span className="text-muted">{m.month}</span>
                    <span className="tabular-nums">
                      {m.visits} visits · {m.users} users
                    </span>
                  </li>
                ))}
                {!analytics.monthly.length ? <li className="text-muted">No data yet.</li> : null}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Loading analytics…</p>
        )}
      </Card>

        <HelpLinesManager />
      </div>
      ) : null}

      {adminTab === "accounts" ? (
      <div className="space-y-5">
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-semibold">Accounts</h2>
          <div className="w-full space-y-1.5 sm:max-w-sm">
            <Label htmlFor="user-search">Search accounts</Label>
            <Input
              id="user-search"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Username, email, phone…"
              className="w-full"
            />
          </div>
        </div>
        {userActionMsg ? <p className="mb-2 text-sm text-muted">{userActionMsg}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-right">In</th>
                <th className="px-4 py-3 font-medium text-right">Out</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users.filter((u) => {
                const q = userQuery.trim().toLowerCase();
                if (!q) return true;
                return (
                  u.username.toLowerCase().includes(q) ||
                  u.email.toLowerCase().includes(q) ||
                  u.phone.includes(q) ||
                  u.firstName.toLowerCase().includes(q)
                );
              })).map((u) => (
                <tr key={u.userId} className="border-t border-border">
                  <td className="px-4 py-3 align-middle">
                    <span className="font-medium">{u.username}</span>
                    {u.role === "admin" ? <span className="ml-2 text-xs text-primary">admin</span> : null}
                  </td>
                  <td className="px-4 py-3 align-middle tabular-nums text-muted whitespace-nowrap">{u.phone}</td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums whitespace-nowrap">{formatKwacha(u.balanceTambala, { compact: true })}</td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums whitespace-nowrap">
                    {formatKwacha(u.lifetimeDepositedTambala, { compact: true })}
                  </td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums whitespace-nowrap">
                    {formatKwacha(u.lifetimeWithdrawnTambala, { compact: true })}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs whitespace-nowrap">
                    {u.adminLocked ? (
                      <span className="text-danger">Locked</span>
                    ) : u.role === "admin" ? (
                      <span className="text-muted">Admin</span>
                    ) : (
                      <span className="text-primary">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {u.role === "admin" ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 whitespace-nowrap px-2.5 text-xs"
                          onClick={() => {
                            const reason =
                              window.prompt(
                                u.adminLocked
                                  ? "Reason for unlocking (audit log):"
                                  : "Reason for locking this account (reported / compromised):",
                              ) || "";
                            if (reason.trim().length < 3) return;
                            void adminLockUser({
                              data: { userId: u.userId, reason: reason.trim(), locked: !u.adminLocked },
                            })
                              .then(() => {
                                setUserActionMsg(
                                  u.adminLocked ? `Unlocked ${u.username}` : `Locked ${u.username}`,
                                );
                                return adminUsers();
                              })
                              .then(setUsers)
                              .catch((err) => setUserActionMsg(errMessage(err)));
                          }}
                        >
                          {u.adminLocked ? "Unlock account" : "Lock account"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 whitespace-nowrap px-2.5 text-xs"
                          onClick={() => {
                            const locked = Boolean((u as { adminWithdrawLocked?: boolean }).adminWithdrawLocked);
                            const reason =
                              window.prompt(
                                locked
                                  ? "Reason for unlocking withdrawals (audit):"
                                  : "Reason for withdraw-only lock (legal / report):",
                              ) || "";
                            if (reason.trim().length < 3) return;
                            void adminSetWithdrawLock({
                              data: { userId: u.userId, reason: reason.trim(), locked: !locked },
                            })
                              .then(() => {
                                setUserActionMsg(
                                  locked
                                    ? `Withdrawals unlocked for ${u.username}`
                                    : `Withdrawals locked for ${u.username}`,
                                );
                                return adminUsers();
                              })
                              .then(setUsers)
                              .catch((err) => setUserActionMsg(errMessage(err)));
                          }}
                        >
                          {(u as { adminWithdrawLocked?: boolean }).adminWithdrawLocked
                            ? "Unlock withdraw"
                            : "Lock withdraw"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 whitespace-nowrap px-2.5 text-xs text-danger"
                          onClick={() => {
                            const reason =
                              window.prompt(
                                `Delete ${u.username}? This soft-deletes the account. Type a reason:`,
                              ) || "";
                            if (reason.trim().length < 3) return;
                            if (!window.confirm(`Permanently soft-delete ${u.username}?`)) return;
                            void adminDeleteUser({
                              data: { userId: u.userId, reason: reason.trim() },
                            })
                              .then(() => {
                                setUserActionMsg(`Deleted ${u.username}`);
                                return adminUsers();
                              })
                              .then(setUsers)
                              .catch((err) => setUserActionMsg(errMessage(err)));
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
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
      ) : null}

      <SupportDesk />
    </div>
  );
}

function TreasuryWithdrawForm({
  availableTambala,
  onDone,
}: {
  availableTambala: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const kwacha = Number(amount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await adminTreasuryWithdraw({
        data: {
          amountKwacha: kwacha,
          pin,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      setMsg(
        `Sent. Gross ${formatKwacha(res.grossTambala)} · rail fee ~${formatKwacha(res.feeTambala)} · net to your registered number ${formatKwacha(res.netTambala)}. Ref ${res.reference}`,
      );
      setAmount("");
      setPin("");
      onDone();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t border-border pt-3">
      <p className="text-sm text-muted">
        Withdraw profit to the admin registered mobile number. Available: {formatKwacha(availableTambala)}.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="try-amt">Amount (kwacha)</Label>
        <Input
          id="try-amt"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full"
        />
        {kwacha > 0 ? (
          <p className="text-xs text-muted">
            After ~1.8% rail fee you receive about {Math.max(0, Math.round(kwacha * 0.982))} kwacha
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="try-pin">Admin withdraw PIN</Label>
        <Input
          id="try-pin"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Default was 0000 if never changed"
        />
      </div>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
      <Button
        type="submit"
        className="h-12 w-full sm:w-auto"
        disabled={busy || pin.length !== 4 || !kwacha || kwacha <= 0}
      >
        {busy ? "Sending…" : "Withdraw profit"}
      </Button>
    </form>
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
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-semibold">Support desk</h2>
      <p className="text-sm text-muted">
        Look up a deposit or withdrawal by reference. For stuck deposits, confirm success in PayChangu, then
        credit. For missing withdrawals, check status here and in PayChangu payouts before refunding.
      </p>
      <form onSubmit={(e) => void lookup(e)} className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch">
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Reference e.g. DEP_…"
          className="w-full min-w-0 flex-1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button type="submit" loading={busy} className="h-12 w-full shrink-0 sm:h-11 sm:w-auto sm:min-w-[7.5rem]">
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
              <Button type="button" className="h-12 w-full sm:h-11" loading={busy} onClick={() => void forceCredit()}>
                Credit deposit to wallet
              </Button>
            </div>
          ) : null}
          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="support-note">Add support note</Label>
            <Input id="support-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called user, ticket #…" />
            <Button type="button" variant="secondary" className="h-12 w-full sm:h-11" loading={busy} onClick={() => void saveNote()}>
              Save note
            </Button>
          </div>
        </Card>
      ) : null}
    </Card>
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


function SurveyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function HelpLinesManager() {
  const [lines, setLines] = useState<
    Array<{
      id: number;
      channel: "whatsapp" | "call" | "sms" | "facebook" | "other";
      label: string;
      value: string;
      sortOrder: number;
      active: boolean;
    }>
  >([]);
  const [channel, setChannel] = useState<"whatsapp" | "call" | "sms" | "facebook" | "other">("whatsapp");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const rows = await adminListHelpLines();
    setLines(rows);
  }

  useEffect(() => {
    void reload().catch(() => setLines([]));
  }, []);

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await adminUpsertHelpLine({
        data: { channel, label, value, sortOrder: lines.length, active: true },
      });
      setLabel("");
      setValue("");
      setMsg("Help line saved. It appears on the user dashboard + button.");
      await reload();
    } catch (err) {
      setMsg(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await adminDeleteHelpLine({ data: { id } });
      await reload();
    } catch (err) {
      setMsg(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-semibold">Help lines</h2>
      <p className="text-sm text-muted">
        These appear when a user taps the floating <strong className="text-fg">+</strong> on the dashboard
        (WhatsApp, call, SMS, Facebook). Leave empty to hide the button.
      </p>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li
            key={l.id}
            className="flex flex-col gap-2 rounded-xl border border-border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium capitalize">
                {l.channel} · {l.label}
              </p>
              <p className="text-xs text-muted break-all">{l.value}</p>
            </div>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void remove(l.id)}>
              Remove
            </Button>
          </li>
        ))}
        {!lines.length ? <p className="text-sm text-muted">No help lines yet.</p> : null}
      </ul>
      <form onSubmit={(e) => void addLine(e)} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hl-channel">Channel</Label>
          <select
            id="hl-channel"
            className="flex h-12 w-full min-w-0 rounded-xl border border-border bg-surface-2 px-3.5 text-base sm:h-11 sm:text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="call">Call</option>
            <option value="sms">SMS / Message</option>
            <option value="facebook">Facebook</option>
            <option value="other">Other (link)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hl-label">Label</Label>
          <Input id="hl-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Support WhatsApp" required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="hl-value">Number or link</Label>
          <Input
            id="hl-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="26588… or https://facebook.com/…"
            required
          />
        </div>
        <Button type="submit" className="sm:col-span-2" disabled={busy || !label.trim() || !value.trim()}>
          {busy ? "Saving…" : "Add help line"}
        </Button>
      </form>
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </Card>
  );
}
