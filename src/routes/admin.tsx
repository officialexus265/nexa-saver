import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TranslationStudio } from "@/components/translation-studio";
import { SessionGate } from "@/components/session-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import { TotpQr } from "@/components/totp-qr";
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
  adminGetSendFeeTiers,
  adminSetSendFeeTiers,
  adminListTransferReversals,
  adminLookupTransfer,
  adminFreezeTransfer,
  adminResolveTransfer,
  adminGetLoanPolicy,
  adminSetLoanPolicy,
  adminListLoans,
  adminGetReferralSettings,
  adminSetReferralSettings,
  adminGetSignupIntroVideo,
  adminSetSignupIntroVideo,
  adminUploadOgImage,
  adminGetSiteFooter,
  adminSetSiteFooter,
  adminTotpStatus,
  adminBeginTotpSetup,
  adminConfirmTotpSetup,
  adminDisableTotp,

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
  const [sendFeeTiers, setSendFeeTiers] = useState<
    Array<{ minKwacha: number; maxKwacha: number | null; feeKwacha: number }>
  >([]);
  const [sendFeeMsg, setSendFeeMsg] = useState<string | null>(null);
  const [sendFeeBusy, setSendFeeBusy] = useState(false);
  const [reversals, setReversals] = useState<
    Array<{
      requestId: number;
      requestStatus: string;
      reference: string;
      amountTambala: number;
      fromUsername: string;
      toUsername: string;
      transferStatus: string;
      frozenUntil: string | null;
      userNote: string | null;
    }>
  >([]);
  const [lookupRef, setLookupRef] = useState("");
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [loanInterest, setLoanInterest] = useState("3");
  const [loanLtv, setLoanLtv] = useState("90");
  const [loanPolicyMsg, setLoanPolicyMsg] = useState<string | null>(null);
  const [loanRows, setLoanRows] = useState<
    Array<{
      id: number;
      reference: string;
      principalTambala: number;
      balanceDueTambala: number;
      interestRateMonthly: number;
      collateralTambala: number;
      repaymentMode: string;
      status: string;
      startedAt: string;
      nextPeriodAt: string;
      periodsElapsed: number;
      closedAt: string | null;
      username: string;
      phone: string;
      fullName: string;
    }>
  >([]);
  const [loanQuery, setLoanQuery] = useState("");
  const [refEnabled, setRefEnabled] = useState(true);
  const [refCommission, setRefCommission] = useState("1");
  const [refMin, setRefMin] = useState("500");
  const [refFee, setRefFee] = useState("3");
  const [ogShareTitle, setOgShareTitle] = useState("");
  const [ogShareDesc, setOgShareDesc] = useState("");
  const [ogShareImage, setOgShareImage] = useState("/og.jpg");
  const [ogRefTitle, setOgRefTitle] = useState("");
  const [ogRefDesc, setOgRefDesc] = useState("");
  const [ogRefImage, setOgRefImage] = useState("/og.jpg");
  const [refMsg, setRefMsg] = useState<string | null>(null);
  const [signupVideoUrl, setSignupVideoUrl] = useState("");
  const [signupVideoMsg, setSignupVideoMsg] = useState<string | null>(null);
  const [ogBust, setOgBust] = useState(0);
  const [ogUploading, setOgUploading] = useState(false);
  const [footerCompanyName, setFooterCompanyName] = useState("NEXUS265");
  const [footerCompanyUrl, setFooterCompanyUrl] = useState("https://www.facebook.com/");
  const [footerMsg, setFooterMsg] = useState<string | null>(null);
  const [totpStatus, setTotpStatus] = useState<{
    enabled: boolean;
    elevated: boolean;
    configured?: boolean;
  } | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrUrl: string; otpauthUri: string } | null>(null);
  const [totpBackups, setTotpBackups] = useState<string[] | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpMsg, setTotpMsg] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);




  const [loanFilter, setLoanFilter] = useState<"all" | "active" | "closed">("all");



  const [adminTab, setAdminTab] = useState<"overview" | "accounts" | "money" | "tools" | "reversals" | "loans" | "translations">("overview");





  useEffect(() => {
    void adminTotpStatus()
      .then(setTotpStatus)
      .catch(() => setTotpStatus(null));
  }, []);

  useEffect(() => {
    void adminGetSiteFooter()
      .then((f) => {
        setFooterCompanyName(f.companyName);
        setFooterCompanyUrl(f.companyUrl);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    Promise.all([adminOverview(), adminUsers(), adminTransactions(), getPlatformSupportPhone(), adminSecuritySurveyStatus(), adminAnalytics(), adminGetPayoutMethods(), adminGetFeePolicy(), adminGetSendFeeTiers(), adminListTransferReversals(), adminGetLoanPolicy(), adminListLoans({ data: {} }), adminGetReferralSettings(), adminGetSignupIntroVideo()])
      .then(([o, u, t, s, sv, an, pm, fp, sft, rev, lp, loansList, refS, introVid]) => {
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
        if (sft) setSendFeeTiers(sft);
        if (rev) setReversals(rev);
        if (lp) {
          setLoanInterest(String(Math.round(lp.interestMonthly * 1000) / 10));
          setLoanLtv(String(Math.round(lp.ltvRate * 1000) / 10));
        }
        if (loansList) setLoanRows(loansList);
        if (refS) {
          setRefEnabled(refS.enabled);
          setRefCommission(String(Math.round(refS.rates.commissionRate * 1000) / 10));
          setRefMin(String(refS.rates.withdrawMinKwacha));
          setRefFee(String(Math.round(refS.rates.withdrawFeeRate * 1000) / 10));
          setOgShareTitle(refS.og.share.title);
          setOgShareDesc(refS.og.share.description);
          setOgShareImage(refS.og.share.image);
          setOgRefTitle(refS.og.referral.title);
          setOgRefDesc(refS.og.referral.description);
          setOgRefImage(refS.og.referral.image);
        }
        if (introVid) setSignupVideoUrl(introVid.urlOrId ?? "");
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
    { id: "reversals" as const, label: "Send reversals" },
    { id: "loans" as const, label: "Loans" },
    { id: "translations" as const, label: "Translate" },
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
        <button
          type="button"
          onClick={() => setAdminTab("translations")}
          className="group inline-flex h-10 items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 text-sm font-semibold text-primary shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-primary-fg hover:shadow-md active:translate-y-0"
        >
          <span aria-hidden className="text-base leading-none transition-transform duration-200 group-hover:scale-110">文A</span>
          Translate
        </button>
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
        <Stat label="Loan interest" value={formatKwacha(overview.loanInterestTambala ?? 0, { compact: true })} />
        <Stat label="Payout reserve" value={formatKwacha(overview.payoutReserveTambala, { compact: true })} />
        <Stat label="Savers" value={String(overview.userCount)} />
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Production readiness</h2>
          {overview?.productionReadiness ? (
            <span
              className={
                overview.productionReadiness.allCriticalOk &&
                overview.productionReadiness.depositsAllowed &&
                overview.productionReadiness.withdrawalsAllowed
                  ? "rounded-full bg-primary/20 px-3 py-1 text-xs font-medium text-primary"
                  : "rounded-full bg-danger/15 px-3 py-1 text-xs font-medium text-danger"
              }
            >
              {overview.productionReadiness.isProduction ? "Production" : "Non-production"}
              {overview.productionReadiness.allCriticalOk ? " · config OK" : " · fix env"}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          Phase A checks. In production, deposits, withdrawals, and sends stay blocked until critical items are green.
          Secrets are never shown here — only whether they are set.
        </p>
        {overview?.productionReadiness ? (
          <ul className="space-y-2 text-sm">
            {overview.productionReadiness.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-fg">
                    <span className={item.ok ? "text-primary" : "text-danger"}>{item.ok ? "●" : "○"}</span>{" "}
                    {item.label}
                    {item.critical ? <span className="text-xs text-muted"> · required</span> : null}
                  </p>
                  {!item.ok ? <p className="mt-0.5 text-xs text-muted">{item.hint}</p> : null}
                </div>
                <span className={item.ok ? "text-xs text-primary" : "text-xs text-danger"}>
                  {item.ok ? "OK" : "Missing"}
                </span>
              </li>
            ))}
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
              <span className="font-medium">Deposits kill-switch</span>
              <span className={overview.productionReadiness.depositsAllowed ? "text-xs text-primary" : "text-xs text-danger"}>
                {overview.productionReadiness.depositsAllowed ? "Allowed" : "Paused (NEXA_PAUSE_DEPOSITS / ALL)"}
              </span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
              <span className="font-medium">Withdrawals kill-switch</span>
              <span
                className={
                  overview.productionReadiness.withdrawalsAllowed ? "text-xs text-primary" : "text-xs text-danger"
                }
              >
                {overview.productionReadiness.withdrawalsAllowed
                  ? "Allowed"
                  : "Paused (NEXA_PAUSE_WITHDRAWALS / ALL)"}
              </span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted">Loading checklist…</p>
        )}
      </Card>

      <Card className="space-y-3 p-4 border-primary/30">
        <h2 className="font-display text-lg font-semibold">Admin authenticator (2FA)</h2>
        <p className="text-sm text-muted">
          Protect force-credit, user delete/lock, fee changes, treasury withdraw, and other sensitive actions.
          Use Google Authenticator, Authy, or any TOTP app. Save backup codes offline.
        </p>
        {totpStatus ? (
          <p className="text-sm">
            Status:{" "}
            <span className={totpStatus.enabled ? "text-primary font-medium" : "text-danger font-medium"}>
              {totpStatus.enabled ? "Enabled" : "Not enabled"}
            </span>
            {totpStatus.enabled ? (
              <span className="text-muted">
                {" "}
                · this session {totpStatus.elevated ? "verified" : "needs code"}
              </span>
            ) : null}
          </p>
        ) : null}
        {totpBackups ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-fg">Save these backup codes now (shown once)</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
              {totpBackups.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button type="button" variant="secondary" className="mt-2" onClick={() => setTotpBackups(null)}>
              I saved them
            </Button>
          </div>
        ) : null}
        {totpSetup && !totpStatus?.enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Scan this QR with your authenticator app, or enter the secret manually.</p>
            <TotpQr otpauthUri={totpSetup.otpauthUri} />
            <p className="text-center text-xs text-muted">Or enter this secret manually:</p>
            <p className="break-all text-center font-mono text-xs text-fg">{totpSetup.secret}</p>
            <input
              className="flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-center tracking-widest"
              placeholder="6-digit code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, "").slice(0, 8))}
            />
            <Button
              type="button"
              disabled={totpBusy || totpCode.length < 6}
              onClick={() => {
                setTotpBusy(true);
                setTotpMsg(null);
                void adminConfirmTotpSetup({ data: { code: totpCode } })
                  .then((r) => {
                    setTotpBackups(r.backupCodes);
                    setTotpSetup(null);
                    setTotpCode("");
                    return adminTotpStatus().then(setTotpStatus);
                  })
                  .then(() => setTotpMsg("2FA enabled."))
                  .catch((err) => setTotpMsg(errMessage(err)))
                  .finally(() => setTotpBusy(false));
              }}
            >
              Confirm and enable
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!totpStatus?.enabled ? (
            <Button
              type="button"
              disabled={totpBusy}
              onClick={() => {
                setTotpBusy(true);
                setTotpMsg(null);
                void adminBeginTotpSetup()
                  .then(setTotpSetup)
                  .catch((err) => setTotpMsg(errMessage(err)))
                  .finally(() => setTotpBusy(false));
              }}
            >
              Set up 2FA
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={totpBusy || totpCode.length < 6}
              onClick={() => {
                setTotpBusy(true);
                setTotpMsg(null);
                void adminDisableTotp({ data: { code: totpCode } })
                  .then(() => {
                    setTotpCode("");
                    setTotpSetup(null);
                    return adminTotpStatus().then(setTotpStatus);
                  })
                  .then(() => setTotpMsg("2FA disabled."))
                  .catch((err) => setTotpMsg(errMessage(err)))
                  .finally(() => setTotpBusy(false));
              }}
            >
              Disable 2FA (enter code first)
            </Button>
          )}
        </div>
        {totpStatus?.enabled ? (
          <input
            className="flex h-11 w-full max-w-xs rounded-xl border border-border bg-surface-2 px-3 text-center tracking-widest"
            placeholder="Code to disable"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, "").slice(0, 16))}
          />
        ) : null}
        {totpMsg ? <p className="text-sm text-muted">{totpMsg}</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Treasury (platform profit)</h2>
        <p className="text-sm text-muted">
          Book profit is fee income from deposits. Saver balances are liabilities — never withdrawn here.
          Treasury cash-out uses deposit book profit, early-unlock fees, and loan interest collected from users, minus what you already paid out. ~1.8% applies on the mobile-money rail.
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
        <h2 className="font-display text-lg font-semibold">Footer / developer credit</h2>
        <p className="text-sm text-muted">
          Shown on login and in the app as &quot;Developed by …&quot;. Link should be your official Facebook page (or any
          public page).
        </p>
        <div className="space-y-1.5">
          <Label>Company name</Label>
          <Input value={footerCompanyName} onChange={(e) => setFooterCompanyName(e.target.value)} placeholder="NEXUS265" />
        </div>
        <div className="space-y-1.5">
          <Label>Link (Facebook or website)</Label>
          <Input value={footerCompanyUrl} onChange={(e) => setFooterCompanyUrl(e.target.value)} placeholder="https://www.facebook.com/…" />
        </div>
        <Button
          type="button"
          onClick={() => {
            setFooterMsg(null);
            void adminSetSiteFooter({
              data: { companyName: footerCompanyName, companyUrl: footerCompanyUrl },
            })
              .then(() => setFooterMsg("Footer saved."))
              .catch((err) => setFooterMsg(errMessage(err)));
          }}
        >
          Save footer
        </Button>
        {footerMsg ? <p className="text-sm text-muted">{footerMsg}</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Signup explainer video</h2>
        <p className="text-sm text-muted">
          YouTube link or video id shown when a new user is not familiar with the system. Leave empty to skip the video
          and send them straight to sign up.
        </p>
        <div className="space-y-1.5">
          <Label>YouTube URL or video id</Label>
          <Input
            value={signupVideoUrl}
            onChange={(e) => setSignupVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… or plain id"
          />
        </div>
        <Button
          type="button"
          onClick={() => {
            setSignupVideoMsg(null);
            void adminSetSignupIntroVideo({ data: { urlOrId: signupVideoUrl } })
              .then((r) =>
                setSignupVideoMsg(
                  r.videoId
                    ? `Saved. Embed id: ${r.videoId}`
                    : "Cleared — sign-up will not show a video until you set a link.",
                ),
              )
              .catch((err) => setSignupVideoMsg(errMessage(err)));
          }}
        >
          Save explainer video
        </Button>
        {signupVideoMsg ? <p className="text-sm text-muted">{signupVideoMsg}</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Referral program</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={refEnabled} onChange={(e) => setRefEnabled(e.target.checked)} />
          Program enabled (off = no new affiliates / no new first-deposit commissions; withdrawals still allowed)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label>Commission % (first deposit)</Label>
            <Input value={refCommission} onChange={(e) => setRefCommission(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Min withdraw (MWK)</Label>
            <Input value={refMin} onChange={(e) => setRefMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Withdraw fee %</Label>
            <Input value={refFee} onChange={(e) => setRefFee(e.target.value)} />
          </div>
        </div>
        <p className="text-xs font-medium text-muted">Share / invite titles</p>
        <Input placeholder="Share title" value={ogShareTitle} onChange={(e) => setOgShareTitle(e.target.value)} />
        <Input placeholder="Share description" value={ogShareDesc} onChange={(e) => setOgShareDesc(e.target.value)} />
        <Input placeholder="Referral title" value={ogRefTitle} onChange={(e) => setOgRefTitle(e.target.value)} />
        <Input placeholder="Referral description" value={ogRefDesc} onChange={(e) => setOgRefDesc(e.target.value)} />

        <p className="text-xs font-medium text-muted">Platform OG image (one image for the whole site)</p>
        <p className="text-xs text-muted">
          Used for normal link shares and referral invites. Replaces the old static <code className="text-fg">/og.jpg</code>{" "}
          when set. Upload any filename — it overwrites the previous image.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium disabled:opacity-50">
            {ogUploading ? "Uploading…" : "Upload OG image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={ogUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setOgUploading(true);
                setRefMsg(null);

                const compressAndUpload = async () => {
                  // Resize/compress in the browser so the request stays under server limits
                  const bitmap = await createImageBitmap(file);
                  const maxW = 1200;
                  const scale = Math.min(1, maxW / bitmap.width);
                  const w = Math.round(bitmap.width * scale);
                  const h = Math.round(bitmap.height * scale);
                  const canvas = document.createElement("canvas");
                  canvas.width = w;
                  canvas.height = h;
                  const ctx = canvas.getContext("2d");
                  if (!ctx) throw new Error("Could not process image");
                  ctx.drawImage(bitmap, 0, 0, w, h);
                  bitmap.close();

                  const blob: Blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(
                      (b) => (b ? resolve(b) : reject(new Error("Compress failed"))),
                      "image/jpeg",
                      0.85,
                    );
                  });
                  if (blob.size > 1.2 * 1024 * 1024) {
                    throw new Error("Image is still large after compress. Try a simpler photo under 2 MB.");
                  }

                  const dataUrl: string = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ""));
                    reader.onerror = () => reject(new Error("Could not read image"));
                    reader.readAsDataURL(blob);
                  });
                  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
                  if (!m) throw new Error("Could not encode image");

                  const r = await adminUploadOgImage({
                    data: { mime: m[1], base64: m[2] },
                  });
                  setOgShareImage(r.path);
                  setOgRefImage(r.paths?.referral ?? r.path);
                  setOgBust(Date.now());
                  setRefMsg("OG image uploaded. Preview should update below.");
                };

                void compressAndUpload()
                  .catch((err) => setRefMsg(errMessage(err)))
                  .finally(() => setOgUploading(false));
              }}
            />
          </label>
        </div>
        <img
          src={`${ogShareImage.startsWith("/api/") ? ogShareImage : "/api/og-image/share"}?t=${ogBust || "1"}`}
          alt="Platform OG preview"
          className="max-h-36 rounded-lg border border-border object-cover"
          onError={(ev) => {
            (ev.target as HTMLImageElement).style.opacity = "0.4";
          }}
        />

        <Button
          type="button"
          onClick={() => {
            setRefMsg(null);
            void adminSetReferralSettings({
              data: {
                enabled: refEnabled,
                commissionPercent: Number(refCommission),
                withdrawMinKwacha: Number(refMin),
                withdrawFeePercent: Number(refFee),
                ogShareTitle,
                ogShareDescription: ogShareDesc,
                ogShareImage,
                ogReferralTitle: ogRefTitle,
                ogReferralDescription: ogRefDesc,
                ogReferralImage: ogRefImage,
              },
            })
              .then(() => setRefMsg("Referral settings saved."))
              .catch((err) => setRefMsg(errMessage(err)));
          }}
        >
          Save referral settings
        </Button>
        {refMsg ? <p className="text-sm text-muted">{refMsg}</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Loan policy</h2>
        <p className="text-sm text-muted">
          Loans only against a voluntary withdrawal time-lock (not admin locks). LTV is % of locked balance. Interest is
          charged per full month period on the amount due.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Monthly interest %</Label>
            <Input value={loanInterest} inputMode="decimal" onChange={(e) => setLoanInterest(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Max LTV %</Label>
            <Input value={loanLtv} inputMode="decimal" onChange={(e) => setLoanLtv(e.target.value)} />
          </div>
        </div>
        <Button
          type="button"
          onClick={() => {
            setLoanPolicyMsg(null);
            void adminSetLoanPolicy({
              data: {
                interestPercent: Number(loanInterest),
                ltvPercent: Number(loanLtv),
              },
            })
              .then((p) => {
                setLoanInterest(String(Math.round(p.interestMonthly * 1000) / 10));
                setLoanLtv(String(Math.round(p.ltvRate * 1000) / 10));
                setLoanPolicyMsg("Loan policy saved.");
              })
              .catch((err) => setLoanPolicyMsg(errMessage(err)));
          }}
        >
          Save loan policy
        </Button>
        {loanPolicyMsg ? <p className="text-sm text-muted">{loanPolicyMsg}</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Send money fees (fixed kwacha)</h2>
        <p className="text-sm text-muted">
          Charged from the sender&apos;s balance. Recipient always receives the full typed amount. Send is disabled when
          withdrawals are paused or locked.
        </p>
        <ul className="space-y-2">
          {sendFeeTiers.map((tier, i) => (
            <li key={i} className="grid grid-cols-3 gap-2">
              <Input
                inputMode="numeric"
                value={String(tier.minKwacha)}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, "")) || 0;
                  setSendFeeTiers((rows) => rows.map((r, j) => (j === i ? { ...r, minKwacha: v } : r)));
                }}
                aria-label="Min kwacha"
              />
              <Input
                inputMode="numeric"
                placeholder="max or empty"
                value={tier.maxKwacha == null ? "" : String(tier.maxKwacha)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  const v = raw === "" ? null : Number(raw);
                  setSendFeeTiers((rows) => rows.map((r, j) => (j === i ? { ...r, maxKwacha: v } : r)));
                }}
                aria-label="Max kwacha"
              />
              <Input
                inputMode="numeric"
                value={String(tier.feeKwacha)}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, "")) || 0;
                  setSendFeeTiers((rows) => rows.map((r, j) => (j === i ? { ...r, feeKwacha: v } : r)));
                }}
                aria-label="Fee kwacha"
              />
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted">Columns: min · max (blank = no upper limit) · fee in kwacha</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setSendFeeTiers((rows) => [...rows, { minKwacha: 0, maxKwacha: null, feeKwacha: 0 }])
            }
          >
            Add tier
          </Button>
          <Button
            type="button"
            disabled={sendFeeBusy}
            onClick={() => {
              setSendFeeBusy(true);
              setSendFeeMsg(null);
              void adminSetSendFeeTiers({ data: { tiers: sendFeeTiers } })
                .then((rows) => {
                  setSendFeeTiers(rows);
                  setSendFeeMsg("Send fee tiers saved.");
                })
                .catch((err) => setSendFeeMsg(errMessage(err)))
                .finally(() => setSendFeeBusy(false));
            }}
          >
            {sendFeeBusy ? "Saving…" : "Save send fees"}
          </Button>
        </div>
        {sendFeeMsg ? <p className="text-sm text-muted">{sendFeeMsg}</p> : null}
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



      {adminTab === "loans" ? (
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Loans</h2>
            <p className="text-sm text-muted">
              Active and closed loans against voluntary time-locks. Interest earned appears on Overview.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-md">
            <Label htmlFor="loan-search">Search</Label>
            <Input
              id="loan-search"
              value={loanQuery}
              onChange={(e) => setLoanQuery(e.target.value)}
              placeholder="Reference, username, phone, name…"
              className="w-full"
            />
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface-2 p-1">
          {(
            [
              { id: "all" as const, label: "All" },
              { id: "active" as const, label: "Active" },
              { id: "closed" as const, label: "Closed" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setLoanFilter(f.id)}
              className={
                loanFilter === f.id
                  ? "shrink-0 rounded-xl bg-surface px-4 py-2 text-sm font-medium text-fg shadow-sm"
                  : "shrink-0 rounded-xl px-4 py-2 text-sm text-muted"
              }
            >
              {f.label}
              {f.id === "active"
                ? ` (${loanRows.filter((l) => l.status === "active").length})`
                : f.id === "closed"
                  ? ` (${loanRows.filter((l) => l.status !== "active" && l.status !== "cancelled").length})`
                  : ` (${loanRows.length})`}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium text-right">Principal</th>
                <th className="px-4 py-3 font-medium text-right">Due</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Period / closed</th>
              </tr>
            </thead>
            <tbody>
              {loanRows
                .filter((l) => {
                  if (loanFilter === "active") return l.status === "active";
                  if (loanFilter === "closed") return l.status !== "active";
                  return true;
                })
                .filter((l) => {
                  const q = loanQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    l.reference.toLowerCase().includes(q) ||
                    l.username.toLowerCase().includes(q) ||
                    l.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
                    l.fullName.toLowerCase().includes(q) ||
                    l.status.toLowerCase().includes(q)
                  );
                })
                .map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-4 py-3 align-middle">
                      <p className="font-medium">{l.fullName}</p>
                      <p className="text-xs text-muted">
                        @{l.username} · {l.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-middle font-mono text-xs">{l.reference}</td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums whitespace-nowrap">
                      {formatKwacha(l.principalTambala, { compact: true })}
                    </td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums whitespace-nowrap">
                      {l.status === "active"
                        ? formatKwacha(l.balanceDueTambala, { compact: true })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 align-middle text-xs whitespace-nowrap">
                      <span
                        className={
                          l.status === "active"
                            ? "text-primary"
                            : l.status === "paid"
                              ? "text-muted"
                              : "text-warn"
                        }
                      >
                        {l.status}
                      </span>
                      <span className="block text-faint">
                        {l.repaymentMode} · {(l.interestRateMonthly * 100).toFixed(1)}%/mo · {l.periodsElapsed} periods
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-muted whitespace-nowrap">
                      {l.status === "active" ? (
                        <>Due period ends {new Date(l.nextPeriodAt).toLocaleString()}</>
                      ) : l.closedAt ? (
                        <>Closed {new Date(l.closedAt).toLocaleString()}</>
                      ) : (
                        <>Started {new Date(l.startedAt).toLocaleString()}</>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!loanRows.length ? (
            <p className="p-4 text-sm text-muted">No loans yet. Users apply from the dashboard while self-locked.</p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void adminListLoans({ data: { q: loanQuery.trim() || undefined } })
              .then(setLoanRows)
              .catch((err) => setError(errMessage(err)));
          }}
        >
          Refresh loans
        </Button>
      </div>
      ) : null}

      {adminTab === "reversals" ? (
      <div className="space-y-5">
        <Card className="space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">Look up transfer ID</h2>
          <p className="text-sm text-muted">
            When a user reports a wrong send, take their transaction ID, freeze the transfer (2 days), and email the
            recipient. Then reverse or release after review.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={lookupRef}
              onChange={(e) => setLookupRef(e.target.value.trim())}
              placeholder="SND_…"
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => {
                setLookupMsg(null);
                void adminLookupTransfer({ data: { reference: lookupRef } })
                  .then((tr) => {
                    setLookupMsg(
                      `${tr.reference}: ${tr.fromUsername} → ${tr.toUsername} · ${tr.amountTambala / 100} MWK · ${tr.status}`,
                    );
                  })
                  .catch((err) => setLookupMsg(errMessage(err)));
              }}
            >
              Look up
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLookupMsg(null);
                void adminFreezeTransfer({ data: { reference: lookupRef, days: 2 } })
                  .then((r) => {
                    setLookupMsg(`Frozen until ${new Date(r.frozenUntil).toLocaleString()}. Recipient emailed.`);
                    return adminListTransferReversals();
                  })
                  .then(setReversals)
                  .catch((err) => setLookupMsg(errMessage(err)));
              }}
            >
              Freeze 2 days
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void adminResolveTransfer({ data: { reference: lookupRef, action: "reverse" } })
                  .then(() => {
                    setLookupMsg("Reversed — amount returned to sender (fee stays with platform).");
                    return adminListTransferReversals();
                  })
                  .then(setReversals)
                  .catch((err) => setLookupMsg(errMessage(err)));
              }}
            >
              Reverse
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void adminResolveTransfer({ data: { reference: lookupRef, action: "release" } })
                  .then(() => {
                    setLookupMsg("Released to recipient.");
                    return adminListTransferReversals();
                  })
                  .then(setReversals)
                  .catch((err) => setLookupMsg(errMessage(err)));
              }}
            >
              Release
            </Button>
          </div>
          {lookupMsg ? <p className="text-sm text-muted">{lookupMsg}</p> : null}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">Reversal requests</h2>
          {!reversals.length ? (
            <p className="text-sm text-muted">No requests yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {reversals.map((r) => (
                <li key={r.requestId} className="rounded-xl border border-border bg-surface-2 p-3">
                  <p className="font-medium">
                    {r.reference}{" "}
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => setLookupRef(r.reference)}
                    >
                      use ID
                    </button>
                  </p>
                  <p className="text-muted">
                    {r.fromUsername} → {r.toUsername} · {(r.amountTambala / 100).toLocaleString()} MWK · req{" "}
                    {r.requestStatus} · transfer {r.transferStatus}
                  </p>
                  {r.userNote ? <p className="text-xs">Note: {r.userNote}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      ) : null}

      {adminTab === "translations" ? (
        <div className="space-y-5" data-nexa-translate-studio>
          <TranslationStudio />
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
