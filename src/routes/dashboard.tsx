import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ArrowDownToLine, ArrowUpFromLine, Send } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Modal } from "@/components/modal";
import { PinPad } from "@/components/pin-pad";
import { SessionGate } from "@/components/session-gate";
import { SuccessBurst } from "@/components/success-burst";
import { Button } from "@/components/ui/button";
import { LoadingStatus } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPOSIT_FEE_RATE, MIN_DEPOSIT_KWACHA, MIN_WITHDRAW_KWACHA, BANK_FLAT_FEE_KWACHA, MIN_BANK_WITHDRAW_KWACHA, MOMO_PAYOUT_RAIL_RATE } from "@/lib/nexa/constants";
import { errMessage } from "@/lib/nexa/errors";
import { friendlyWebAuthnError } from "@/lib/nexa/webauthn-errors";
import { useT } from "@/lib/i18n/client";
import {
  confirmDemoDeposit,
  getBalance,
  listTransactions,
  startDeposit,
  createReceiveLink,
  listMyReceiveLinks,
  startWithdraw,
  getPayoutMethodsPublic,
  getRailOutagePublic,
  getWithdrawLockStatus,
  setWithdrawTimeLock,
  cancelWithdrawTimeLock,
  extendWithdrawTimeLock,
  getPlatformSupportPhone,
  getPublicFeePolicy,
  getSendFeeTiersPublic,
  lookupSendRecipient,
  startTransfer,
  adminSendFromWallet,
  adminLookupSendTarget,
  moveReceivedToMain,
  userWebAuthnRegisterOptions,
  userWebAuthnRegisterVerify,
  requestTransferReversal,
  getLoanEligibility,
  getMyLoans,
  applyLoan,
  repayLoan,
  getAffiliateStatus,
  becomeAffiliate,
  withdrawAffiliateEarnings,
  getReferralPublicConfig,
  verifyPin,
  resendVerificationEmailFn,
} from "@/lib/nexa/fns";
import { formatKwacha, kwachaToTambala, parseKwachaInput, splitDeposit } from "@/lib/nexa/money";
import { formatPhoneDisplay } from "@/lib/nexa/phone";
import type { BalanceResponse, PublicTx } from "@/lib/nexa/types";
import { SecuritySurveyGate } from "@/components/security-survey";
import { HelpFab } from "@/components/help-fab";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

function DashboardPage() {
  return (
    <SessionGate>
      {(ctx) => <Vault {...ctx} />}
    </SessionGate>
  );
}

function Vault({
  profile,
  demoPayments,
  emailVerified,
  hasPasskey: hasPasskeyInitial,
}: {
  profile: {
    firstName: string;
    phone: string;
    phoneVerified?: boolean;
    hasBankDetails?: boolean;
    bankName?: string | null;
    bankAccountNumberMasked?: string | null;
    bankAccountName?: string | null;
    bankVerified?: boolean;
    bankHoldUntil?: string | null;
  };
  demoPayments: boolean;
  emailVerified: boolean;
  hasPasskey: boolean;
}) {
  const { t } = useT();
  const [hasPasskey, setHasPasskey] = useState(hasPasskeyInitial);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [txs, setTxs] = useState<PublicTx[] | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [success, setSuccess] = useState<{ title: string; body: string } | null>(null);
  // Hidden until the user explicitly reveals with PIN (never auto-show on load).
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [depositFeeRate, setDepositFeeRate] = useState(DEPOSIT_FEE_RATE);

  const [selectedTx, setSelectedTx] = useState<PublicTx | null>(null);
  const [activityPage, setActivityPage] = useState(0);
  const [railNotice, setRailNotice] = useState<string>("");

  const revealed = Boolean(balanceVisible && balance && !balance.locked);

  const reloadMoney = useCallback(async () => {
    const [b, t] = await Promise.all([getBalance(), listTransactions().catch(() => [] as PublicTx[])]);
    setBalance(b);
    setTxs(t);
  }, []);


  useEffect(() => {
    void getRailOutagePublic()
      .then((r) => setRailNotice(r.enabled && r.message ? r.message : ""))
      .catch(() => setRailNotice(""));
  }, []);

  // Activity + withdraw meta load without PIN; balance figure stays hidden until PIN reveal.
  useEffect(() => {
    void listTransactions()
      .then(setTxs)
      .catch(() => setTxs([]));
    void getBalance()
      .then(setBalance)
      .catch(() => setBalance(null));
    void getPublicFeePolicy()
      .then((p) => setDepositFeeRate(p.depositFeeRate))
      .catch(() => undefined);

  }, []);

  return (
    <div className="space-y-5">
      <SecuritySurveyGate />
      <HelpFab />
      <div className="stagger-in">
        <p className="text-sm text-muted">{t("dash.welcome")}</p>
        <h1 className="font-display text-3xl font-semibold">{profile.firstName}</h1>
      </div>

      {!hasPasskey ? (
        <div className="rounded-xl border border-primary/35 bg-primary/10 px-4 py-3 text-sm">
          <p className="font-medium text-fg">{t("dash.passkeyTitle")}</p>
          <p className="mt-1 text-muted">{t("dash.passkeyBody")}</p>
          <Button
            type="button"
            className="mt-3"
            disabled={passkeyBusy}
            onClick={() => {
              setPasskeyBusy(true);
              setPasskeyMsg(null);
              void (async () => {
                try {
                  const opts = await userWebAuthnRegisterOptions();
                  // @ts-expect-error package types resolved at runtime / may be missing in IDE
                  const { startRegistration } = await import("@simplewebauthn/browser");
                  const att = await startRegistration({ optionsJSON: opts });
                  await userWebAuthnRegisterVerify({
                    data: { response: att, nickname: "My passkey" },
                  });
                  setHasPasskey(true);
                  setPasskeyMsg(t("dash.passkeySaved"));
                } catch (err) {
                  setPasskeyMsg(friendlyWebAuthnError(err));
                } finally {
                  setPasskeyBusy(false);
                }
              })();
            }}
          >
            {passkeyBusy ? t("dash.passkeyWaiting") : t("dash.passkeyCta")}
          </Button>
          {passkeyMsg ? <p className="mt-2 text-xs text-muted">{passkeyMsg}</p> : null}
        </div>
      ) : null}

      {!emailVerified ? (
        <EmailVerifyBanner />
      ) : null}

      {emailVerified && !profile.phoneVerified ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <p className="font-medium text-fg">{t("dash.verifyPhoneTitle")}</p>
          <p className="mt-1 text-muted">
            To unlock withdrawals, deposit once from your registered number{" "}
            <span className="text-fg">{formatPhoneDisplay(profile.phone)}</span>. That proves the line is active and yours.
          </p>
          <Button className="mt-3" onClick={() => setDepositOpen(true)}>
            {t("dash.depositToVerify")}
          </Button>
        </div>
      ) : null}

      <Card className="relative overflow-hidden p-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{t("dash.available")}</p>
        <div className="mt-4 flex items-end justify-between gap-3">
          {revealed ? (
            <p className="balance-reveal font-display text-4xl font-semibold tabular-nums">
              {formatKwacha(balance && !balance.locked ? balance.balanceTambala : 0)}
            </p>
          ) : (
            <p className="font-display text-4xl font-semibold tracking-widest text-faint">••••••</p>
          )}
          <Button variant="secondary" size="icon" onClick={() => (revealed ? setBalanceVisible(false) : setCheckOpen(true))} aria-label={t("dash.toggleBalance")}>
            <span className="relative block size-5">
              <Eye className={`absolute inset-0 size-5 transition-[opacity,transform,filter] duration-300 ${revealed ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100"}`} />
              <EyeOff className={`absolute inset-0 size-5 transition-[opacity,transform,filter] duration-300 ${revealed ? "scale-100 opacity-100" : "scale-[0.25] opacity-0 blur-[4px]"}`} />
            </span>
          </Button>
        </div>
        {revealed && ((balance as { receivedBalanceTambala?: number }).receivedBalanceTambala ?? 0) > 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("dash.receivedBag")}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums text-fg">
              {formatKwacha((balance as { receivedBalanceTambala?: number }).receivedBalanceTambala ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted">{t("dash.receivedBagHint")}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => {
                void moveReceivedToMain({ data: {} })
                  .then(() => {
                    setSuccess({
                      title: "Moved to main vault",
                      body: "Received funds are now in your main balance. Bank withdraws from main still use the 700 MWK bank flat.",
                    });
                    void reloadMoney();
                  })
                  .catch((err) => setSuccess({ title: "Could not move", body: errMessage(err) }));
              }}
            >
              {t("dash.moveToMain")}
            </Button>
          </div>
        ) : null}

        {!revealed ? (
          <Button className="mt-5 w-full" onClick={() => setCheckOpen(true)}>
            {t("dash.checkBalance")}
          </Button>
        ) : balance && !balance.locked ? (
          <p className="mt-3 text-sm text-muted">
            Lifetime in {formatKwacha(balance.lifetimeDepositedTambala)} · out{" "}
            {formatKwacha(balance.lifetimeWithdrawnTambala)}
          </p>
        ) : null}

        {balance ? (
          <div className="mt-3 space-y-1.5 text-sm">
            <WithdrawHoldCountdown until={balance.withdrawHoldUntil} />
            <p className="text-muted">
              Daily max{" "}
              <span className="font-medium text-fg">
                {formatKwacha(balance.dailyWithdrawCapTambala)}
              </span>
              {balance.withdrawHoldUntil && new Date(balance.withdrawHoldUntil).getTime() > Date.now()
                ? null
                : (
                    <>
                      {" "}
                      · left today{" "}
                      <span className="font-medium text-fg">
                        {formatKwacha(balance.dailyWithdrawRemainingTambala)}
                      </span>
                    </>
                  )}
            </p>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Button
          className="h-auto min-h-16 flex-col gap-1.5 px-2 py-3 text-xs sm:h-14 sm:min-h-14 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm"
          onClick={() => setDepositOpen(true)}
        >
          <ArrowDownToLine className="size-6 shrink-0 sm:size-5" aria-hidden />
          <span>{t("dash.receive")}</span>
        </Button>
        <Button
          variant="secondary"
          className="h-auto min-h-16 flex-col gap-1.5 px-2 py-3 text-xs sm:h-14 sm:min-h-14 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm"
          onClick={() => setWithdrawOpen(true)}
        >
          <ArrowUpFromLine className="size-6 shrink-0 sm:size-5" aria-hidden />
          <span>{t("dash.withdraw")}</span>
        </Button>
        <Button
          variant="secondary"
          className="h-auto min-h-16 flex-col gap-1.5 px-2 py-3 text-xs sm:h-14 sm:min-h-14 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm"
          onClick={() => setSendOpen(true)}
        >
          <Send className="size-6 shrink-0 sm:size-5" aria-hidden />
          <span>{t("dash.send")}</span>
        </Button>
      </div>


      <ReceiveLinkPanel />

      <section>
        
        {railNotice ? (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-fg">
            <p className="font-medium">Withdrawal notice</p>
            <p className="mt-1 text-muted">{railNotice}</p>
          </div>
        ) : null}

        <WithdrawLockPanel />
        <LoanPanel />
        <AffiliatePanel />

        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t("dash.activity")}</h2>
          {txs && txs.length > 0 ? (
            <a
              href="/activity"
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("dash.viewAll")}
            </a>
          ) : null}
        </div>
        {txs === null ? (
          <p className="text-sm text-muted">{t("dash.loadingActivity")}</p>
        ) : !txs.length ? (
          <p className="text-sm text-muted">{t("dash.noActivity")}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {txs.slice(activityPage * 5, activityPage * 5 + 5).map((tx) => (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTx(tx)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left transition hover:border-primary/40 hover:bg-surface-2"
                  >
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {tx.kind === "transfer_out"
                          ? "Sent"
                          : tx.kind === "transfer_in"
                            ? t("dash.received")
                            : tx.kind.replace("_", " ")}
                      </p>
                      <p className="text-xs text-muted">
                        {tx.status} · {new Date(tx.createdAt).toLocaleString()}
                        {tx.kind === "transfer_out" && (tx.sendFeeTambala ?? 0) > 0
                          ? ` · includes ${formatKwacha(tx.sendFeeTambala!, { compact: true })} fee`
                          : ""}
                      </p>
                    </div>
                    <p className="text-sm tabular-nums">
                      {tx.kind === "deposit" || tx.kind === "transfer_in" ? "+" : "−"}
                      {formatKwacha(
                        tx.kind === "deposit" || tx.kind === "transfer_in"
                          ? tx.creditedTambala || tx.grossTambala
                          : tx.kind === "transfer_out"
                            ? tx.grossTambala + (tx.sendFeeTambala ?? 0)
                            : tx.grossTambala,
                        { compact: true },
                      )}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {txs.length > 5 ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  disabled={activityPage <= 0}
                  onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                >
                  {t("dash.prevPage")}
                </Button>
                <p className="text-xs text-muted">
                  {activityPage * 5 + 1}–{Math.min((activityPage + 1) * 5, txs.length)} / {txs.length}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  disabled={(activityPage + 1) * 5 >= txs.length}
                  onClick={() => setActivityPage((p) => p + 1)}
                >
                  {t("dash.nextPage")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <ActivityDetailModal
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
        onReversalRequested={() => void reloadMoney()}
      />
      <SendModal
        open={sendOpen}
        isAdmin={(profile as { role?: string }).role === "admin"}
        onClose={() => setSendOpen(false)}
        onSuccess={(title, body) => {
          setSendOpen(false);
          setSuccess({ title, body });
          void reloadMoney();
        }}
      />

      <CheckBalanceModal
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        onDone={async () => {
          setCheckOpen(false);
          setBalanceVisible(true);
          await reloadMoney();
        }}
      />
      <DepositModal
        open={depositOpen}
        demo={demoPayments}
        depositFeeRate={depositFeeRate}
        registeredPhone={profile.phone}
        onClose={() => setDepositOpen(false)}
        onSuccess={(title, body) => {
          setDepositOpen(false);
          setSuccess({ title, body });
          void reloadMoney();
        }}
      />
      <WithdrawModal
        open={withdrawOpen}
        phone={profile.phone}
        phoneVerified={Boolean(profile.phoneVerified)}
        hasBank={Boolean(profile.hasBankDetails)}
        bankLabel={
          profile.hasBankDetails
            ? `${profile.bankName ?? "Bank"} ${profile.bankAccountNumberMasked ?? ""}`
            : null
        }
        bankHoldUntil={profile.bankHoldUntil ?? null}
        maxTambala={balance && !balance.locked ? balance.balanceTambala : 0}
        receivedTambala={(balance as { receivedBalanceTambala?: number })?.receivedBalanceTambala ?? 0}
        dailyRemainingTambala={balance ? balance.dailyWithdrawRemainingTambala : 0}
        holdMessage={balance?.withdrawHoldMessage ?? null}
        revealed={revealed}
        onClose={() => setWithdrawOpen(false)}
        onNeedPin={() => setCheckOpen(true)}
        onSuccess={(title, body) => {
          setWithdrawOpen(false);
          setSuccess({ title, body });
          void reloadMoney();
        }}
      />
      {success ? <SuccessBurst title={success.title} body={success.body} onDone={() => setSuccess(null)} /> : null}
    </div>
  );
}




function WithdrawHoldCountdown({
  until }: { until: string | null }) {
  const { t } = useT();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!until) {
      setLabel(null);
      return;
    }
    function tick() {
      const ms = new Date(until!).getTime() - Date.now();
      if (ms <= 0) {
        setLabel(null);
        return;
      }
      const totalMin = Math.floor(ms / 60000);
      const days = Math.floor(totalMin / (60 * 24));
      const hours = Math.floor((totalMin % (60 * 24)) / 60);
      const mins = totalMin % 60;
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0 || days > 0) parts.push(`${hours}h`);
      parts.push(`${mins}m`);
      setLabel(parts.join(" "));
    }
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [until]);

  if (!label) return null;
  return (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-fg">
      {t("dash.withdrawableIn")} <span className="font-semibold tabular-nums">{label}</span>
      <span className="text-muted"> · new accounts and security changes stay on a short hold</span>
    </p>
  );
}

function ActivityDetailModal({
  tx,
  onClose,
  onReversalRequested,
}: {
  tx: PublicTx | null;
  onClose: () => void;
  onReversalRequested?: () => void;
}) {
  const { t } = useT();
  // All hooks must run every render (React rules). Never put hooks after an early return.
  const [copied, setCopied] = useState(false);
  const [revBusy, setRevBusy] = useState(false);
  const [revMsg, setRevMsg] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (!tx) return null;
  // Narrow for nested functions (TS does not always carry control-flow into closures)
  const detail = tx;

  const when = new Date(detail.createdAt);
  const feeTambala = detail.kind === "deposit" ? Math.max(0, detail.grossTambala - detail.creditedTambala) : 0;
  const title =
    detail.kind === "deposit"
      ? t("dash.depositDetails")
      : detail.kind === "transfer_out"
        ? t("dash.sendDetails")
        : detail.kind === "transfer_in"
          ? t("dash.receivedDetails")
          : detail.kind === "fee"
            ? t("dash.feeDetails")
            : t("dash.withdrawDetails");

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(detail.reference);
      setCopied(true);
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy reference:", detail.reference);
    }
  }

  async function requestReversal() {
    setRevBusy(true);
    setRevMsg(null);
    try {
      const res = await requestTransferReversal({ data: { reference: detail.reference } });
      setRevMsg(res.message);
      onReversalRequested?.();
    } catch (e) {
      setRevMsg(errMessage(e));
    } finally {
      setRevBusy(false);
    }
  }

  return (
    <Modal open={Boolean(tx)} title={title} onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t("dash.status")}</dt>
          <dd className="font-medium capitalize">{tx.status}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t("dash.date")}</dt>
          <dd>
            {when.toLocaleDateString(undefined, {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t("dash.time")}</dt>
          <dd>{when.toLocaleTimeString()}</dd>
        </div>
        {tx.kind === "deposit" ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("dash.paidGross")}</dt>
              <dd className="tabular-nums">{formatKwacha(tx.grossTambala)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("dash.platformFee")}</dt>
              <dd className="tabular-nums">{formatKwacha(feeTambala)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("tx.creditedToVault")}</dt>
              <dd className="tabular-nums font-medium text-primary">{formatKwacha(tx.creditedTambala)}</dd>
            </div>
          </>
        ) : tx.kind === "transfer_out" ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("tx.amountSent")}</dt>
              <dd className="tabular-nums font-medium">{formatKwacha(tx.grossTambala)}</dd>
            </div>
            {(tx.sendFeeTambala ?? 0) > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("dash.sendFee")}</dt>
                <dd className="tabular-nums">{formatKwacha(tx.sendFeeTambala!)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("tx.totalFromBalance")}</dt>
              <dd className="tabular-nums font-medium">
                {formatKwacha(tx.grossTambala + (tx.sendFeeTambala ?? 0))}
              </dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("dash.amount")}</dt>
            <dd className="tabular-nums font-medium">{formatKwacha(tx.grossTambala)}</dd>
          </div>
        )}
        {tx.phone ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("dash.mobileNumber")}</dt>
            <dd>{formatPhoneDisplay(tx.phone)}</dd>
          </div>
        ) : null}
        <div className="space-y-1.5 border-t border-border pt-3">
          <dt className="text-muted">{t("dash.reference")}</dt>
          <dd className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-2 px-3 py-2 text-xs">{tx.reference}</code>
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => void copyRef()}>
              {copied ? t("common.copied") : t("common.copy")}
            </Button>
          </dd>
        </div>
        {tx.note ? (
          <div className="space-y-1 border-t border-border pt-3">
            <dt className="text-muted">{t("dash.note")}</dt>
            <dd className="text-xs text-muted">{tx.note}</dd>
          </div>
        ) : null}
      </dl>
      {tx.status === "pending" && tx.kind === "deposit" ? (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted">{t("dash.stillPending")}</p>
      ) : null}
      <Button type="button" className="mt-5 w-full" variant="secondary" onClick={onClose}>
        {t("common.close")}
      </Button>
    
      {tx.kind === "transfer_out" ? (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted">{t("dash.sendFeeIncluded")}</p>
          {tx.phone ? (
            <p className="text-sm">
              {t("dash.toNumber")} <span className="font-medium tabular-nums">{tx.phone}</span>
            </p>
          ) : null}
          <Button type="button" variant="secondary" className="w-full" disabled={revBusy} onClick={() => void requestReversal()}>
            {revBusy ? t("dash.sending") : "Request reversal"}
          </Button>
          {revMsg ? <p className="text-sm text-muted">{revMsg}</p> : null}
        </div>
      ) : null}
</Modal>
  );
}

function EmailVerifyBanner() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await resendVerificationEmailFn();
      setMsg(
        res.alreadyVerified
          ? t("dash.emailVerifiedRefresh")
          : "Verification email sent. Check your inbox and spam folder.",
      );
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <Link to="/profile" className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <p className="font-medium text-fg">{t("common.emailNotVerified")}</p>
        <p className="mt-1 text-muted">
          {t("dash.emailVerifyBanner")}
        </p>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" loading={busy} onClick={() => void resend()}>
          {busy ? t("dash.sending") : "Resend verification email"}
        </Button>
        <Link to="/profile" className="text-sm text-primary underline-offset-2 hover:underline">
          {t("dash.openProfile")}
        </Link>
      </div>
      {msg ? <p className="mt-2 text-xs text-primary">{msg}</p> : null}
      {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}
    </div>
  );
}

function CheckBalanceModal({
  open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(nextPin: string) {
    if (busy || nextPin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      await verifyPin({ data: { pin: nextPin } });
      setPin("");
      onDone();
    } catch (err) {
      setError(errMessage(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={t("dash.checkBalance")} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">
        {t("dash.balancePinHint")}
      </p>
      <div className={busy ? "pointer-events-none opacity-50" : undefined}>
        <PinPad
          value={pin}
          onChange={setPin}
          disabled={busy}
          error={Boolean(error)}
          onComplete={(p) => void confirm(p)}
        />
      </div>
      {error ? <p className="mt-3 text-center text-sm text-danger">{error}</p> : null}
{busy ? <LoadingStatus label={t("dash.checkingBalance")} /> : null}
    </Modal>
  );
}


function ReceiveLinkPanel() {
  const { t } = useT();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function create() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await createReceiveLink({ data: {} });
      const full =
        typeof window !== "undefined"
          ? `${window.location.origin}${res.path}`
          : res.path;
      setLink(full);
      setMsg(t("dash.linkReady"));
      setOpen(true);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMsg(t("dash.linkCopied"));
    } catch {
      setMsg(link);
    }
  }

  return (
    <Card className="mt-3 space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold">{t("dash.shareReceiveLink")}</h2>
          <p className="text-xs text-muted">{t("dash.receiveLinkHint")}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" loading={busy} disabled={busy} onClick={() => void create()}>
          {busy ? t("common.loading") : t("dash.createLink")}
        </Button>
      </div>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
      {link ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
          <p className="break-all font-mono text-xs text-fg">{link}</p>
          <div className="flex gap-2">
            <Button type="button" className="flex-1" size="sm" onClick={() => void copy()}>
              {t("dash.copyReceiveLink")}
            </Button>
            <Button
              type="button"
              className="flex-1"
              size="sm"
              variant="secondary"
              onClick={() => {
                if (navigator.share) {
                  void navigator.share({ title: "Pay me on NEXA-SAVER", url: link }).catch(() => undefined);
                } else {
                  void copy();
                }
              }}
            >
              {t("dash.shareAction")}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function DepositModal({
  depositFeeRate = DEPOSIT_FEE_RATE,
  open,
  demo,
  registeredPhone,
  onClose,
  onSuccess,
}: {
  depositFeeRate?: number;
  open: boolean;
  demo: boolean;
  registeredPhone?: string;
  onClose: () => void;
  onSuccess: (title: string, body: string) => void;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState("100");
  const [phone, setPhone] = useState(registeredPhone || "");
  const [stage, setStage] = useState<"form" | "confirm" | "pay">("form");
  const [ref, setRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kwacha = parseKwachaInput(amount);
  const split = kwacha
    ? splitDeposit(kwachaToTambala(kwacha), {
        depositFeeRate,
        // rates inside splitDeposit use FIXED 1.5% cost + 2% reserve; profit = remainder
      })
    : null;

  // Prefill registered number whenever the modal opens
  useEffect(() => {
    if (open) {
      setPhone((prev) => prev.trim() || registeredPhone || "");
      setStage("form");
      setError(null);
      setRef(null);
    }
  }, [open, registeredPhone]);

  function reset() {
    setStage("form");
    setRef(null);
    setError(null);
    onClose();
  }

  async function start() {
    if (!kwacha) return;
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 9) {
      setError(t("dash.validMwPhone"));
      setStage("form");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await startDeposit({
        data: {
          amountKwacha: kwacha,
          phone: phone.trim(),
          origin: window.location.origin,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      if (res.mode === "live") {
        window.location.href = res.checkoutUrl;
        return;
      }
      setRef(res.reference);
      setStage("pay");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!ref || !split) return;
    setBusy(true);
    setError(null);
    try {
      await confirmDemoDeposit({ data: { reference: ref } });
      onSuccess(
        "Payment received",
        `You deposited ${formatKwacha(split.gross)} but the system has taken ${formatKwacha(split.fee)} to reserve it as a future withdrawal fee. ${formatKwacha(split.credited)} is now yours.`,
      );
      setStage("form");
      setRef(null);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={t("dash.receivePayment")} onClose={reset}>
      {stage === "form" ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dep-amt">{t("common.amountKwacha")}</Label>
            <Input id="dep-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted">Minimum {MIN_DEPOSIT_KWACHA} kwacha</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-phone">{t("dash.payingNumber")}</Label>
            <Input
              id="dep-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09… or 08…"
              autoComplete="tel"
            />
            <p className="text-xs text-muted">{t("dash.payingNumberHint")}</p>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" disabled={!kwacha || !phone} onClick={() => setStage("confirm")}>
            {t("common.continue")}
          </Button>
        </div>
      ) : null}
      {stage === "confirm" && split ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-4 text-sm">
            <p>
              The system will keep {(depositFeeRate * 100).toFixed(1).replace(/\.0$/, '')}% of whatever amount you are depositing as a
              withdrawal fee.
            </p>
            <p className="mt-3 text-muted">
              You send {formatKwacha(split.gross)}. {formatKwacha(split.fee)} is reserved. {formatKwacha(split.credited)} lands in your vault.
            </p>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStage("form")}>
              {t("common.back")}
            </Button>
            <Button className="flex-1" loading={busy} disabled={busy} onClick={() => void start()}>
              {busy ? t("dash.openingPaychangu") : t("dash.continuePaychangu")}
            </Button>
          </div>
        </div>
      ) : null}
      {stage === "pay" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {demo
              ? t("fee.demoMode")
              : t("fee.approvePhone")}
          </p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" loading={busy} disabled={busy} onClick={() => void approve()}>
            {busy ? t("dash.creditingVault") : t("dash.approvedPayment")}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}



function SendModal({
    open,
  isAdmin = false,
  onClose,
  onSuccess,
}: {
  open: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onSuccess: (title: string, body: string) => void;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState("500");
  const [phone, setPhone] = useState("");
  const [recipient, setRecipient] = useState<{
    fullName: string;
    phone: string;
    kind?: "nexa" | "external";
    operator?: string;
  } | null>(null);
  const [confirmExternal, setConfirmExternal] = useState(false);
  const [coverBankFlat, setCoverBankFlat] = useState(false);
  const [pin, setPin] = useState("");
  const [stage, setStage] = useState<"form" | "confirm" | "pin">("form");
  const [tiers, setTiers] = useState<Array<{ minKwacha: number; maxKwacha: number | null; feeKwacha: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStage("form");
    setRecipient(null);
    setPin("");
    setError(null);
    setConfirmExternal(false);
    void getSendFeeTiersPublic()
      .then(setTiers)
      .catch(() => setTiers([]));
  }, [open]);

  const kwacha = parseKwachaInput(amount);
  const feeKwacha = (() => {
    if (!kwacha) return 0;
    for (const t of tiers) {
      if (kwacha < t.minKwacha) continue;
      if (t.maxKwacha == null || kwacha <= t.maxKwacha) return t.feeKwacha;
    }
    return 0;
  })();
  /** PayChangu MoMo payout estimate (1.8%). Charged by PayChangu, not NEXA. */
  const railFeeKwacha = kwacha ? Math.round(kwacha * MOMO_PAYOUT_RAIL_RATE) : 0;
  const railPctLabel = `${(MOMO_PAYOUT_RAIL_RATE * 100).toFixed(1)}%`;

  async function lookup() {
    setBusy(true);
    setError(null);
    setConfirmExternal(false);
    try {
      if (!kwacha || kwacha < 100) throw new Error("Minimum send is 100 kwacha.");
      if (isAdmin) {
        const res = await adminLookupSendTarget({ data: { phone } });
        setRecipient({
          fullName: res.fullName ?? (res.kind === "external" ? t("dash.externalMomo") : "Unknown"),
          phone: res.phone,
          kind: res.kind,
          operator: res.operator,
        });
        setStage("confirm");
      } else {
        const res = await lookupSendRecipient({ data: { phone } });
        setRecipient({ fullName: res.fullName, phone: res.phone, kind: "nexa" });
        setStage("confirm");
      }
    } catch (e) {
      setRecipient(null);
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const key = `snd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      if (isAdmin) {
        const res = await adminSendFromWallet({
          data: {
            amountKwacha: kwacha!,
            phone: recipient!.phone,
            pin,
            confirmedExternal: recipient!.kind === "external" ? confirmExternal : true,
            idempotencyKey: key,
          },
        });
        onSuccess(
          "Sent to MoMo",
          `${formatKwacha(res.amountTambala)} sent to ${recipient!.phone} from main balance. Ref ${res.reference}`,
        );
      } else {
        const res = await startTransfer({
          data: {
            amountKwacha: kwacha!,
            toPhone: recipient!.phone,
            pin,
            idempotencyKey: key,
            coverBankFlat,
          },
        });
        onSuccess(
          "Sent",
          `${formatKwacha(res.amountTambala)} sent. Fee ${formatKwacha(res.feeTambala)} from your balance. Ref ${res.reference}`,
        );
      }
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={t("dash.send")} onClose={onClose}>
      <div className="space-y-4">
        {stage === "form" ? (
          <>
            <p className="text-sm text-muted">
              {isAdmin
                ? t("dash.adminSendHint")
                : "Send the full amount to another NEXA-SAVER account. A small fixed fee is charged from your balance; the recipient gets every kwacha you type."}
            </p>
            <div className="space-y-1.5">
              <Label>{t("common.amountKwacha")}</Label>
              <Input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label>{isAdmin ? t("dash.recipientMomo") : "Their registered number"}</Label>
              <Input value={phone} inputMode="tel" placeholder="09… or 08…" onChange={(e) => setPhone(e.target.value)} />
            </div>
            {kwacha && !isAdmin ? (
              <>
                <label className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={coverBankFlat}
                    onChange={(e) => setCoverBankFlat(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium text-fg">{t("tx.coverBankFlat")}</span>
                    <span className="mt-1 block text-xs text-muted">
                      You also pay 700 so their received bag is {kwacha} + 700. When they withdraw the whole bag to
                      bank, 700 covers the bank flat and they can get your full {kwacha}. MoMo never needs the 700.
                      Leave unchecked if they should fund the 700 from the amount alone.
                    </span>
                  </span>
                </label>
                <p className="text-sm text-muted">{t("dash.sendFeeLabel")}<span className="font-medium text-fg">{feeKwacha} kwacha</span>. They receive{" "}
                  <span className="font-medium text-fg">{kwacha + (coverBankFlat ? 700 : 0)} kwacha</span> in their
                  received bag. Total from your vault:{" "}
                  <span className="font-medium text-fg">{kwacha + feeKwacha + (coverBankFlat ? 700 : 0)} kwacha</span>.
                </p>
              </>
            ) : null}
            {isAdmin && kwacha ? (
              <div className="rounded-xl border border-border bg-surface-2/60 p-3 text-sm space-y-1">
                <p>
                  From your main balance / recipient gets:{" "}
                  <span className="tabular-nums font-semibold">{kwacha} kwacha</span>
                </p>
                <p className="text-xs text-muted">
                  Same as user withdrawals: no extra {railPctLabel} taken from main balance (rail was covered at
                  deposit time). No NEXA send fee.
                </p>
              </div>
            ) : null}
            <Button type="button" className="w-full" disabled={busy || !phone || !kwacha} onClick={() => void lookup()}>
              {busy ? t("session.checking") : isAdmin ? t("dash.lookUpNumber") : "Look up account"}
            </Button>
          </>
        ) : null}

        {stage === "confirm" && recipient ? (
          <>
            <p className="text-sm">
              {t("dash.send")} <span className="font-semibold tabular-nums">{kwacha} kwacha</span> to
            </p>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="font-medium text-fg">{recipient.fullName}</p>
              <p className="tabular-nums text-sm text-muted">{recipient.phone}</p>
              {recipient.operator ? (
                <p className="mt-1 text-xs text-muted">{recipient.operator}</p>
              ) : null}
              {isAdmin && recipient.kind === "external" ? (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t("dash.offPlatformWarn")}</p>
              ) : null}
              {isAdmin && recipient.kind === "nexa" ? (
                <p className="mt-2 text-xs text-muted">{t("dash.adminSendMomo")}</p>
              ) : null}
            </div>
            {isAdmin && recipient.kind === "external" ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={confirmExternal}
                  onChange={(e) => setConfirmExternal(e.target.checked)}
                />
                <span>{t("dash.confirmOffPlatform")}</span>
              </label>
            ) : null}
            {isAdmin ? (
              <div className="rounded-xl border border-border bg-surface-2/60 p-3 text-sm space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-muted">{t("tx.fromMainBalance")}</span>
                  <span className="tabular-nums font-semibold">{kwacha} kwacha</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted">{t("tx.recipientGetsMomo")}</span>
                  <span className="tabular-nums font-medium text-primary">{kwacha} kwacha</span>
                </div>
                <p className="text-xs text-muted">
                  Same as a normal user withdrawal: only this amount leaves main balance. The ~{railPctLabel} rail
                  is covered by deposit-time reserves / PayChangu float — not a second cut here.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Fee {feeKwacha} kwacha
                {coverBankFlat ? " · bank-flat cover 700" : ""} · total from your vault{" "}
                {kwacha! + feeKwacha + (coverBankFlat ? 700 : 0)} kwacha
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStage("form")}>
                {t("common.back")}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={isAdmin && recipient.kind === "external" && !confirmExternal}
                onClick={() => setStage("pin")}
              >
                {t("dash.confirmRecipient")}
              </Button>
            </div>
          </>
        ) : null}

        {stage === "pin" && recipient ? (
          <>
            <p className="text-sm text-muted">
              {isAdmin
                ? `Enter PIN to send ${kwacha} kwacha from main balance (no extra rail debit).`
                : "Enter your withdraw PIN to send."}
            </p>
            <PinPad value={pin} onChange={setPin} disabled={busy} />
            <Button
              type="button"
              className="w-full"
              disabled={busy || pin.length !== 4}
              onClick={() => void send()}
            >
              {busy ? t("dash.sending") : "Send now"}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={() => setStage("confirm")}>
              {t("common.back")}
            </Button>
          </>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}


function LoanPanel() {
  const { t } = useT();
  const [elig, setElig] = useState<Awaited<ReturnType<typeof getLoanEligibility>> | null>(null);
  const [loans, setLoans] = useState<Awaited<ReturnType<typeof getMyLoans>>>([]);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const [pin, setPin] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [repayRef, setRepayRef] = useState<string | null>(null);

  function refresh() {
    void getLoanEligibility()
      .then(setElig)
      .catch(() => setElig(null));
    void getMyLoans()
      .then(setLoans)
      .catch(() => setLoans([]));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function apply() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await applyLoan({
        data: { amountKwacha: Number(amount), repaymentMode: mode, pin },
      });
      setMsg(
        `Loan ${res.reference} opened. First amount due ${formatKwacha(res.firstDueTambala)} by ${new Date(res.nextPeriodAt).toLocaleString()}. Funds are sent to your registered mobile money.`,
      );
      setPin("");
      setOpen(false);
      refresh();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function repay(reference: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await repayLoan({ data: { reference, pin } });
      setMsg(`Paid ${formatKwacha(res.paidTambala)}. Loan closed.`);
      setRepayRef(null);
      setPin("");
      refresh();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const active = loans.filter((l) => l.status === "active");

  return (
    <Card className="mt-4 space-y-3 p-4">
      <div>
        <h2 className="font-display text-lg font-semibold">{t("loan.title")}</h2>
        <p className="text-sm text-muted">
          Only while a voluntary withdrawal time-lock is active. Admin locks do not qualify. Max{" "}
          {elig ? `${Math.round((elig.ltv || 0.9) * 100)}%` : "90%"} of locked balance. Interest{" "}
          {elig ? `${((elig.interest || 0.03) * 100).toFixed(1)}%` : "3%"} per month on the amount due.
        </p>
      </div>

      {active.map((l) => (
        <div key={l.reference} className="rounded-xl border border-border bg-surface-2 p-3 text-sm space-y-1">
          <p className="font-medium">{l.reference}</p>
          <p>
            {t("dash.dueNow")} <span className="tabular-nums font-semibold">{formatKwacha(l.balanceDueTambala)}</span>
          </p>
          <p className="text-muted">
            Principal {formatKwacha(l.principalTambala)} · mode {l.repaymentMode} · period ends{" "}
            {new Date(l.nextPeriodAt).toLocaleString()}
          </p>
          {repayRef === l.reference ? (
            <div className="space-y-2 pt-2">
              <PinPad value={pin} onChange={setPin} disabled={busy} />
              <Button type="button" className="w-full" disabled={busy || pin.length !== 4} onClick={() => void repay(l.reference)}>
                {busy ? t("dash.paying") : "Confirm repay from vault"}
              </Button>
              <Button type="button" variant="secondary" className="w-full" onClick={() => setRepayRef(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => { setRepayRef(l.reference); setPin(""); }}>
              {t("loan.repay")}
            </Button>
          )}
        </div>
      ))}

      {elig && !elig.eligible ? (
        <p className="text-sm text-muted">{elig.reason}</p>
      ) : null}

      {elig?.eligible && !active.length ? (
        open ? (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-sm text-muted">
              Max {formatKwacha(elig.maxTambala)}. First repayment ≈ amount +{" "}
              {((elig.interest || 0.03) * 100).toFixed(1)}% after one month. Collateral stays in your vault; cash is
              disbursed to your MoMo.
            </p>
            <div className="space-y-1.5">
              <Label>{t("common.amountKwacha")}</Label>
              <Input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} />
                <span>{t("loan.manualMode")}</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" checked={mode === "auto"} onChange={() => setMode("auto")} />
                <span>{t("loan.autoMode")}</span>
              </label>
            </div>
            <PinPad value={pin} onChange={setPin} disabled={busy} />
            <Button type="button" className="w-full" disabled={busy || pin.length !== 4 || !Number(amount)} onClick={() => void apply()}>
              {busy ? t("loan.taking") : t("loan.apply")}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            {t("loan.apply")}
          </Button>
        )
      ) : null}

      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </Card>
  );
}


function AffiliatePanel() {
  const { t } = useT();
  const [st, setSt] = useState<Awaited<ReturnType<typeof getAffiliateStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [pin, setPin] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  function refresh() {
    void getAffiliateStatus()
      .then(setSt)
      .catch(() => setSt(null));
  }
  useEffect(() => {
    refresh();
  }, []);

  if (!st) return null;

  const link =
    typeof window !== "undefined" && st.code
      ? `${window.location.origin}/signup?ref=${encodeURIComponent(st.code)}`
      : st.code
        ? `/signup?ref=${st.code}`
        : "";

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      const res = await becomeAffiliate({ data: { acceptTerms: true as const } });
      setMsg(res.already ? t("dash.alreadyAffiliate") : "Welcome — your invite link is ready.");
      refresh();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite() {
    if (!link || !st) return;
    const title = st.og.referral.title;
    const text = `${st.og.referral.description}\n${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setMsg("Invite link copied.");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(link);
        setMsg("Invite link copied.");
      } catch {
        window.prompt("Copy your invite link:", link);
      }
    }
  }

  async function doWithdraw() {
    setBusy(true);
    setErr(null);
    try {
      const res = await withdrawAffiliateEarnings({ data: { pin } });
      setMsg(res.message);
      setWithdrawOpen(false);
      setPin("");
      refresh();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 space-y-3 p-4">
      <h2 className="font-display text-lg font-semibold">{t("dash.affiliateTitle")}</h2>
      {!st.programEnabled ? (
        <p className="text-sm text-warn">
          Referral program is paused by the platform. You cannot join or earn on new first deposits right now.
          {st.isAffiliate ? " You can still withdraw earnings you already have." : ""}
        </p>
      ) : null}

      {!st.isAffiliate ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Earn {(st.rates.commissionRate * 100).toFixed(0)}% of a friend&apos;s <strong>{t("dash.firstDepositOnly")}</strong>. After
            that, no further commission from them. Withdraw earnings from {st.rates.withdrawMinKwacha} kwacha (platform takes{" "}
            {(st.rates.withdrawFeeRate * 100).toFixed(0)}% on withdrawal).
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>{t("dash.affiliateTermsAccept")}</span>
          </label>
          <Button
            type="button"
            disabled={!accept || busy || !st.programEnabled}
            onClick={() => void join()}
          >
            {busy ? "…" : t("dash.becomeAffiliate")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            {t("dash.yourCode")} <span className="font-mono font-semibold">{st.code}</span>
          </p>
          <p className="break-all text-muted">{link}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void shareInvite()} disabled={!st.programEnabled}>
              {t("dash.shareInvite")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setMsg(t("dash.linkCopied"));
                } catch {
                  window.prompt("Copy:", link);
                }
              }}
            >
              {t("dash.copyReceiveLink")}
            </Button>
          </div>
          <p>
            Referral balance:{" "}
            <span className="font-semibold tabular-nums">{formatKwacha(st.wallet.balanceTambala)}</span>
            <span className="text-muted">
              {" "}
              · earned {formatKwacha(st.wallet.lifetimeEarnedTambala)} · withdrawn{" "}
              {formatKwacha(st.wallet.lifetimeWithdrawnTambala)}
            </span>
          </p>
          {withdrawOpen ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Fee {(st.rates.withdrawFeeRate * 100).toFixed(0)}% moves net to your main vault (min{" "}
                {st.rates.withdrawMinKwacha} kwacha).
              </p>
              <PinPad value={pin} onChange={setPin} disabled={busy} />
              <Button type="button" disabled={busy || pin.length !== 4} onClick={() => void doWithdraw()}>
                {t("dash.confirmWithdraw")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setWithdrawOpen(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={st.wallet.balanceTambala < st.rates.withdrawMinKwacha * 100}
              onClick={() => setWithdrawOpen(true)}
            >
              {t("dash.withdrawReferral")}
            </Button>
          )}
          {st.earnings.length ? (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted">
              {st.earnings.map((e) => (
                <li key={e.depositReference}>
                  +{formatKwacha(e.commissionTambala)} from first deposit {e.depositReference} ·{" "}
                  {new Date(e.createdAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </Card>
  );
}

function WithdrawLockPanel() {
  const { t } = useT();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getWithdrawLockStatus>> | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("30");
  const [unit, setUnit] = useState<"days" | "months" | "years">("days");
  const [pin, setPin] = useState("");
  const [confirmLong, setConfirmLong] = useState(false);
  const [acceptFee, setAcceptFee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [unlockCapPct, setUnlockCapPct] = useState(3);

  function refresh() {
    setStatusError(null);
    void getWithdrawLockStatus()
      .then((s) => {
        setStatus(s);
      })
      .catch((e) => {
        setStatus(null);
        setStatusError(errMessage(e));
      });
  }

  useEffect(() => {
    refresh();
    void getPlatformSupportPhone()
      .then((p) => setSupportPhone(p?.phone ?? null))
      .catch(() => null);
    void getPublicFeePolicy()
      .then((p) => setUnlockCapPct(p.earlyUnlockCapPercent || 3))
      .catch(() => undefined);
  }, []);

  const yearsApprox =
    unit === "years"
      ? Number(amount)
      : unit === "months"
        ? Number(amount) / 12
        : Number(amount) / 365;

  const locked = Boolean(status?.active);
  const formVisible = open && !locked;

  async function applyLock() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (!Number(amount) || Number(amount) < 1) {
        throw new Error("Enter a period of at least 1.");
      }
      if (pin.length !== 4) {
        throw new Error("Enter your 4-digit PIN.");
      }
      const res = await setWithdrawTimeLock({
        data: {
          amount: Number(amount),
          unit,
          pin,
          confirmLong: yearsApprox >= 2 ? confirmLong : true,
        },
      });
      setMsg(
        `Withdrawals locked until ${new Date(res.until).toLocaleString()}. Free changes until ${new Date(res.coolingEndsAt).toLocaleString()}.`,
      );
      setPin("");
      setOpen(false);
      refresh();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (pin.length !== 4) throw new Error("Enter your 4-digit PIN.");
      const res = await cancelWithdrawTimeLock({
        data: { pin, acceptFee: acceptFee || undefined },
      });
      setMsg(
        res.free
          ? t("dash.lockCancelledFree")
          : `Lock removed. Early-unlock fee ${formatKwacha(res.feeTambala)} taken from your vault.`,
      );
      setPin("");
      setAcceptFee(false);
      setOpen(false);
      refresh();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{t("lock.panelTitle")}</h2>
          <p className="text-sm text-muted">{t("dash.lockOptional")}</p>
        </div>
        {!locked ? (
          <button
            type="button"
            className={
              open
                ? "flex w-full items-center justify-center rounded-full border border-border bg-surface-2 py-3 text-sm font-medium text-fg"
                : "flex w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-medium text-primary-fg"
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setErr(null);
              setMsg(null);
              setOpen((v) => !v);
            }}
          >
            {open ? t("dash.hideLockForm") : "Set withdrawal lock"}
          </button>
        ) : (
          <p className="rounded-full bg-primary/15 px-3 py-2 text-center text-xs font-medium text-primary">
            {t("dash.lockActiveHint")}
          </p>
        )}
      </div>

      {statusError ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not load lock status: {statusError}. If you just deployed, wait for migration 0021 then refresh.
        </p>
      ) : null}

      {status?.adminWithdrawLocked ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium text-danger">{t("lock.platformLocked")}</p>
          <p className="mt-1 text-muted">
            {status.adminWithdrawLockReason || "Contact support for details. Deposits still work."}
          </p>
          {supportPhone ? (
            <a
              className="mt-2 inline-flex text-primary underline"
              href={`https://wa.me/${supportPhone.replace(/\D/g, "").replace(/^0/, "265")}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("dash.contactAdminWa")}
            </a>
          ) : null}
        </div>
      ) : null}

      {locked && status ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3 text-sm">
          <p>
            Locked until{" "}
            <span className="font-medium text-fg">
              {status.until ? new Date(status.until).toLocaleString() : "—"}
            </span>
          </p>
          {status.inCoolingOff ? (
            <p className="text-primary">
              Free cooling-off until{" "}
              {status.coolingEndsAt ? new Date(status.coolingEndsAt).toLocaleString() : "—"}. You can cancel free.
            </p>
          ) : (
            <p className="text-muted">
              Early unlock fee about {(status.earlyUnlockFeeRate * 100).toFixed(1)}% of balance (
              {formatKwacha(status.earlyUnlockFeeTambala)}). Extending is free. Shortening after cooling-off costs the
              same as unlocking early.
            </p>
          )}
          <div className="space-y-2">
            <Label>PIN to cancel / unlock</Label>
            <PinPad value={pin} onChange={setPin} disabled={busy} />
            {!status.inCoolingOff && status.earlyUnlockFeeTambala > 0 ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acceptFee}
                  onChange={(e) => setAcceptFee(e.target.checked)}
                />
                <span>
                  I accept the early-unlock fee of {formatKwacha(status.earlyUnlockFeeTambala)} taken from my vault
                  (system-calculated, not an informal admin fee).
                </span>
              </label>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={
                busy ||
                pin.length !== 4 ||
                (!status.inCoolingOff && status.earlyUnlockFeeTambala > 0 && !acceptFee)
              }
              onClick={() => void unlock()}
            >
              {busy ? t("dash.working") : status.inCoolingOff ? t("dash.cancelLockFree") : "Unlock early"}
            </Button>
          </div>
        </div>
      ) : null}

      {formVisible ? (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-sm text-muted">
            Max 5 years. After you confirm, a 48-hour cooling-off lets you cancel free. After that, early unlock costs a
            fee based on remaining time (maximum {unlockCapPct}% of balance — set by the platform).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="lock-period">{t("dash.period")}</Label>
              <Input
                id="lock-period"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lock-unit">{t("dash.unit")}</Label>
              <select
                id="lock-unit"
                className="flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value as "days" | "months" | "years")}
              >
                <option value="days">{t("dash.days")}</option>
                <option value="months">{t("dash.months")}</option>
                <option value="years">{t("dash.years")}</option>
              </select>
            </div>
          </div>
          {yearsApprox >= 2 ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmLong}
                onChange={(e) => setConfirmLong(e.target.checked)}
              />
              <span>
                I understand this is a long lock (about {yearsApprox.toFixed(1)} years) and I cannot withdraw until it
                ends without an early-unlock fee after cooling-off.
              </span>
            </label>
          ) : null}
          <div className="space-y-1.5">
            <Label>{t("lock.confirmPin")}</Label>
            <PinPad value={pin} onChange={setPin} disabled={busy} />
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={busy || pin.length !== 4 || !Number(amount) || (yearsApprox >= 2 && !confirmLong)}
            onClick={() => void applyLock()}
          >
            {busy ? t("common.saving") : "Lock withdrawals"}
          </Button>
          <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : null}

      {!locked && !open ? (
        <p className="text-xs text-muted">{t("lock.chooseDuration")}</p>
      ) : null}

      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </Card>
  );
}


function WithdrawModal({
    open,
  phone,
  phoneVerified,
  hasBank,
  bankLabel,
  bankHoldUntil,
  maxTambala,
  receivedTambala = 0,
  dailyRemainingTambala,
  holdMessage,
  revealed,
  onClose,
  onNeedPin,
  onSuccess,
}: {
  open: boolean;
  phone: string;
  phoneVerified: boolean;
  hasBank: boolean;
  bankLabel: string | null;
  bankHoldUntil: string | null;
  maxTambala: number;
  receivedTambala?: number;
  dailyRemainingTambala: number;
  holdMessage: string | null;
  revealed: boolean;
  onClose: () => void;
  onNeedPin: () => void;
  onSuccess: (title: string, body: string) => void;
}) {
  const { t } = useT();
  const [method, setMethod] = useState<"momo" | "bank">("momo");
  const [source, setSource] = useState<"main" | "received">("main");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState<{ momo: boolean; bank: boolean }>({ momo: true, bank: true });
  const [bankFeeAccepted, setBankFeeAccepted] = useState(false);
  const [bankFinalAck, setBankFinalAck] = useState(false);
  const kwacha = parseKwachaInput(amount);
  const sourceMax = source === "received" ? receivedTambala : maxTambala;
  // When balance is hidden, avoid client-side max of 0 — server enforces funds + daily limits.
  const effectiveMax = revealed
    ? Math.min(sourceMax, source === "received" ? receivedTambala : dailyRemainingTambala)
    : Number.POSITIVE_INFINITY;
  const onHold = Boolean(holdMessage);
  const bankOnHold =
    Boolean(bankHoldUntil) && new Date(bankHoldUntil!).getTime() > Date.now();
  const netBankReceive =
    method === "bank" && kwacha && kwacha > BANK_FLAT_FEE_KWACHA
      ? kwacha - BANK_FLAT_FEE_KWACHA
      : null;

  useEffect(() => {
    if (!open) return;
    void getPayoutMethodsPublic()
      .then((m) => {
        setAllowed(m);
        if (!m.momo && m.bank) setMethod("bank");
        if (m.momo && !m.bank) setMethod("momo");
      })
      .catch(() => setAllowed({ momo: true, bank: true }));
  }, [open]);

  useEffect(() => {
    setBankFeeAccepted(false);
    setBankFinalAck(false);
    setPin("");
    setError(null);
  }, [method, amount]);

  async function send() {
    if (!kwacha || onHold) return;
    if (method === "momo" && !phoneVerified) return;
    if (method === "bank" && (!hasBank || bankOnHold || !bankFeeAccepted || !bankFinalAck)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startWithdraw({
        data: {
          amountKwacha: kwacha,
          pin,
          idempotencyKey: crypto.randomUUID(),
          method,
          source,
          acceptBankFlatFee: method === "bank" ? true : undefined,
        },
      });
      const dest =
        method === "bank"
          ? `${bankLabel ?? "your bank"} (about ${formatKwacha((res.amountTambala / 100 - BANK_FLAT_FEE_KWACHA) * 100)} after bank flat fee)`
          : formatPhoneDisplay(res.phone);
      onSuccess(
        "Withdrawal sent",
        method === "bank"
          ? `${formatKwacha(res.amountTambala)} left your vault. The bank channel keeps a 700 MWK flat fee (not NEXA). You should receive about ${formatKwacha(res.amountTambala - BANK_FLAT_FEE_KWACHA * 100)}.`
          : `${formatKwacha(res.amountTambala)} is on the way to ${dest}.`,
      );
      setAmount("");
      setPin("");
      setBankFeeAccepted(false);
      setBankFinalAck(false);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const showForm =
    (method === "momo" && phoneVerified) || (method === "bank" && hasBank && !bankOnHold);

  return (
    <Modal open={open} title={t("dash.withdraw")} onClose={onClose}>
      {onHold ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{holdMessage}</p>
          <Button className="w-full" variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {!revealed ? (
            <p className="text-xs text-muted">{t("dash.withdrawNoReveal")}</p>
          ) : null}
          {receivedTambala > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">{t("dash.withdrawFrom")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={
                    source === "main"
                      ? "rounded-xl border border-primary bg-primary/15 px-3 py-2 text-sm font-medium"
                      : "rounded-xl border border-border px-3 py-2 text-sm"
                  }
                  onClick={() => setSource("main")}
                >
                  {t("dash.mainVault")}
                </button>
                <button
                  type="button"
                  className={
                    source === "received"
                      ? "rounded-xl border border-primary bg-primary/15 px-3 py-2 text-sm font-medium"
                      : "rounded-xl border border-border px-3 py-2 text-sm"
                  }
                  onClick={() => setSource("received")}
                >
                  {t("dash.receivedBag")}
                </button>
              </div>
              <p className="text-xs text-muted">
                {source === "received"
                  ? `Received available: ${formatKwacha(receivedTambala)}. Bank takes 700 MWK from this amount (not NEXA). MoMo: full amount.`
                  : `Main vault available: ${formatKwacha(maxTambala)}. Bank: same 700 MWK flat from your request.`}
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
            <button
              type="button"
              disabled={!allowed.momo}
              className={
                method === "momo"
                  ? "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg"
                  : "rounded-lg px-3 py-2 text-sm text-muted disabled:opacity-40"
              }
              onClick={() => allowed.momo && setMethod("momo")}
            >
              {t("dash.mobileMoney")}
            </button>
            <button
              type="button"
              disabled={!allowed.bank}
              className={
                method === "bank"
                  ? "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg"
                  : "rounded-lg px-3 py-2 text-sm text-muted disabled:opacity-40"
              }
              onClick={() => allowed.bank && setMethod("bank")}
            >
              {t("dash.bank")}
            </button>
          </div>
          {!allowed.momo && !allowed.bank ? (
            <p className="text-sm text-danger">{t("lock.paused")}</p>
          ) : null}
          {!allowed.momo ? (
            <p className="text-xs text-muted">{t("lock.momoOff")}</p>
          ) : null}
          {!allowed.bank ? (
            <p className="text-xs text-muted">{t("lock.bankOff")}</p>
          ) : null}

          {method === "momo" && !phoneVerified ? (
            <p className="text-sm text-muted">
              Mobile withdrawals unlock after you deposit once from{" "}
              <span className="text-fg">{formatPhoneDisplay(phone)}</span>.
            </p>
          ) : null}

          {method === "bank" && !hasBank ? (
            <p className="text-sm text-muted">{t("dash.bankHold72")}</p>
          ) : null}

          {method === "bank" && hasBank && bankOnHold ? (
            <p className="text-sm text-muted">
              Bank withdrawals are on hold until {new Date(bankHoldUntil!).toLocaleString()}.
            </p>
          ) : null}

          {showForm ? (
            <>
              <p className="text-sm text-muted">
                {method === "momo"
                  ? `Funds leave to ${formatPhoneDisplay(phone)}.`
                  : `Funds leave to ${bankLabel}.`}
                {revealed && Number.isFinite(effectiveMax)
                  ? ` Available now: ${formatKwacha(effectiveMax)}.`
                  : " Enter an amount and your PIN — if it is more than you can take, the request is declined."}
              </p>

              {method === "bank" ? (
                <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium text-fg">{t("tx.bankFlatFee")}</p>
                  <p className="text-muted">{t("dash.chargedByThe")}<span className="text-fg">{t("dash.bankRailName")}</span>, not NEXA-SAVER. The 700 MWK
                    is taken from the balance you withdraw. Example: request <span className="text-fg">10,000</span> →
                    about <span className="text-fg">9,300</span>{t("dash.momoNoFlat")}</p>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={bankFeeAccepted}
                      onChange={(e) => setBankFeeAccepted(e.target.checked)}
                    />
                    <span>{t("dash.bank700Accept")}</span>
                  </label>
                </div>
              ) : null}

              {method === "momo" || bankFeeAccepted ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-amt">{t("common.amountKwacha")}</Label>
                    <Input
                      id="w-amt"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <p className="text-xs text-muted">
                      Minimum{" "}
                      {method === "bank" ? MIN_BANK_WITHDRAW_KWACHA : MIN_WITHDRAW_KWACHA} kwacha
                      {method === "bank" ? " (includes room for the 700 bank flat fee)" : ""}
                    </p>
                    {method === "bank" && netBankReceive != null ? (
                      <p className="text-sm text-fg">
                        {t("dash.youRequest")} <span className="font-semibold">{kwacha}</span> · bank receives about{" "}
                        <span className="font-semibold">{netBankReceive}</span>{t("dash.kwachaAfter700")}</p>
                    ) : null}
                  </div>

                  {method === "bank" && kwacha && kwacha >= MIN_BANK_WITHDRAW_KWACHA ? (
                    <label className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={bankFinalAck}
                        onChange={(e) => setBankFinalAck(e.target.checked)}
                      />
                      <span>{t("dash.finalCheckAccept")}<strong>700 MWK</strong> is deducted from this request by the
                        bank channel so the account receives about{" "}
                        <strong>{netBankReceive ?? "—"} kwacha</strong>. This is not a NEXA fee.
                      </span>
                    </label>
                  ) : null}

                  {(method === "momo" || bankFinalAck) && (
                    <>
                      <div>
                        <Label>{t("lock.confirmPin")}</Label>
                        <div className="mt-3">
                          <PinPad value={pin} onChange={setPin} disabled={busy} error={Boolean(error)} />
                        </div>
                      </div>
                      {error ? <p className="text-sm text-danger">{error}</p> : null}
                      <Button
                        className="w-full"
                        loading={busy}
                        disabled={
                          !kwacha ||
                          pin.length !== 4 ||
                          busy ||
                          (method === "bank" && (!bankFeeAccepted || !bankFinalAck))
                        }
                        onClick={() => void send()}
                      >
                        {busy
                          ? t("dash.sendingWithdrawal")
                          : method === "bank"
                            ? t("dash.withdrawToBank")
                            : "Withdraw to mobile"}
                      </Button>
                    </>
                  )}
                </>
              ) : null}
            </>
          ) : (
            <Button className="w-full" variant="secondary" onClick={onClose}>
              {t("common.close")}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

