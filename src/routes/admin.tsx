import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TranslationStudio } from "@/components/translation-studio";
import { SessionGate } from "@/components/session-gate";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import { TotpQr } from "@/components/totp-qr";
import {
  adminOverview,
  adminFundsAudit,
  adminTreasuryHistory,
  adminTreasuryToMain,
  adminCoverAuditShortage,
  adminRecalculatePayoutReserve,
  adminRestoreAuditCovers,
  adminListAuditCovers,
  adminTransactions,
  adminUsers,
  adminLookupReference,
  adminForceCreditDeposit,
  adminReverseFalseWithdrawal,
  adminResolveStuckDeposits,
  adminResolvePendingDeposit,
  adminSecurityChecklist,
  adminSetLaunchSettings,
  adminGetLaunchSettings,
  adminSetKycThreshold,
  adminReviewKyc,
  adminListKycQueue,
  runReconciliationFn,
  adminSetMoneyPause,
  adminGetReconHistory,
  adminGetOpsQueue,
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
  adminGetRailOutage,
  adminSetRailOutage,
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
  adminGetTutorials,
  adminSetTutorials,
  adminSetTutorialsFeature,
  adminGetLegalDoc,
  adminSetLegalDoc,


  adminUploadOgImage,
  adminGetSiteFooter,
  adminSetSiteFooter,
  adminTotpStatus,
  adminBeginTotpSetup,
  adminConfirmTotpSetup,
  adminDisableTotp,
  adminListPasskeys,
  adminWebAuthnRegisterOptions,
  adminWebAuthnRegisterVerify,
  adminDeletePasskey,


  adminTreasuryWithdraw,
  adminTreasurySendToPhone,
  adminLookupMomoRecipient,
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
  const [fundsAudit, setFundsAudit] = useState<Awaited<ReturnType<typeof adminFundsAudit>> | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [reserveRecalcBusy, setReserveRecalcBusy] = useState(false);
  const [reserveRecalcPin, setReserveRecalcPin] = useState("");
  const [reserveRecalcMsg, setReserveRecalcMsg] = useState<string | null>(null);
  const [reserveRecalcResult, setReserveRecalcResult] = useState<Awaited<
    ReturnType<typeof adminRecalculatePayoutReserve>
  > | null>(null);
  const [auditErr, setAuditErr] = useState<string | null>(null);
  const [coverPin, setCoverPin] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverSuccess, setCoverSuccess] = useState<{ amountTambala: number; reference: string } | null>(null);
  const [auditCovers, setAuditCovers] = useState<Awaited<ReturnType<typeof adminListAuditCovers>> | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restorePin, setRestorePin] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState<{ amountTambala: number; count: number; reference: string } | null>(null);


  const [histFrom, setHistFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [histTo, setHistTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [histBusy, setHistBusy] = useState(false);
  const [histErr, setHistErr] = useState<string | null>(null);
  const [treasuryHistory, setTreasuryHistory] = useState<Awaited<ReturnType<typeof adminTreasuryHistory>> | null>(null);

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
  const [accountsPage, setAccountsPage] = useState(0);
  const [accountsShowAll, setAccountsShowAll] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerShowAll, setLedgerShowAll] = useState(false);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof adminAnalytics>> | null>(null);
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);
  const [payoutMethods, setPayoutMethods] = useState<{ momo: boolean; bank: boolean } | null>(null);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [railOutage, setRailOutage] = useState<{
    enabled: boolean;
    airtelDown: boolean;
    tnmDown: boolean;
    bankDown: boolean;
    bankNamesDown: string[];
    message: string;
  } | null>(null);
  const [railBankNamesText, setRailBankNamesText] = useState("");
  const [railMsg, setRailMsg] = useState<string | null>(null);
  const [railBusy, setRailBusy] = useState(false);
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
  const [reverseWthId, setReverseWthId] = useState("");
  const [reverseWthRef, setReverseWthRef] = useState("");
  const [reverseWthReason, setReverseWthReason] = useState("Never paid by PayChangu — marked success in error");
  const [reverseWthPin, setReverseWthPin] = useState("");
  const [reverseWthBusy, setReverseWthBusy] = useState(false);
  const [reverseWthMsg, setReverseWthMsg] = useState<string | null>(null);
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
  const [tutorialsDraft, setTutorialsDraft] = useState<
    Array<{ title: string; description: string; urlOrId: string }>
  >([{ title: "", description: "", urlOrId: "" }]);
  const [tutorialsMsg, setTutorialsMsg] = useState<string | null>(null);
  const [tutorialsEnabled, setTutorialsEnabled] = useState(false);

  const [legalKind, setLegalKind] = useState<"terms" | "privacy">("terms");
  const [legalBody, setLegalBody] = useState("");
  const [legalPlaceholders, setLegalPlaceholders] = useState<
    Array<{ key: string; label: string; example: string }>
  >([]);
  const [legalLive, setLegalLive] = useState<Record<string, string>>({});
  const [legalMsg, setLegalMsg] = useState<string | null>(null);
  const [opsQueue, setOpsQueue] = useState<Awaited<ReturnType<typeof adminGetOpsQueue>> | null>(null);
  const [reconHistory, setReconHistory] = useState<Awaited<ReturnType<typeof adminGetReconHistory>>>([]);
  const [reconLatest, setReconLatest] = useState<Awaited<ReturnType<typeof runReconciliationFn>> | null>(null);
  const [opsMsg, setOpsMsg] = useState<string | null>(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const [kycQueue, setKycQueue] = useState<Awaited<ReturnType<typeof adminListKycQueue>> | null>(null);
  const [kycThreshold, setKycThreshold] = useState("100000");
  const [launchSignup, setLaunchSignup] = useState(true);
  const [launchBeta, setLaunchBeta] = useState(false);
  const [launchCap, setLaunchCap] = useState("5000");
  const [launchBanner, setLaunchBanner] = useState("");
  const [launchNotes, setLaunchNotes] = useState("");
  const [securityChecks, setSecurityChecks] = useState<Awaited<ReturnType<typeof adminSecurityChecklist>> | null>(null);



  const [pauseNote, setPauseNote] = useState("");

  const legalTextareaRef = useRef<HTMLTextAreaElement | null>(null);


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
  const [passkeys, setPasskeys] = useState<Array<{ id: string; nickname: string; createdAt: string }>>([]);





  const [loanFilter, setLoanFilter] = useState<"all" | "active" | "closed">("all");



  const [adminTab, setAdminTab] = useState<"overview" | "accounts" | "money" | "tools" | "ops" | "reversals" | "loans" | "translations" | "legal">("overview");
  const [navGroupOpen, setNavGroupOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!navRef.current?.contains(e.target as Node)) setNavGroupOpen(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);





  useEffect(() => {
    if (adminTab !== "ops") return;
    setOpsMsg(null);
    void Promise.all([
      adminGetOpsQueue(),
      adminGetReconHistory(),
      adminListKycQueue(),
      adminGetLaunchSettings(),
      adminSecurityChecklist(),
    ])
      .then(([q, h, kyc, launch, sec]) => {
        setOpsQueue(q);
        setReconHistory(h);
        if (q.pause.note) setPauseNote(q.pause.note);
        setKycQueue(kyc);
        setKycThreshold(String(kyc.thresholdKwacha));
        setLaunchSignup(launch.signupEnabled);
        setLaunchBeta(launch.betaMode);
        setLaunchCap(String(launch.betaDepositCapKwacha || 5000));
        setLaunchBanner(launch.publicBanner || "");
        setLaunchNotes(launch.incidentNotes || "");
        setSecurityChecks(sec);
      })
      .catch((err) => setOpsMsg(errMessage(err)));
  }, [adminTab]);

  useEffect(() => {
    if (adminTab !== "legal") return;
    setLegalMsg(null);
    void adminGetLegalDoc({ data: { kind: legalKind } })
      .then((r) => {
        setLegalBody(r.body);
        setLegalPlaceholders(r.placeholders);
        setLegalLive(r.liveValues);
      })
      .catch((err) => setLegalMsg(errMessage(err)));
  }, [adminTab, legalKind]);

  useEffect(() => {
    void adminGetTutorials()
      .then((r) => {
        setTutorialsEnabled(Boolean(r.enabled));
        if (r.items?.length) {
          setTutorialsDraft(
            r.items.map((t) => ({
              title: t.title,
              description: t.description || "",
              urlOrId: t.youtubeId,
            })),
          );
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void adminTotpStatus()
      .then(setTotpStatus)
      .catch(() => setTotpStatus(null));
    void adminListPasskeys()
      .then(setPasskeys)
      .catch(() => setPasskeys([]));
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
    Promise.all([adminOverview(), adminUsers(), adminTransactions(), getPlatformSupportPhone(), adminSecuritySurveyStatus(), adminAnalytics(), adminGetPayoutMethods(), adminGetFeePolicy(), adminGetSendFeeTiers(), adminListTransferReversals(), adminGetLoanPolicy(), adminListLoans({ data: {} }), adminGetReferralSettings(), adminGetSignupIntroVideo(), adminGetTutorials()])
      .then(([o, u, t, s, sv, an, pm, fp, sft, rev, lp, loansList, refS, introVid]) => {
        setOverview(o);
        setUsers(u);
        setTxs(t);
        if (s.phone) setSupportPhone(s.phone);
        setSurveyStatus(sv);
        setAnalytics(an);
        setPayoutMethods(pm);
        void adminGetRailOutage()
          .then((r) => {
            setRailOutage(r);
            setRailBankNamesText((r.bankNamesDown || []).join(", "));
          })
          .catch(() => setRailOutage(null));
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

  type AdminTabId = typeof adminTab;
  const tabGroups: Array<{
    id: string;
    label: string;
    items: Array<{ id: AdminTabId; label: string }>;
  }> = [
    {
      id: "home",
      label: "Home",
      items: [{ id: "overview", label: "Overview" }],
    },
    {
      id: "users",
      label: "Users",
      items: [
        { id: "accounts", label: "Accounts" },
        { id: "loans", label: "Loans" },
        { id: "reversals", label: "Send reversals" },
      ],
    },
    {
      id: "finance",
      label: "Finance",
      items: [{ id: "money", label: "Fees & payouts" }],
    },
    {
      id: "platform",
      label: "Platform",
      items: [
        { id: "tools", label: "Tools" },
        { id: "ops", label: "Ops" },
        { id: "legal", label: "Legal" },
      ],
    },
    {
      id: "content",
      label: "Content",
      items: [{ id: "translations", label: "Translate" }],
    },
  ];

  function groupActive(groupId: string) {
    const g = tabGroups.find((x) => x.id === groupId);
    return g ? g.items.some((i) => i.id === adminTab) : false;
  }

  function groupLabel(groupId: string) {
    const g = tabGroups.find((x) => x.id === groupId);
    if (!g) return "";
    const active = g.items.find((i) => i.id === adminTab);
    return active ? active.label : g.label;
  }

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
      </div>

      <div
        ref={navRef}
        className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface-2 p-1"
      >
        {tabGroups.map((group) => {
          const single = group.items.length === 1;
          const open = navGroupOpen === group.id;
          const active = groupActive(group.id);

          if (single) {
            const only = group.items[0]!;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setAdminTab(only.id);
                  setNavGroupOpen(null);
                }}
                className={
                  adminTab === only.id
                    ? "rounded-xl bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-sm"
                    : "rounded-xl px-4 py-2.5 text-sm text-muted hover:text-fg"
                }
              >
                {only.label}
              </button>
            );
          }

          return (
            <div key={group.id} className="relative">
              <button
                type="button"
                onClick={() => setNavGroupOpen(open ? null : group.id)}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-xl bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm text-muted hover:text-fg"
                }
                aria-expanded={open}
                aria-haspopup="menu"
              >
                {groupLabel(group.id)}
                <span className="text-xs opacity-70" aria-hidden>
                  ▾
                </span>
              </button>
              {open ? (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-30 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
                >
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAdminTab(item.id);
                        setNavGroupOpen(null);
                      }}
                      className={
                        adminTab === item.id
                          ? "block w-full px-4 py-2.5 text-left text-sm font-medium text-primary"
                          : "block w-full px-4 py-2.5 text-left text-sm text-fg hover:bg-surface-2"
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
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
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium text-fg">Security keys / passkeys</p>
          <p className="mt-1 text-xs text-muted">
            Hardware keys (YubiKey, etc.) or platform passkeys. Works as an alternative to the authenticator app.
          </p>
          {passkeys.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {passkeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span>{k.nickname}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void adminDeletePasskey({ data: { id: k.id } })
                        .then(() => adminListPasskeys().then(setPasskeys))
                        .catch((err) => setTotpMsg(errMessage(err)));
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">No keys registered yet.</p>
          )}
          <Button
            type="button"
            className="mt-2"
            variant="secondary"
            disabled={totpBusy}
            onClick={() => {
              setTotpBusy(true);
              setTotpMsg(null);
              void (async () => {
                try {
                  const opts = await adminWebAuthnRegisterOptions();
                  const { startRegistration } = await import("@simplewebauthn/browser");
                  const att = await startRegistration({ optionsJSON: opts });
                  await adminWebAuthnRegisterVerify({
                    data: { response: att, nickname: "Security key" },
                  });
                  setPasskeys(await adminListPasskeys());
                  setTotpMsg("Security key registered. You can use it at the next admin login.");
                } catch (err) {
                  setTotpMsg(errMessage(err));
                } finally {
                  setTotpBusy(false);
                }
              })();
            }}
          >
            {totpBusy ? "Waiting for key…" : "Register security key / passkey"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Treasury (platform profit)</h2>
        <p className="text-sm text-muted">
          Book profit is fee income from deposits. Saver balances are liabilities — never withdrawn here.
          Treasury cash-out uses deposit book profit, early-unlock fees, and loan interest collected from users, minus what you already paid out. ~1.8% applies on the mobile-money rail.
        </p>
        {overview ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SurveyStat label="Deposit profit" value={formatKwacha(overview.platformProfitTambala)} />
            <SurveyStat label="Send fees (NEXA→NEXA)" value={formatKwacha(overview.sendFeesTambala ?? 0)} />
            <SurveyStat label="Early unlock fees" value={formatKwacha(overview.earlyUnlockFeesTambala ?? 0)} />
            <SurveyStat label="Loan interest" value={formatKwacha(overview.loanInterestTambala ?? 0)} />
            <SurveyStat
              label="All platform profits"
              value={formatKwacha(
                overview.totalPlatformProfitTambala ??
                  overview.platformProfitTambala +
                    (overview.sendFeesTambala ?? 0) +
                    (overview.earlyUnlockFeesTambala ?? 0) +
                    (overview.loanInterestTambala ?? 0),
              )}
            />
            <SurveyStat label="Withdrawable total" value={formatKwacha(overview.treasuryAvailableTambala)} />
            <SurveyStat label="Already paid out" value={formatKwacha(overview.treasuryPaidOutTambala)} />
            <SurveyStat label="Saver balances (liability)" value={formatKwacha(overview.userBalancesTambala)} />
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

        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <h3 className="font-medium">Profit history</h3>
          <p className="text-xs text-muted">
            Pick a period to see monthly platform profits and treasury withdrawals.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="hist-from">From</Label>
              <Input id="hist-from" type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hist-to">To</Label>
              <Input id="hist-to" type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={histBusy}
              onClick={() => {
                setHistBusy(true);
                setHistErr(null);
                void adminTreasuryHistory({ data: { from: histFrom, to: histTo } })
                  .then(setTreasuryHistory)
                  .catch((e) => setHistErr(errMessage(e)))
                  .finally(() => setHistBusy(false));
              }}
            >
              {histBusy ? "Fetching…" : "Fetch history"}
            </Button>
          </div>
          {histErr ? <p className="text-sm text-danger">{histErr}</p> : null}
          {treasuryHistory ? (
            <div className="space-y-2 overflow-x-auto text-sm">
              <p className="text-xs text-muted">
                Total profit {formatKwacha(treasuryHistory.totals.profitTambala)} · Withdrawn{" "}
                {formatKwacha(treasuryHistory.totals.withdrawnTambala)} · Net{" "}
                {formatKwacha(treasuryHistory.totals.netTambala)}
              </p>
              <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="py-1.5 pr-2 font-medium">Month</th>
                    <th className="py-1.5 pr-2 font-medium">Deposit profit</th>
                    <th className="py-1.5 pr-2 font-medium">Fee income</th>
                    <th className="py-1.5 pr-2 font-medium">Total made</th>
                    <th className="py-1.5 font-medium">Withdrawn</th>
                  </tr>
                </thead>
                <tbody>
                  {treasuryHistory.months.map((m) => (
                    <tr key={m.month} className="border-b border-border/60">
                      <td className="py-1.5 pr-2 tabular-nums">{m.month}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{formatKwacha(m.depositProfitTambala)}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{formatKwacha(m.feeIncomeTambala)}</td>
                      <td className="py-1.5 pr-2 tabular-nums font-medium">{formatKwacha(m.totalProfitTambala)}</td>
                      <td className="py-1.5 tabular-nums">{formatKwacha(m.treasuryWithdrawnTambala)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

      </Card>



      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Reverse false-success withdrawal</h2>
          <p className="text-sm text-muted">
            Use when a withdrawal shows <span className="font-medium">success</span> but PayChangu never paid out.
            Enter transaction <span className="font-medium">ID</span> or <span className="font-medium">reference</span>.
            Refunds the user and marks the tx failed. Does not call PayChangu.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rev-wth-id">Transaction ID</Label>
            <Input
              id="rev-wth-id"
              inputMode="numeric"
              value={reverseWthId}
              onChange={(e) => setReverseWthId(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 1842"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rev-wth-ref">Or reference</Label>
            <Input
              id="rev-wth-ref"
              value={reverseWthRef}
              onChange={(e) => setReverseWthRef(e.target.value.trim())}
              placeholder="WTH_… or AWS_…"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="rev-wth-reason">Reason (audit)</Label>
            <Input
              id="rev-wth-reason"
              value={reverseWthReason}
              onChange={(e) => setReverseWthReason(e.target.value)}
              placeholder="Never paid by PayChangu"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rev-wth-pin">Admin PIN</Label>
            <Input
              id="rev-wth-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={reverseWthPin}
              onChange={(e) => setReverseWthPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="PIN"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full border-red-500/40"
              variant="secondary"
              disabled={
                reverseWthBusy ||
                reverseWthPin.length !== 4 ||
                reverseWthReason.trim().length < 8 ||
                (!reverseWthId && !reverseWthRef)
              }
              onClick={() => {
                setReverseWthBusy(true);
                setReverseWthMsg(null);
                void adminReverseFalseWithdrawal({
                  data: {
                    pin: reverseWthPin,
                    transactionId: reverseWthId ? Number(reverseWthId) : undefined,
                    reference: reverseWthRef || undefined,
                    reason: reverseWthReason.trim(),
                  },
                })
                  .then((r) => {
                    setReverseWthMsg(r.message);
                    setReverseWthPin("");
                  })
                  .catch((e) => setReverseWthMsg(errMessage(e)))
                  .finally(() => setReverseWthBusy(false));
              }}
            >
              {reverseWthBusy ? "Reversing…" : "Reverse & refund user"}
            </Button>
          </div>
        </div>
        {reverseWthMsg ? <p className="text-sm text-primary">{reverseWthMsg}</p> : null}
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Recalculate payout reserve (2%)</h2>
          <p className="text-sm text-muted">
            Compares total user liabilities to the 2% withdrawal-reserve target. Shortfall is topped up from the
            profit bag; surplus reserve is moved back into the profit bag. Does not change user balances.
          </p>
        </div>
        {reserveRecalcResult ? (
          <div className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <span className="text-muted">User liabilities</span>
              <span className="tabular-nums font-medium">{formatKwacha(reserveRecalcResult.liabilitiesTambala)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Target reserve (2%)</span>
              <span className="tabular-nums font-medium">{formatKwacha(reserveRecalcResult.targetReserveTambala)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Current reserve</span>
              <span className="tabular-nums font-medium">{formatKwacha(reserveRecalcResult.currentReserveTambala)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Gap</span>
              <span className="tabular-nums font-medium">
                {reserveRecalcResult.gapTambala > 0
                  ? formatKwacha(reserveRecalcResult.gapTambala)
                  : reserveRecalcResult.surplusTambala
                    ? `surplus ${formatKwacha(reserveRecalcResult.surplusTambala)}`
                    : "0"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Profit bag available</span>
              <span className="tabular-nums font-medium">{formatKwacha(reserveRecalcResult.availableProfitTambala)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Funded this run</span>
              <span className="tabular-nums font-medium text-primary">{formatKwacha(reserveRecalcResult.fundedTambala)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Released to profit</span>
              <span className="tabular-nums font-medium text-primary">
                {formatKwacha((reserveRecalcResult as { releasedTambala?: number }).releasedTambala ?? 0)}
              </span>
            </div>
          </div>
        ) : null}
        {reserveRecalcMsg ? (
          <p className={`text-sm ${reserveRecalcResult && !reserveRecalcResult.ok ? "text-danger" : "text-primary"}`}>
            {reserveRecalcMsg}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="reserve-recalc-pin">Admin PIN</Label>
            <Input
              id="reserve-recalc-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={reserveRecalcPin}
              onChange={(e) => setReserveRecalcPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="PIN"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={reserveRecalcBusy || reserveRecalcPin.length !== 4}
            onClick={() => {
              setReserveRecalcBusy(true);
              setReserveRecalcMsg(null);
              void adminRecalculatePayoutReserve({
                data: { pin: reserveRecalcPin, dryRun: true },
              })
                .then((r) => {
                  setReserveRecalcResult(r);
                  setReserveRecalcMsg(r.message);
                })
                .catch((e) => setReserveRecalcMsg(errMessage(e)))
                .finally(() => setReserveRecalcBusy(false));
            }}
          >
            {reserveRecalcBusy ? "Checking…" : "Check gap only"}
          </Button>
          <Button
            type="button"
            disabled={reserveRecalcBusy || reserveRecalcPin.length !== 4}
            onClick={() => {
              setReserveRecalcBusy(true);
              setReserveRecalcMsg(null);
              void adminRecalculatePayoutReserve({
                data: { pin: reserveRecalcPin, dryRun: false },
              })
                .then(async (r) => {
                  setReserveRecalcResult(r);
                  setReserveRecalcMsg(r.message);
                  setReserveRecalcPin("");
                  try {
                    setOverview(await adminOverview());
                    setFundsAudit(await adminFundsAudit());
                  } catch {
                    /* optional refresh */
                  }
                })
                .catch((e) => setReserveRecalcMsg(errMessage(e)))
                .finally(() => setReserveRecalcBusy(false));
            }}
          >
            {reserveRecalcBusy ? "Working…" : "Recalculate (fill gap or release surplus)"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Funds audit</h2>
            <p className="text-sm text-muted">
              Operating money (user vaults + admin main + admin received) vs PayChangu main + collection. Profits
              excluded; remaining withdrawal reserve set aside; rail fees already paid added back.
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0"
            disabled={auditBusy}
            onClick={() => {
              setAuditBusy(true);
              setAuditErr(null);
              void adminFundsAudit()
                .then((r) => {
                  setFundsAudit(r);
                  return adminListAuditCovers();
                })
                .then(setAuditCovers)
                .catch((e) => setAuditErr(errMessage(e)))
                .finally(() => setAuditBusy(false));
            }}
          >
            {auditBusy ? "Auditing…" : "Run audit"}
          </Button>
        </div>
        {auditErr ? <p className="text-sm text-danger">{auditErr}</p> : null}
        {fundsAudit ? (
          <div className="space-y-3 text-sm">
            <div
              className={
                fundsAudit.status === "green"
                  ? "rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 font-medium text-emerald-700 dark:text-emerald-300"
                  : fundsAudit.status === "red"
                    ? "rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 font-medium text-red-700 dark:text-red-300"
                    : "rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 text-muted"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                {fundsAudit.status === "green"
                  ? "● Green — covered"
                  : fundsAudit.status === "red"
                    ? "● Red — shortfall"
                    : "● Unavailable"}
              </p>
              <p className="mt-1 text-sm font-medium">{fundsAudit.summary}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 rounded-xl border border-border bg-surface-2/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Operating balances</p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted">User main vaults</span>
                  <span className="tabular-nums">{formatKwacha(fundsAudit.nexa.userMainTambala)}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted">User received bags</span>
                  <span className="tabular-nums">{formatKwacha(fundsAudit.nexa.userReceivedTambala)}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted">Admin main</span>
                  <span className="tabular-nums">{formatKwacha(fundsAudit.nexa.adminMainTambala)}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted">Admin received</span>
                  <span className="tabular-nums">{formatKwacha(fundsAudit.nexa.adminReceivedTambala)}</span>
                </p>
                <p className="flex justify-between gap-2 font-medium border-t border-border pt-1">
                  <span>Total operating</span>
                  <span className="tabular-nums">
                    {formatKwacha(
                      fundsAudit.nexa.operationalLiabilityTambala ??
                        fundsAudit.nexa.userVaultsTambala +
                          fundsAudit.nexa.adminMainTambala +
                          fundsAudit.nexa.adminReceivedTambala,
                    )}
                  </span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted">Withdrawal reserve</span>
                  <span className="tabular-nums">{formatKwacha(fundsAudit.nexa.payoutReserveTambala)}</span>
                </p>
                <p className="flex justify-between gap-2 text-xs text-muted">
                  <span>Pending withdrawals</span>
                  <span className="tabular-nums">
                    {fundsAudit.nexa.pendingWithdrawalsCount} ·{" "}
                    {formatKwacha(fundsAudit.nexa.pendingWithdrawalsTambala)}
                  </span>
                </p>
              </div>
              <div className="space-y-1 rounded-xl border border-border bg-surface-2/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">PayChangu</p>
                {fundsAudit.paychangu.ok ? (
                  <>
                    <p className="flex justify-between gap-2">
                      <span className="text-muted">Main (payout float)</span>
                      <span className="tabular-nums">{formatKwacha(fundsAudit.paychangu.mainTambala)}</span>
                    </p>
                    <p className="flex justify-between gap-2">
                      <span className="text-muted">Collection</span>
                      <span className="tabular-nums">{formatKwacha(fundsAudit.paychangu.collectionTambala)}</span>
                    </p>
                    <p className="flex justify-between gap-2 text-xs text-muted">
                      <span>Environment</span>
                      <span>{fundsAudit.paychangu.environment ?? "—"}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-danger">{fundsAudit.paychangu.error}</p>
                )}
              </div>
            </div>
            <div className="space-y-1 rounded-xl border border-border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Coverage math</p>
              <p className="flex justify-between gap-2">
                <span className="text-muted">PayChangu main</span>
                <span className="tabular-nums">{formatKwacha(fundsAudit.paychangu.mainTambala)}</span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-muted">+ Collection (unsettled deposits)</span>
                <span className="tabular-nums">{formatKwacha(fundsAudit.paychangu.collectionTambala)}</span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-muted">− Active profits (not yet withdrawn)</span>
                <span className="tabular-nums">
                  {formatKwacha(fundsAudit.math.activeProfitsTambala ?? fundsAudit.excludedProfits?.remainingBookProfitTambala ?? 0)}
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-muted">− Remaining withdrawal reserve</span>
                <span className="tabular-nums">{formatKwacha(fundsAudit.nexa.payoutReserveTambala)}</span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-muted">+ Rail fees already paid (PayChangu)</span>
                <span className="tabular-nums">
                  {formatKwacha(fundsAudit.math.railFeesPaidTambala ?? 0)}
                </span>
              </p>
              <p className="flex justify-between gap-2 font-medium">
                <span>Float for liabilities</span>
                <span className="tabular-nums">
                  {formatKwacha(fundsAudit.math.paychanguAfterWithdrawalReserveTambala)}
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-muted">− Operating liabilities</span>
                <span className="tabular-nums">
                  {formatKwacha(
                    fundsAudit.math.liabilitiesTambala ??
                      fundsAudit.nexa.operationalLiabilityTambala ??
                      fundsAudit.nexa.userVaultsTambala,
                  )}
                </span>
              </p>
              <p className="flex justify-between gap-2 border-t border-border pt-1.5 text-base font-semibold">
                <span>Result (main + collection)</span>
                <span
                  className={
                    fundsAudit.math.diffTambala >= 0
                      ? "tabular-nums text-emerald-600 dark:text-emerald-400"
                      : "tabular-nums text-red-600 dark:text-red-400"
                  }
                >
                  {formatKwacha(fundsAudit.math.diffTambala)}
                </span>
              </p>
              {fundsAudit.math.mainOnlyDiffTambala != null ? (
                <p className="flex justify-between gap-2 text-xs text-muted">
                  <span>Main only (payout float)</span>
                  <span
                    className={
                      fundsAudit.math.mainOnlyDiffTambala >= 0
                        ? "tabular-nums text-emerald-600/80 dark:text-emerald-400/80"
                        : "tabular-nums text-amber-600 dark:text-amber-400"
                    }
                  >
                    {formatKwacha(fundsAudit.math.mainOnlyDiffTambala)}
                  </span>
                </p>
              ) : null}
              <p className="pt-1 text-xs text-muted">
                New deposits often sit in <span className="text-fg">collection</span> until PayChangu settles them to
                main. Overall green can still show main-only tight until settlement. Rail fees already paid are added
                back so a correct 1.8% payout is not a permanent hole.
              </p>
              {fundsAudit.excludedProfits ? (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted">
                  <p className="font-medium text-fg">Excluded (system profit — not operating float)</p>
                  <p className="flex justify-between gap-2">
                    <span>Deposit profit (book)</span>
                    <span className="tabular-nums">{formatKwacha(fundsAudit.excludedProfits.depositProfitTambala)}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>NEXA→NEXA send fees</span>
                    <span className="tabular-nums">{formatKwacha(fundsAudit.excludedProfits.sendFeesTambala)}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>Early unlock fees</span>
                    <span className="tabular-nums">{formatKwacha(fundsAudit.excludedProfits.unlockFeesTambala)}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>Already paid from treasury</span>
                    <span className="tabular-nums">{formatKwacha(fundsAudit.excludedProfits.treasuryPaidOutTambala)}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>Remaining book profit</span>
                    <span className="tabular-nums">{formatKwacha(fundsAudit.excludedProfits.remainingBookProfitTambala)}</span>
                  </p>
                </div>
              ) : null}
            </div>
            
            {fundsAudit.status === "red" && fundsAudit.math.diffTambala < 0 ? (
              <div className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Balance the shortfall from admin main
                </p>
                <p className="text-xs text-muted">
                  Deducts {formatKwacha(Math.abs(fundsAudit.math.diffTambala))} from your admin main balance so
                  operating books sit at neutral. Then withdraw via MoMo to test whether PayChangu&apos;s live rail
                  matches the system figures.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="cover-pin">Admin PIN</Label>
                    <Input
                      id="cover-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={coverPin}
                      onChange={(e) => setCoverPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="PIN"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="border-red-500/50"
                    disabled={coverBusy || coverPin.length !== 4}
                    onClick={() => {
                      setCoverBusy(true);
                      setAuditErr(null);
                      void adminCoverAuditShortage({
                        data: {
                          pin: coverPin,
                          shortfallTambala: Math.abs(fundsAudit.math.diffTambala),
                          idempotencyKey: `cover-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                        },
                      })
                        .then(async (r) => {
                          setCoverPin("");
                          setAuditErr(null);
                          setCoverSuccess({ amountTambala: r.deductedTambala, reference: r.reference });
                          try {
                            const next = await adminFundsAudit();
                            setFundsAudit(next);
                            setAuditCovers(await adminListAuditCovers());
                          } catch {
                            /* cover succeeded; audit refresh optional */
                          }
                        })
                        .catch((e) => setAuditErr(errMessage(e)))
                        .finally(() => setCoverBusy(false));
                    }}
                  >
                    {coverBusy ? "Covering…" : `Cover ${formatKwacha(Math.abs(fundsAudit.math.diffTambala))} shortfall`}
                  </Button>
                </div>
              </div>
            ) : null}

            
            {auditCovers && auditCovers.count > 0 ? (
              <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Past audit covers on admin main ({auditCovers.count})
                </p>
                <p className="text-xs text-muted">
                  These were ledger-only write-offs when the audit math was wrong — nothing left PayChangu.
                  Total {formatKwacha(auditCovers.totalTambala)} can be put back on admin main.
                </p>
                <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-muted">
                  {auditCovers.items.map((it) => (
                    <li key={it.reference} className="flex justify-between gap-2">
                      <span className="truncate font-mono">{it.reference}</span>
                      <span className="tabular-nums">{formatKwacha(it.amountTambala)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="restore-pin">Admin PIN</Label>
                    <Input
                      id="restore-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={restorePin}
                      onChange={(e) => setRestorePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="PIN"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={restoreBusy || restorePin.length !== 4}
                    onClick={() => {
                      setRestoreBusy(true);
                      setAuditErr(null);
                      void adminRestoreAuditCovers({
                        data: {
                          pin: restorePin,
                          idempotencyKey: `restore-covers-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                        },
                      })
                        .then(async (r) => {
                          setRestorePin("");
                          setRestoreSuccess({
                            amountTambala: r.restoredTambala,
                            count: r.count,
                            reference: r.reference,
                          });
                          setAuditCovers(await adminListAuditCovers());
                          try {
                            setFundsAudit(await adminFundsAudit());
                          } catch {
                            /* optional */
                          }
                        })
                        .catch((e) => setAuditErr(errMessage(e)))
                        .finally(() => setRestoreBusy(false));
                    }}
                  >
                    {restoreBusy
                      ? "Restoring…"
                      : `Restore ${formatKwacha(auditCovers.totalTambala)} to main`}
                  </Button>
                </div>
              </div>
            ) : null}

            <p className="text-xs text-muted">Ran {new Date(fundsAudit.at).toLocaleString()}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Press Run audit to compare NEXA books with live PayChangu balances.</p>
        )}
      </Card>

      <Modal
        open={!!restoreSuccess}
        title="Audit covers restored"
        onClose={() => setRestoreSuccess(null)}
      >
        {restoreSuccess ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {formatKwacha(restoreSuccess.amountTambala)} put back on admin main
                ({restoreSuccess.count} write-off{restoreSuccess.count === 1 ? "" : "s"}).
              </p>
              <p className="mt-1 text-xs text-muted">
                These were only book entries from the old audit math — not real PayChangu payouts.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted">Reference</p>
              <p className="mt-0.5 break-all font-mono text-xs tabular-nums">{restoreSuccess.reference}</p>
            </div>
            <Button type="button" className="w-full" onClick={() => setRestoreSuccess(null)}>
              Done
            </Button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!coverSuccess}
        title="Shortfall covered"
        onClose={() => setCoverSuccess(null)}
      >
        {coverSuccess ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {formatKwacha(coverSuccess.amountTambala)} was deducted from admin main balance.
              </p>
              <p className="mt-1 text-xs text-muted">
                Operating books are balanced to neutral against the last audit shortfall.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted">Reference</p>
              <p className="mt-0.5 break-all font-mono text-xs tabular-nums text-fg">{coverSuccess.reference}</p>
            </div>
            <p className="text-xs text-muted">
              You can withdraw via MoMo next to compare PayChangu&apos;s live rail fee with the system figures.
            </p>
            <Button type="button" className="w-full" onClick={() => setCoverSuccess(null)}>
              Done
            </Button>
          </div>
        ) : null}
      </Modal>

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
        <h2 className="font-display text-lg font-semibold">Tutorial videos</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tutorialsEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              setTutorialsEnabled(on);
              void adminSetTutorialsFeature({ data: { enabled: on } })
                .then(() =>
                  setTutorialsMsg(
                    on
                      ? "Tutorials feature ON — sign-up shows “Not familiar with the system?”"
                      : "Tutorials feature OFF — hidden on sign-up.",
                  ),
                )
                .catch((err) => setTutorialsMsg(errMessage(err)));
            }}
          />
          Show “Not familiar with the system?” / Tutorials on sign-up
        </label>
        <p className="text-sm text-muted">
          When this is on, every sign-up visitor sees the prompt and Tutorials button. Add videos below so they have
          something to watch. Turn it off until videos are ready so people are not sent to an empty list.
        </p>
        {tutorialsDraft.map((row, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Video {i + 1}</p>
            <Input
              placeholder="Title (e.g. How fees work)"
              value={row.title}
              onChange={(e) => {
                const next = [...tutorialsDraft];
                next[i] = { ...next[i]!, title: e.target.value };
                setTutorialsDraft(next);
              }}
            />
            <Input
              placeholder="Short description (optional)"
              value={row.description}
              onChange={(e) => {
                const next = [...tutorialsDraft];
                next[i] = { ...next[i]!, description: e.target.value };
                setTutorialsDraft(next);
              }}
            />
            <Input
              placeholder="YouTube URL or video id"
              value={row.urlOrId}
              onChange={(e) => {
                const next = [...tutorialsDraft];
                next[i] = { ...next[i]!, urlOrId: e.target.value };
                setTutorialsDraft(next);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setTutorialsDraft(tutorialsDraft.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={tutorialsDraft.length >= 12}
            onClick={() =>
              setTutorialsDraft([...tutorialsDraft, { title: "", description: "", urlOrId: "" }])
            }
          >
            Add video
          </Button>
          <Button
            type="button"
            onClick={() => {
              setTutorialsMsg(null);
              const items = tutorialsDraft.filter((r) => r.title.trim() && r.urlOrId.trim());
              void adminSetTutorials({ data: { items } })
                .then((r) => setTutorialsMsg(`Saved ${r.items.length} tutorial(s).`))
                .catch((err) => setTutorialsMsg(errMessage(err)));
            }}
          >
            Save tutorials
          </Button>
        </div>
        {tutorialsMsg ? <p className="text-sm text-muted">{tutorialsMsg}</p> : null}
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
        <h2 className="font-display text-lg font-semibold">Provider outage notices</h2>
        <p className="text-sm text-muted">
          When MoMo or bank rails jam, turn on a notice. Savers see a templated message and blocked
          withdrawals on the down rail. Leave the master toggle off for normal service.
        </p>
        {railOutage ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-3">
              <div>
                <p className="text-sm font-medium">Outage notice</p>
                <p className="text-xs text-muted">
                  {railOutage.enabled
                    ? "On — savers see the notice and blocked rails"
                    : "Off — normal service"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={railOutage.enabled}
                aria-label="Toggle outage notice"
                onClick={() =>
                  setRailOutage((r) => (r ? { ...r, enabled: !r.enabled } : r))
                }
                className={
                  "relative h-8 w-14 shrink-0 rounded-full transition-colors " +
                  (railOutage.enabled ? "bg-primary" : "bg-muted/40")
                }
              >
                <span
                  className={
                    "absolute top-1 size-6 rounded-full bg-white shadow transition-transform " +
                    (railOutage.enabled ? "left-7" : "left-1")
                  }
                />
              </button>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={railOutage.airtelDown}
                onChange={(e) =>
                  setRailOutage((r) => (r ? { ...r, airtelDown: e.target.checked } : r))
                }
              />
              Airtel Money down — suggest TNM + bank
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={railOutage.tnmDown}
                onChange={(e) =>
                  setRailOutage((r) => (r ? { ...r, tnmDown: e.target.checked } : r))
                }
              />
              TNM Mpamba down — suggest Airtel + bank
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={railOutage.bankDown}
                onChange={(e) =>
                  setRailOutage((r) => (r ? { ...r, bankDown: e.target.checked } : r))
                }
              />
              All bank withdrawals down — suggest MoMo
            </label>
            <div className="space-y-1">
              <Label htmlFor="rail-banks">Specific banks down (comma-separated names)</Label>
              <Input
                id="rail-banks"
                value={railBankNamesText}
                onChange={(e) => setRailBankNamesText(e.target.value)}
                placeholder="e.g. National Bank, Standard Bank"
              />
              <p className="text-xs text-muted">
                Savers on those banks are told to use another bank or MoMo.
              </p>
            </div>
            {railOutage.enabled && (railOutage.airtelDown || railOutage.tnmDown || railOutage.bankDown || railBankNamesText.trim()) ? (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-fg">
                Preview:{" "}
                {[
                  railOutage.airtelDown && railOutage.tnmDown
                    ? "Airtel Money and TNM Mpamba are temporarily unavailable due to network issues. Please withdraw to bank if you can."
                    : railOutage.airtelDown
                      ? "Airtel Money is temporarily unavailable due to network issues. Please use TNM Mpamba or bank transfer."
                      : railOutage.tnmDown
                        ? "TNM Mpamba is temporarily unavailable due to network issues. Please use Airtel Money or bank transfer."
                        : "",
                  railOutage.bankDown
                    ? "Bank withdrawals are temporarily unavailable due to network issues. Please use mobile money if it is available."
                    : railBankNamesText.trim()
                      ? `${railBankNamesText.trim()} temporarily unavailable. Please use another bank if possible, or mobile money.`
                      : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={railBusy}
              onClick={() => {
                setRailBusy(true);
                setRailMsg(null);
                const bankNamesDown = railBankNamesText
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                void adminSetRailOutage({
                  data: {
                    enabled: railOutage.enabled,
                    airtelDown: railOutage.airtelDown,
                    tnmDown: railOutage.tnmDown,
                    bankDown: railOutage.bankDown,
                    bankNamesDown,
                  },
                })
                  .then((r) => {
                    setRailOutage(r);
                    setRailBankNamesText((r.bankNamesDown || []).join(", "));
                    setRailMsg(r.enabled ? "Outage notice is ON." : "Outage notice is OFF.");
                  })
                  .catch((err) => setRailMsg(errMessage(err)))
                  .finally(() => setRailBusy(false));
              }}
            >
              {railBusy ? "Saving…" : "Save outage notice"}
            </Button>
            {railMsg ? <p className="text-sm text-muted">{railMsg}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
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
            <div>
              <h2 className="font-display text-lg font-semibold">
                {selectedAccountId ? "Account detail" : accountsShowAll ? "All accounts" : "Accounts"}
              </h2>
              <p className="text-sm text-muted">
                {selectedAccountId
                  ? "Manage locks and view balances for this account."
                  : "Tap a name to open details. Showing " + (accountsShowAll ? "all" : "10 per page") + "."}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:max-w-sm">
              {!selectedAccountId ? (
                <>
                  <Label htmlFor="user-search">Search</Label>
                  <Input
                    id="user-search"
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value);
                      setAccountsPage(0);
                    }}
                    placeholder="Name, username, phone…"
                    className="w-full"
                  />
                </>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedAccountId(null)}
                >
                  ← Back to list
                </Button>
              )}
            </div>
          </div>
          {userActionMsg ? (
            <p className="mb-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
              {userActionMsg}
            </p>
          ) : null}

          {(() => {
            const filtered = users.filter((u) => {
              const q = userQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                u.username.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.phone.includes(q) ||
                u.firstName.toLowerCase().includes(q) ||
                `${u.firstName} ${u.lastName || ""}`.toLowerCase().includes(q)
              );
            });
            const pageSize = 10;
            const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
            const page = Math.min(accountsPage, totalPages - 1);
            const slice = accountsShowAll
              ? filtered
              : filtered.slice(page * pageSize, page * pageSize + pageSize);
            const selected = selectedAccountId
              ? users.find((u) => u.userId === selectedAccountId) ?? null
              : null;

            if (selected) {
              const fullName = [selected.firstName, selected.lastName].filter(Boolean).join(" ") || selected.username;
              return (
                <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl font-semibold">{fullName}</h3>
                    {selected.role === "admin" ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium uppercase text-primary">admin</span>
                    ) : selected.adminLocked ? (
                      <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-medium uppercase text-danger">locked</span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase text-primary">active</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">@{selected.username} · {selected.phone}</p>
                  <p className="truncate text-xs text-muted">{selected.email}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center">
                      <p className="text-[10px] uppercase text-muted">Balance</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">{formatKwacha(selected.balanceTambala, { compact: true })}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center">
                      <p className="text-[10px] uppercase text-muted">In</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">{formatKwacha(selected.lifetimeDepositedTambala, { compact: true })}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center">
                      <p className="text-[10px] uppercase text-muted">Out</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">{formatKwacha(selected.lifetimeWithdrawnTambala, { compact: true })}</p>
                    </div>
                  </div>
                  {selected.role === "admin" ? (
                    <p className="mt-4 text-xs text-muted">Platform admin — no account actions.</p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                        onClick={() => {
                          const reason =
                            window.prompt(
                              selected.adminLocked
                                ? "Reason for unlocking (audit log):"
                                : "Reason for locking this account (reported / compromised):",
                            ) || "";
                          if (reason.trim().length < 3) return;
                          void adminLockUser({
                            data: { userId: selected.userId, reason: reason.trim(), locked: !selected.adminLocked },
                          })
                            .then(() => {
                              setUserActionMsg(
                                selected.adminLocked ? `Unlocked ${selected.username}` : `Locked ${selected.username}`,
                              );
                              return adminUsers();
                            })
                            .then(setUsers)
                            .catch((err) => setUserActionMsg(errMessage(err)));
                        }}
                      >
                        {selected.adminLocked ? "Unlock account" : "Lock account"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                        onClick={() => {
                          const locked = Boolean((selected as { adminWithdrawLocked?: boolean }).adminWithdrawLocked);
                          const reason =
                            window.prompt(
                              locked
                                ? "Reason for unlocking withdrawals (audit):"
                                : "Reason for withdraw-only lock (legal / report):",
                            ) || "";
                          if (reason.trim().length < 3) return;
                          void adminSetWithdrawLock({
                            data: { userId: selected.userId, reason: reason.trim(), locked: !locked },
                          })
                            .then(() => {
                              setUserActionMsg(
                                locked
                                  ? `Withdrawals unlocked for ${selected.username}`
                                  : `Withdrawals locked for ${selected.username}`,
                              );
                              return adminUsers();
                            })
                            .then(setUsers)
                            .catch((err) => setUserActionMsg(errMessage(err)));
                        }}
                      >
                        {(selected as { adminWithdrawLocked?: boolean }).adminWithdrawLocked
                          ? "Unlock withdraw"
                          : "Lock withdraw"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 px-3 text-xs text-danger"
                        onClick={() => {
                          const reason =
                            window.prompt(
                              `Delete ${selected.username}? This soft-deletes the account. Type a reason:`,
                            ) || "";
                          if (reason.trim().length < 3) return;
                          if (!window.confirm(`Permanently soft-delete ${selected.username}?`)) return;
                          void adminDeleteUser({
                            data: { userId: selected.userId, reason: reason.trim() },
                          })
                            .then(() => {
                              setUserActionMsg(`Deleted ${selected.username}`);
                              setSelectedAccountId(null);
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
                </article>
              );
            }

            return (
              <>
                <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                  {slice.map((u) => {
                    const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username;
                    return (
                      <li key={u.userId}>
                        <button
                          type="button"
                          onClick={() => setSelectedAccountId(u.userId)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg">{fullName}</span>
                            <span className="block truncate text-xs text-muted">@{u.username}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted">View →</span>
                        </button>
                      </li>
                    );
                  })}
                  {!slice.length ? (
                    <li className="px-4 py-8 text-center text-sm text-muted">No accounts match.</li>
                  ) : null}
                </ul>
                {!accountsShowAll && filtered.length > pageSize ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">
                      Page {page + 1} of {totalPages} · {filtered.length} accounts
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 px-3 text-xs"
                        disabled={page <= 0}
                        onClick={() => setAccountsPage((p) => Math.max(0, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 px-3 text-xs"
                        disabled={page >= totalPages - 1}
                        onClick={() => setAccountsPage((p) => Math.min(totalPages - 1, p + 1))}
                      >
                        Next
                      </Button>
                      <Button
                        type="button"
                        className="h-8 px-3 text-xs"
                        onClick={() => setAccountsShowAll(true)}
                      >
                        View all
                      </Button>
                    </div>
                  </div>
                ) : null}
                {accountsShowAll ? (
                  <div className="mt-3">
                    <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => { setAccountsShowAll(false); setAccountsPage(0); }}>
                      Show 10 per page
                    </Button>
                  </div>
                ) : null}
              </>
            );
          })()}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold">Ledger</h2>
              <p className="text-xs text-muted">
                {ledgerShowAll ? "All movements (5 per page)" : "Latest movements"}
              </p>
            </div>
            {!ledgerShowAll && txs.length > 5 ? (
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-xs"
                onClick={() => { setLedgerShowAll(true); setLedgerPage(0); }}
              >
                View all
              </Button>
            ) : null}
            {ledgerShowAll ? (
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-xs"
                onClick={() => { setLedgerShowAll(false); setLedgerPage(0); }}
              >
                Show less
              </Button>
            ) : null}
          </div>
          <ul className="space-y-2">
            {(ledgerShowAll ? txs : txs.slice(0, Math.min(5, txs.length)))
              .slice(ledgerShowAll ? ledgerPage * 5 : 0, ledgerShowAll ? ledgerPage * 5 + 5 : 5)
              .map((tx) => (
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
            {!txs.length ? <li className="text-sm text-muted">No ledger rows yet.</li> : null}
          </ul>
          {(ledgerShowAll ? txs.length : Math.min(5, txs.length)) > 0 && (ledgerShowAll ? txs.length > 5 : false) ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={ledgerPage <= 0}
                onClick={() => setLedgerPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <p className="text-xs text-muted">
                {ledgerPage + 1} / {Math.max(1, Math.ceil(txs.length / 5))}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={(ledgerPage + 1) * 5 >= txs.length}
                onClick={() => setLedgerPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
          {!ledgerShowAll && txs.length > 5 ? (
            <p className="mt-2 text-center text-xs text-muted">Showing 5 of {txs.length}</p>
          ) : null}
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

      {adminTab === "legal" ? (
      <div className="space-y-5">
        <Card className="space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">Terms &amp; Privacy</h2>
          <p className="text-sm text-muted">
            Edit the public documents users accept at sign-up. Insert live figures with the buttons below
            (for example deposit fee %). When you change fees in Money settings, those placeholders update
            automatically on the public pages — you do not need to rewrite every number by hand.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={legalKind === "terms" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setLegalKind("terms")}
            >
              Terms of use
            </Button>
            <Button
              type="button"
              variant={legalKind === "privacy" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setLegalKind("privacy")}
            >
              Privacy policy
            </Button>
            <a
              href={legalKind === "terms" ? "/terms" : "/privacy"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm text-primary"
            >
              Preview public page
            </a>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Insert live value</p>
            <div className="flex flex-wrap gap-2">
              {legalPlaceholders.map((ph) => (
                <Button
                  key={ph.key}
                  type="button"
                  size="sm"
                  variant="secondary"
                  title={`Live now: ${legalLive[ph.key] ?? ph.example}`}
                  onClick={() => {
                    const token = `{{${ph.key}}}`;
                    const el = legalTextareaRef.current;
                    if (!el) {
                      setLegalBody((b) => b + token);
                      return;
                    }
                    const start = el.selectionStart ?? el.value.length;
                    const end = el.selectionEnd ?? start;
                    const next = el.value.slice(0, start) + token + el.value.slice(end);
                    setLegalBody(next);
                    requestAnimationFrame(() => {
                      el.focus();
                      const pos = start + token.length;
                      el.setSelectionRange(pos, pos);
                    });
                  }}
                >
                  {ph.label}
                  <span className="ml-1 text-xs text-muted">({legalLive[ph.key] ?? "…"})</span>
                </Button>
              ))}
            </div>
          </div>
          <textarea
            ref={legalTextareaRef}
            className="min-h-[28rem] w-full rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={legalBody}
            onChange={(e) => setLegalBody(e.target.value)}
            spellCheck
          />
          <p className="text-xs text-muted">
            Use <code className="text-fg">## Heading</code> for section titles. Blank lines separate paragraphs.
            Placeholders look like <code className="text-fg">{"{{deposit_fee_percent}}"}</code>.
          </p>
          <Button
            type="button"
            onClick={() => {
              setLegalMsg(null);
              void adminSetLegalDoc({ data: { kind: legalKind, body: legalBody } })
                .then(() => setLegalMsg("Saved. Public page updates immediately."))
                .catch((err) => setLegalMsg(errMessage(err)));
            }}
          >
            Save {legalKind === "terms" ? "terms" : "privacy"}
          </Button>
          {legalMsg ? <p className="text-sm text-muted">{legalMsg}</p> : null}
        </Card>
      </div>
      ) : null}

      
      {adminTab === "ops" ? (
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Security checklist</h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={opsBusy}
                onClick={() => {
                  setOpsBusy(true);
                  void adminSecurityChecklist()
                    .then(setSecurityChecks)
                    .catch((err) => setOpsMsg(errMessage(err)))
                    .finally(() => setOpsBusy(false));
                }}
              >
                Re-scan
              </Button>
            </div>
            <p className="text-sm text-muted">
              Automated posture check (no secret values). Fix critical items before real money. Manual pen-test ideas
              are listed at the bottom.
            </p>
            <ul className="space-y-2 text-sm">
              {(securityChecks?.checks ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">
                      <span className={c.ok ? "text-primary" : "text-danger"}>{c.ok ? "●" : "○"}</span> {c.label}
                      <span className="ml-2 text-xs text-muted">{c.severity}</span>
                    </p>
                    {!c.ok || c.severity === "info" ? (
                      <p className="mt-0.5 text-xs text-muted">{c.hint}</p>
                    ) : null}
                  </div>
                  <span className={c.ok ? "text-xs text-primary" : "text-xs text-danger"}>{c.ok ? "OK" : "Fix"}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-xs text-muted">
              <p className="font-medium text-fg">Manual pen-test (you / a friend)</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>Try opening another user&apos;s deposit ref on /deposit-return while logged in as yourself</li>
                <li>Try changing profile IDs / user ids in browser network calls</li>
                <li>Replay a PayChangu webhook without a valid signature (should 401)</li>
                <li>Brute-force PIN until lockout; confirm escalation timing</li>
                <li>Admin money actions without 2FA elevation (should fail)</li>
                <li>Cross-site form post from another origin (should 403)</li>
              </ul>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-display text-lg font-semibold">Launch &amp; beta</h2>
            <p className="text-sm text-muted">
              Pre-public controls: close sign-ups, mark private beta, cap deposits, and keep your incident playbook here.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={launchSignup}
                onChange={(e) => setLaunchSignup(e.target.checked)}
              />
              Allow new sign-ups
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={launchBeta} onChange={(e) => setLaunchBeta(e.target.checked)} />
              Private beta mode (banner + optional deposit cap)
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Beta max deposit (MWK, 0 = no cap)</Label>
                <Input value={launchCap} onChange={(e) => setLaunchCap(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Public banner (login / sign-up)</Label>
                <Input value={launchBanner} onChange={(e) => setLaunchBanner(e.target.value)} placeholder="Private beta — trusted testers only…" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Incident playbook (admin only)</Label>
              <textarea
                className="min-h-[10rem] w-full rounded-xl border border-border bg-surface-2 p-3 text-xs leading-relaxed"
                value={launchNotes}
                onChange={(e) => setLaunchNotes(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={opsBusy}
              onClick={() => {
                setOpsBusy(true);
                void adminSetLaunchSettings({
                  data: {
                    signupEnabled: launchSignup,
                    betaMode: launchBeta,
                    betaDepositCapKwacha: Number(launchCap) || 0,
                    publicBanner: launchBanner,
                    incidentNotes: launchNotes,
                  },
                })
                  .then(() => setOpsMsg("Launch settings saved."))
                  .catch((err) => setOpsMsg(errMessage(err)))
                  .finally(() => setOpsBusy(false));
              }}
            >
              Save launch settings
            </Button>
            <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-xs text-muted">
              <p className="font-medium text-fg">Launch checklist</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>Production readiness (Overview) all green; demo payments off</li>
                <li>PayChangu webhook points to this site; test deposit + withdraw in sandbox first</li>
                <li>Run reconciliation daily (Ops) for two weeks of beta</li>
                <li>Start with ~10–20 trusted users and a low deposit cap</li>
                <li>Kill switch + incident notes ready before real money</li>
                <li>Health check: <code className="text-fg">/api/health</code></li>
              </ul>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-display text-lg font-semibold">Money pause (kill switch)</h2>
            <p className="text-sm text-muted">
              Pause deposits and/or withdrawals in seconds. Env flags NEXA_PAUSE_* still override if set on Vercel.
              {opsQueue?.pause.envOverride ? (
                <span className="text-danger"> An environment pause is active — clear it in Vercel to resume fully.</span>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(opsQueue?.pause.depositsPaused)}
                  disabled={opsBusy || opsQueue?.pause.envOverride}
                  onChange={(e) => {
                    setOpsBusy(true);
                    void adminSetMoneyPause({ data: { deposits: e.target.checked, note: pauseNote } })
                      .then((s) => {
                        setOpsQueue((q) => (q ? { ...q, pause: s } : q));
                        setOpsMsg(e.target.checked ? "Deposits paused." : "Deposits allowed.");
                      })
                      .catch((err) => setOpsMsg(errMessage(err)))
                      .finally(() => setOpsBusy(false));
                  }}
                />
                Pause deposits
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(opsQueue?.pause.withdrawalsPaused)}
                  disabled={opsBusy || opsQueue?.pause.envOverride}
                  onChange={(e) => {
                    setOpsBusy(true);
                    void adminSetMoneyPause({ data: { withdrawals: e.target.checked, note: pauseNote } })
                      .then((s) => {
                        setOpsQueue((q) => (q ? { ...q, pause: s } : q));
                        setOpsMsg(e.target.checked ? "Withdrawals paused." : "Withdrawals allowed.");
                      })
                      .catch((err) => setOpsMsg(errMessage(err)))
                      .finally(() => setOpsBusy(false));
                  }}
                />
                Pause withdrawals / send
              </label>
            </div>
            <Input
              placeholder="Optional note (why paused)"
              value={pauseNote}
              onChange={(e) => setPauseNote(e.target.value)}
            />
            {opsQueue?.pause.updatedAt ? (
              <p className="text-xs text-muted">
                Last change: {new Date(opsQueue.pause.updatedAt).toLocaleString()}
                {opsQueue.pause.updatedBy ? ` · by ${opsQueue.pause.updatedBy.slice(0, 8)}…` : ""}
              </p>
            ) : null}
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Reconciliation</h2>
              <Button
                type="button"
                disabled={opsBusy}
                onClick={() => {
                  setOpsBusy(true);
                  setOpsMsg(null);
                  void runReconciliationFn()
                    .then((r) => {
                      setReconLatest(r);
                      setOpsMsg(r.balanced ? "Books look balanced." : `Attention: ${r.notes}`);
                      return adminGetReconHistory();
                    })
                    .then((h) => setReconHistory(h))
                    .catch((err) => setOpsMsg(errMessage(err)))
                    .finally(() => setOpsBusy(false));
                }}
              >
                Run check now
              </Button>
            </div>
            {reconLatest ? (
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>Wallets sum: {formatKwacha(reconLatest.walletsSumTambala)}</p>
                <p>Ledger net: {formatKwacha(reconLatest.ledgerNetTambala)}</p>
                <p>Deposits (success): {formatKwacha(reconLatest.depositsSuccessTambala)}</p>
                <p>Withdrawals (success): {formatKwacha(reconLatest.withdrawalsSuccessTambala)}</p>
                <p>Platform profit: {formatKwacha(reconLatest.platformProfitTambala)}</p>
                <p>Stuck pending: {reconLatest.pendingStuck}</p>
                <p className={reconLatest.balanced ? "text-primary" : "text-danger"}>
                  {reconLatest.balanced ? "Balanced" : reconLatest.notes}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">Run a check to compare wallets, ledger, and fees.</p>
            )}
            {reconHistory.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-xs">
                  <thead>
                    <tr className="text-muted">
                      <th className="py-1 pr-2">When</th>
                      <th className="py-1 pr-2">OK</th>
                      <th className="py-1 pr-2">Stuck</th>
                      <th className="py-1">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconHistory.map((h) => (
                      <tr key={h.id} className="border-t border-border">
                        <td className="py-1.5 pr-2">{new Date(h.ranAt).toLocaleString()}</td>
                        <td className="py-1.5 pr-2">{h.balanced ? "Yes" : "No"}</td>
                        <td className="py-1.5 pr-2">{h.pendingStuck}</td>
                        <td className="py-1.5 text-muted">{h.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-display text-lg font-semibold">Support queues</h2>
            <p className="text-sm text-muted">
              Pending deposits and withdrawals. Items older than 15 minutes are marked stuck — use Support desk
              below with the reference after confirming in PayChangu.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Pending deposits ({opsQueue?.pendingDeposits.length ?? 0})</h3>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={opsBusy || !(opsQueue?.pendingDeposits.some((d) => d.stuck))}
                onClick={() => {
                  setOpsBusy(true);
                  setOpsMsg(null);
                  void adminResolveStuckDeposits()
                    .then(async (res) => {
                      const c = res.results.filter((r) => r.action === "credited" || r.action === "already_credited").length;
                      const f = res.results.filter((r) => r.action === "marked_failed").length;
                      const p = res.results.filter((r) => r.action === "still_pending").length;
                      setOpsMsg(
                        `Rechecked ${res.results.length}: ${c} credited, ${f} marked failed (unpaid), ${p} still pending.`,
                      );
                      const q = await adminGetOpsQueue();
                      setOpsQueue(q);
                    })
                    .catch((err) => setOpsMsg(errMessage(err)))
                    .finally(() => setOpsBusy(false));
                }}
              >
                Recheck all stuck with PayChangu
              </Button>
            </div>
            <ul className="space-y-2 text-sm">
              {(opsQueue?.pendingDeposits ?? []).map((d) => (
                <li key={d.reference} className="rounded-xl border border-border px-3 py-2">
                  <p className="font-medium">
                    {d.name} @{d.username} · {formatKwacha(d.grossTambala)}
                    {d.stuck ? <span className="ml-2 text-xs text-danger">stuck</span> : null}
                  </p>
                  <p className="text-xs text-muted break-all">{d.reference}</p>
                  <p className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()}</p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    disabled={opsBusy}
                    onClick={() => {
                      setOpsBusy(true);
                      setOpsMsg(null);
                      void adminResolvePendingDeposit({ data: { reference: d.reference } })
                        .then(async (r) => {
                          setOpsMsg(`${d.reference}: ${r.message}`);
                          const q = await adminGetOpsQueue();
                          setOpsQueue(q);
                        })
                        .catch((err) => setOpsMsg(errMessage(err)))
                        .finally(() => setOpsBusy(false));
                    }}
                  >
                    Recheck PayChangu
                  </Button>
                </li>
              ))}
              {!opsQueue?.pendingDeposits.length ? <li className="text-muted">None</li> : null}
            </ul>
            <h3 className="text-sm font-medium">Processing withdrawals ({opsQueue?.processingWithdrawals.length ?? 0})</h3>
            <ul className="space-y-2 text-sm">
              {(opsQueue?.processingWithdrawals ?? []).map((d) => (
                <li key={d.reference} className="rounded-xl border border-border px-3 py-2">
                  <p className="font-medium">
                    {d.name} · {formatKwacha(d.grossTambala)} · {d.status}
                    {d.stuck ? <span className="ml-2 text-xs text-danger">stuck</span> : null}
                  </p>
                  <p className="text-xs text-muted break-all">{d.reference}</p>
                </li>
              ))}
              {!opsQueue?.processingWithdrawals.length ? <li className="text-muted">None</li> : null}
            </ul>
            <h3 className="text-sm font-medium">Frozen / reversal transfers ({opsQueue?.frozenTransfers.length ?? 0})</h3>
            <ul className="space-y-2 text-sm">
              {(opsQueue?.frozenTransfers ?? []).map((t) => (
                <li key={t.id} className="rounded-xl border border-border px-3 py-2">
                  #{t.id} · {formatKwacha(t.amountTambala)} · {t.status}
                  {t.frozenUntil ? ` · until ${new Date(t.frozenUntil).toLocaleString()}` : ""}
                </li>
              ))}
              {!opsQueue?.frozenTransfers.length ? <li className="text-muted">None</li> : null}
            </ul>
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-display text-lg font-semibold">KYC queue (light)</h2>
            <p className="text-sm text-muted">
              Users submit ID type, number, and name. Approving unlocks withdrawals at or above the threshold.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>Threshold (MWK)</Label>
                <Input value={kycThreshold} onChange={(e) => setKycThreshold(e.target.value)} className="w-36" />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={opsBusy}
                onClick={() => {
                  setOpsBusy(true);
                  void adminSetKycThreshold({ data: { thresholdKwacha: Number(kycThreshold) || 0 } })
                    .then((r) => {
                      setKycThreshold(String(r.thresholdKwacha));
                      setOpsMsg(`KYC threshold set to ${r.thresholdKwacha.toLocaleString()} MWK`);
                    })
                    .catch((err) => setOpsMsg(errMessage(err)))
                    .finally(() => setOpsBusy(false));
                }}
              >
                Save threshold
              </Button>
            </div>
            <ul className="space-y-2 text-sm">
              {(kycQueue?.rows ?? []).map((r) => (
                <li key={r.userId} className="rounded-xl border border-border px-3 py-2">
                  <p className="font-medium">
                    {r.name} @{r.username} · <span className="text-muted">{r.status}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {r.idType} · {r.idNumber} · name on ID: {r.idName} · DOB {r.dateOfBirth}
                  </p>
                  <p className="text-xs text-muted">{r.email} · {r.phone}</p>
                  {r.status === "pending" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={opsBusy}
                        onClick={() => {
                          setOpsBusy(true);
                          void adminReviewKyc({ data: { userId: r.userId, decision: "verified" } })
                            .then(() => adminListKycQueue())
                            .then(setKycQueue)
                            .catch((err) => setOpsMsg(errMessage(err)))
                            .finally(() => setOpsBusy(false));
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={opsBusy}
                        onClick={() => {
                          const note = window.prompt("Rejection reason (optional)") || "";
                          setOpsBusy(true);
                          void adminReviewKyc({ data: { userId: r.userId, decision: "rejected", note } })
                            .then(() => adminListKycQueue())
                            .then(setKycQueue)
                            .catch((err) => setOpsMsg(errMessage(err)))
                            .finally(() => setOpsBusy(false));
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
              {!kycQueue?.rows?.length ? <li className="text-muted">No KYC submissions yet.</li> : null}
            </ul>
          </Card>

          <Card className="space-y-2 p-4 text-sm text-muted">
            <h2 className="font-display text-lg font-semibold text-fg">Limits &amp; sessions</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Deposits ~15/hour per user · withdrawals ~20/hour · sends ~30/hour</li>
              <li>Wrong PIN attempts escalate lockouts; force-credit is capped for admin</li>
              <li>Sessions: 30-day inactivity ends access; max 12 devices — oldest dropped</li>
              <li>Users can sign out other devices from Profile → Sessions</li>
            </ul>
          </Card>
          {opsMsg ? <p className="text-sm text-muted">{opsMsg}</p> : null}
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
  const [mode, setMode] = useState<"self" | "any" | "main">("self");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof adminLookupMomoRecipient>> | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const kwacha = Number(amount);

  async function doLookup() {
    setBusy(true);
    setErr(null);
    setLookup(null);
    setConfirmOff(false);
    try {
      const res = await adminLookupMomoRecipient({ data: { phone } });
      setLookup(res);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === "main") {
        const res = await adminTreasuryToMain({
          data: {
            amountKwacha: kwacha,
            pin,
            idempotencyKey: crypto.randomUUID(),
          },
        });
        setMsg(
          `Moved to admin main balance. Gross ${formatKwacha(res.grossTambala)} · 1.8% ${formatKwacha(res.feeTambala)} · net credited ${formatKwacha(res.netTambala)}. Ref ${res.reference}`,
        );
      } else if (mode === "self") {
        const res = await adminTreasuryWithdraw({
          data: {
            amountKwacha: kwacha,
            pin,
            idempotencyKey: crypto.randomUUID(),
          },
        });
        setMsg(
          `Sent to your registered number. Gross ${formatKwacha(res.grossTambala)} · rail ~${formatKwacha(res.feeTambala)} · net ${formatKwacha(res.netTambala)}. Ref ${res.reference}`,
        );
      } else {
        if (!lookup) throw new Error("Look up the number first.");
        const res = await adminTreasurySendToPhone({
          data: {
            amountKwacha: kwacha,
            pin,
            phone: lookup.phone,
            confirmedOffPlatform: lookup.onPlatform ? true : confirmOff,
            idempotencyKey: crypto.randomUUID(),
          },
        });
        setMsg(
          `Sent to ${lookup.phoneDisplay}. Gross ${formatKwacha(res.grossTambala)} · rail ~${formatKwacha(res.feeTambala)} · net ${formatKwacha(res.netTambala)}. Ref ${res.reference}`,
        );
        setLookup(null);
        setPhone("");
        setConfirmOff(false);
      }
      setAmount("");
      setPin("");
      onDone();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const canSendAny =
    mode === "any" &&
    lookup &&
    (lookup.onPlatform || confirmOff) &&
    pin.length === 4 &&
    kwacha > 0;

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t border-border pt-3">
      <p className="text-sm text-muted">
        Available: {formatKwacha(availableTambala)}. MoMo payout or move to admin main both take ~1.8%. Moving to
        main is ledger-only (no PayChangu send).
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          className={
            mode === "self"
              ? "rounded-xl border border-primary bg-primary/10 px-3 py-2 text-sm font-medium"
              : "rounded-xl border border-border px-3 py-2 text-sm text-muted"
          }
          onClick={() => {
            setMode("self");
            setLookup(null);
            setErr(null);
          }}
        >
          My registered number
        </button>
        <button
          type="button"
          className={
            mode === "any"
              ? "rounded-xl border border-primary bg-primary/10 px-3 py-2 text-sm font-medium"
              : "rounded-xl border border-border px-3 py-2 text-sm text-muted"
          }
          onClick={() => {
            setMode("any");
            setErr(null);
          }}
        >
          Any Airtel / TNM
        </button>
        <button
          type="button"
          className={
            mode === "main"
              ? "rounded-xl border border-primary bg-primary/10 px-3 py-2 text-sm font-medium"
              : "rounded-xl border border-border px-3 py-2 text-sm text-muted"
          }
          onClick={() => {
            setMode("main");
            setLookup(null);
            setErr(null);
          }}
        >
          To admin main balance
        </button>
      </div>

      {mode === "any" ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs text-muted">
            Recipient does <span className="text-fg">not</span> need a NEXA account. PayChangu does not publish a
            MoMo name-enquiry API — if they are on NEXA we show their name; otherwise confirm the digits carefully.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="adm-momo">Recipient number</Label>
              <Input
                id="adm-momo"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setLookup(null);
                  setConfirmOff(false);
                }}
                placeholder="09… or 08…"
              />
            </div>
            <Button type="button" variant="secondary" disabled={busy || phone.trim().length < 8} onClick={() => void doLookup()}>
              {busy && !lookup ? "Looking up…" : "Look up"}
            </Button>
          </div>
          {lookup ? (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
              <p>
                <span className="text-muted">Number</span>{" "}
                <span className="font-medium tabular-nums">{lookup.phoneDisplay}</span>
              </p>
              <p>
                <span className="text-muted">Network</span> {lookup.operator}
              </p>
              {lookup.onPlatform ? (
                <p>
                  <span className="text-muted">On NEXA</span>{" "}
                  <span className="font-medium text-primary">
                    {lookup.fullName}
                    {lookup.username ? ` (@${lookup.username})` : ""}
                  </span>
                </p>
              ) : (
                <p className="text-amber-600 dark:text-amber-400">
                  Not on NEXA-SAVER — MoMo holder name is not available from PayChangu before send.
                </p>
              )}
              <p className="text-xs text-muted">{lookup.note}</p>
              {!lookup.onPlatform ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={confirmOff}
                    onChange={(e) => setConfirmOff(e.target.checked)}
                  />
                  <span>
                    I double-checked this number and accept sending to a wallet not registered on NEXA-SAVER.
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

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
            {mode === "main"
              ? `After 1.8%, about ${Math.max(0, Math.round(kwacha * 0.982))} kwacha is credited to admin main balance`
              : `After ~1.8% rail fee about ${Math.max(0, Math.round(kwacha * 0.982))} kwacha lands on the phone`}
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
        disabled={
          busy ||
          pin.length !== 4 ||
          !kwacha ||
          kwacha <= 0 ||
          (mode === "any" && !canSendAny)
        }
      >
        {busy
          ? "Sending…"
          : mode === "main"
            ? "Send to main balance"
            : mode === "self"
              ? "Withdraw to my number"
              : "Send to this MoMo number"}
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
            <Button
              type="button"
              className="w-full"
              loading={busy}
              onClick={() => {
                setBusy(true);
                setErr(null);
                setMsg(null);
                void adminResolvePendingDeposit({ data: { reference: result.tx.reference } })
                  .then((r) => {
                    setMsg(r.message);
                    return adminLookupReference({ data: { reference: result.tx.reference } });
                  })
                  .then((look) => setResult(look))
                  .catch((e) => setErr(errMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Recheck PayChangu (credit or clear)
            </Button>
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
