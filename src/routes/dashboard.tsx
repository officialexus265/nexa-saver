import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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
import { DEPOSIT_FEE_RATE, MIN_DEPOSIT_KWACHA, MIN_WITHDRAW_KWACHA, BANK_FLAT_FEE_KWACHA, MIN_BANK_WITHDRAW_KWACHA } from "@/lib/nexa/constants";
import { errMessage } from "@/lib/nexa/errors";
import {
  confirmDemoDeposit,
  getBalance,
  listTransactions,
  startDeposit,
  startWithdraw,
  getPayoutMethodsPublic,
  getWithdrawLockStatus,
  setWithdrawTimeLock,
  cancelWithdrawTimeLock,
  extendWithdrawTimeLock,
  getPlatformSupportPhone,
  getPublicFeePolicy,
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
}) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [txs, setTxs] = useState<PublicTx[] | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [success, setSuccess] = useState<{ title: string; body: string } | null>(null);
  // Hidden until the user explicitly reveals with PIN (never auto-show on load).
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [depositFeeRate, setDepositFeeRate] = useState(DEPOSIT_FEE_RATE);

  const [selectedTx, setSelectedTx] = useState<PublicTx | null>(null);

  const revealed = Boolean(balanceVisible && balance && !balance.locked);

  const reloadMoney = useCallback(async () => {
    const [b, t] = await Promise.all([getBalance(), listTransactions().catch(() => [] as PublicTx[])]);
    setBalance(b);
    setTxs(t);
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
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="font-display text-3xl font-semibold">{profile.firstName}</h1>
      </div>

      {!emailVerified ? (
        <EmailVerifyBanner />
      ) : null}

      {emailVerified && !profile.phoneVerified ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <p className="font-medium text-fg">Verify your withdrawal number</p>
          <p className="mt-1 text-muted">
            To unlock withdrawals, deposit once from your registered number{" "}
            <span className="text-fg">{formatPhoneDisplay(profile.phone)}</span>. That proves the line is active and yours.
          </p>
          <Button className="mt-3" onClick={() => setDepositOpen(true)}>
            Deposit to verify
          </Button>
        </div>
      ) : null}

      <Card className="relative overflow-hidden p-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Available to withdraw</p>
        <div className="mt-4 flex items-end justify-between gap-3">
          {revealed ? (
            <p className="balance-reveal font-display text-4xl font-semibold tabular-nums">
              {formatKwacha(balance.balanceTambala)}
            </p>
          ) : (
            <p className="font-display text-4xl font-semibold tracking-widest text-faint">••••••</p>
          )}
          <Button variant="secondary" size="icon" onClick={() => (revealed ? setBalanceVisible(false) : setCheckOpen(true))} aria-label="Toggle balance">
            <span className="relative block size-5">
              <Eye className={`absolute inset-0 size-5 transition-[opacity,transform,filter] duration-300 ${revealed ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100"}`} />
              <EyeOff className={`absolute inset-0 size-5 transition-[opacity,transform,filter] duration-300 ${revealed ? "scale-100 opacity-100" : "scale-[0.25] opacity-0 blur-[4px]"}`} />
            </span>
          </Button>
        </div>
        {!revealed ? (
          <Button className="mt-5 w-full" onClick={() => setCheckOpen(true)}>
            Check balance
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

      <div className="grid grid-cols-2 gap-3">
        <Button className="h-14" onClick={() => setDepositOpen(true)}>
          <ArrowDownToLine className="size-4" /> Deposit
        </Button>
        <Button variant="secondary" className="h-14" onClick={() => setWithdrawOpen(true)}>
          <ArrowUpFromLine className="size-4" /> Withdraw
        </Button>
      </div>

      <section>
        <WithdrawLockPanel />

        <h2 className="mb-3 font-display text-lg font-semibold">Activity</h2>
        {txs === null ? (
          <p className="text-sm text-muted">Loading activity…</p>
        ) : !txs.length ? (
          <p className="text-sm text-muted">No movements yet. Make a deposit to open the vault.</p>
        ) : (
          <ul className="space-y-2">
            {txs.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left transition hover:border-primary/40 hover:bg-surface-2"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">{tx.kind}</p>
                    <p className="text-xs text-muted">
                      {tx.status} · {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    {tx.kind === "deposit" ? "+" : "−"}
                    {formatKwacha(tx.kind === "deposit" ? tx.creditedTambala : tx.grossTambala, { compact: true })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActivityDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />

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
        maxTambala={balance?.balanceTambala ?? 0}
        dailyRemainingTambala={balance?.dailyRemainingTambala ?? balance?.balanceTambala ?? 0}
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




function WithdrawHoldCountdown({ until }: { until: string | null }) {
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
      Withdrawable in <span className="font-semibold tabular-nums">{label}</span>
      <span className="text-muted"> · new accounts and security changes stay on a short hold</span>
    </p>
  );
}

function ActivityDetailModal({ tx, onClose }: { tx: PublicTx | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!tx) return null;

  const when = new Date(tx.createdAt);
  const feeTambala = tx.kind === "deposit" ? Math.max(0, tx.grossTambala - tx.creditedTambala) : 0;

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(tx.reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy reference:", tx.reference);
    }
  }

  return (
    <Modal open={Boolean(tx)} title={tx.kind === "deposit" ? "Deposit details" : "Withdrawal details"} onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Status</dt>
          <dd className="font-medium capitalize">{tx.status}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Date</dt>
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
          <dt className="text-muted">Time</dt>
          <dd>{when.toLocaleTimeString()}</dd>
        </div>
        {tx.kind === "deposit" ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Paid (gross)</dt>
              <dd className="tabular-nums">{formatKwacha(tx.grossTambala)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Fee (6%)</dt>
              <dd className="tabular-nums">{formatKwacha(feeTambala)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Credited to vault</dt>
              <dd className="tabular-nums font-medium text-primary">{formatKwacha(tx.creditedTambala)}</dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Amount</dt>
            <dd className="tabular-nums font-medium">{formatKwacha(tx.grossTambala)}</dd>
          </div>
        )}
        {tx.phone ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Mobile number</dt>
            <dd>{formatPhoneDisplay(tx.phone)}</dd>
          </div>
        ) : null}
        <div className="space-y-1.5 border-t border-border pt-3">
          <dt className="text-muted">Reference</dt>
          <dd className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-2 px-3 py-2 text-xs">{tx.reference}</code>
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => void copyRef()}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </dd>
        </div>
        {tx.note ? (
          <div className="space-y-1 border-t border-border pt-3">
            <dt className="text-muted">Note</dt>
            <dd className="text-xs text-muted">{tx.note}</dd>
          </div>
        ) : null}
      </dl>
      {tx.status === "pending" && tx.kind === "deposit" ? (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted">
          Still pending. If money left your mobile wallet, contact support with this reference.
        </p>
      ) : null}
      <Button type="button" className="mt-5 w-full" variant="secondary" onClick={onClose}>
        Close
      </Button>
    </Modal>
  );
}

function EmailVerifyBanner() {
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
          ? "Your email is already verified. Refresh the page."
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
        <p className="font-medium text-fg">Email not verified</p>
        <p className="mt-1 text-muted">
          Confirm your email before depositing or withdrawing. Tap here to open Profile, or resend the link below.
        </p>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" loading={busy} onClick={() => void resend()}>
          {busy ? "Sending…" : "Resend verification email"}
        </Button>
        <Link to="/profile" className="text-sm text-primary underline-offset-2 hover:underline">
          Open Profile
        </Link>
      </div>
      {msg ? <p className="mt-2 text-xs text-primary">{msg}</p> : null}
      {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}
    </div>
  );
}

function CheckBalanceModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
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
    <Modal open={open} title="Check balance" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">
        Enter the 4-digit withdraw PIN to reveal your available kwacha. You can use the pad or your keyboard.
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
{busy ? <LoadingStatus label="Checking balance…" /> : null}
    </Modal>
  );
}

function DepositModal({
  depositFeeRate = DEPOSIT_FEE_RATE,
  open,
  demo,
  onClose,
  onSuccess,
}: {
  depositFeeRate?: number;
  open: boolean;
  demo: boolean;
  onClose: () => void;
  onSuccess: (title: string, body: string) => void;
}) {
  const [amount, setAmount] = useState("100");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<"form" | "confirm" | "pay">("form");
  const [ref, setRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kwacha = parseKwachaInput(amount);
  const split = kwacha ? splitDeposit(kwachaToTambala(kwacha), { depositFeeRate, platformProfitRate: depositFeeRate / 2, payoutReserveRate: depositFeeRate / 2 }) : null;

  function reset() {
    setStage("form");
    setRef(null);
    setError(null);
    onClose();
  }

  async function start() {
    if (!kwacha) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startDeposit({
        data: {
          amountKwacha: kwacha,
          phone,
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
        "Deposit received",
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
    <Modal open={open} title="Deposit" onClose={reset}>
      {stage === "form" ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dep-amt">Amount (kwacha)</Label>
            <Input id="dep-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted">Minimum {MIN_DEPOSIT_KWACHA} kwacha</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-phone">Paying number</Label>
            <Input id="dep-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Any Airtel or TNM number" />
            <p className="text-xs text-muted">
              To unlock withdrawals, deposit at least once from your registered number (the one on your profile).
            </p>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" disabled={!kwacha || !phone} onClick={() => setStage("confirm")}>
            Continue
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
              Back
            </Button>
            <Button className="flex-1" loading={busy} disabled={busy} onClick={() => void start()}>
              {busy ? "Starting deposit…" : "I understand"}
            </Button>
          </div>
        </div>
      ) : null}
      {stage === "pay" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {demo
              ? "Demo mode: no real money moves. Approve to credit the vault."
              : "Approve the PayChangu prompt on your phone."}
          </p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" loading={busy} disabled={busy} onClick={() => void approve()}>
            {busy ? "Crediting vault…" : "I've approved the payment"}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}


function WithdrawLockPanel() {
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
          ? "Lock cancelled free during cooling-off."
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">Withdrawal lock</h2>
          <p className="text-sm text-muted">
            Optional commitment: deposit anytime, no withdrawals until the date you set.
          </p>
        </div>
        {!locked ? (
          <button
            type="button"
            className={
              open
                ? "shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
                : "shrink-0 rounded-full border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-fg"
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setErr(null);
              setMsg(null);
              setOpen((v) => !v);
            }}
          >
            {open ? "Hide lock form" : "Set lock"}
          </button>
        ) : (
          <span className="shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary">
            Lock active
          </span>
        )}
      </div>

      {statusError ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not load lock status: {statusError}. If you just deployed, wait for migration 0021 then refresh.
        </p>
      ) : null}

      {status?.adminWithdrawLocked ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium text-danger">Withdrawals locked by the platform</p>
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
              Contact admin on WhatsApp
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
              {busy ? "Working…" : status.inCoolingOff ? "Cancel lock free" : "Unlock early"}
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
              <Label htmlFor="lock-period">Period</Label>
              <Input
                id="lock-period"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lock-unit">Unit</Label>
              <select
                id="lock-unit"
                className="flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value as "days" | "months" | "years")}
              >
                <option value="days">Days</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
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
            <Label>Confirm with PIN</Label>
            <PinPad value={pin} onChange={setPin} disabled={busy} />
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={busy || pin.length !== 4 || !Number(amount) || (yearsApprox >= 2 && !confirmLong)}
            onClick={() => void applyLock()}
          >
            {busy ? "Saving…" : "Lock withdrawals"}
          </Button>
          <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {!locked && !open ? (
        <p className="text-xs text-muted">Tap &quot;Set lock&quot; to choose how long withdrawals stay locked.</p>
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
  dailyRemainingTambala: number;
  holdMessage: string | null;
  revealed: boolean;
  onClose: () => void;
  onNeedPin: () => void;
  onSuccess: (title: string, body: string) => void;
}) {
  const [method, setMethod] = useState<"momo" | "bank">("momo");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState<{ momo: boolean; bank: boolean }>({ momo: true, bank: true });
  const [bankFeeAccepted, setBankFeeAccepted] = useState(false);
  const [bankFinalAck, setBankFinalAck] = useState(false);
  const kwacha = parseKwachaInput(amount);
  const effectiveMax = Math.min(maxTambala, dailyRemainingTambala);
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
    <Modal open={open} title="Withdraw" onClose={onClose}>
      {!revealed ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Reveal your balance with your PIN before withdrawing.</p>
          <Button className="w-full" onClick={onNeedPin}>
            Check balance first
          </Button>
        </div>
      ) : onHold ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{holdMessage}</p>
          <Button className="w-full" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
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
              Mobile money
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
              Bank
            </button>
          </div>
          {!allowed.momo && !allowed.bank ? (
            <p className="text-sm text-danger">Withdrawals are paused by the platform.</p>
          ) : null}
          {!allowed.momo ? (
            <p className="text-xs text-muted">Mobile money withdrawals are off right now.</p>
          ) : null}
          {!allowed.bank ? (
            <p className="text-xs text-muted">Bank withdrawals are off right now.</p>
          ) : null}

          {method === "momo" && !phoneVerified ? (
            <p className="text-sm text-muted">
              Mobile withdrawals unlock after you deposit once from{" "}
              <span className="text-fg">{formatPhoneDisplay(phone)}</span>.
            </p>
          ) : null}

          {method === "bank" && !hasBank ? (
            <p className="text-sm text-muted">
              Add bank payout details under Profile first. After saving, bank withdrawals stay on hold for 72
              hours.
            </p>
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
                  ? `Funds leave to ${formatPhoneDisplay(phone)}. Available now: ${formatKwacha(effectiveMax)}.`
                  : `Funds leave to ${bankLabel}. Available now: ${formatKwacha(effectiveMax)}.`}
              </p>

              {method === "bank" ? (
                <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium text-fg">Bank channel flat fee: 700 MWK</p>
                  <p className="text-muted">
                    This is charged by the <span className="text-fg">payment / bank rail (PayChangu)</span>, not by
                    NEXA-SAVER. If you request 1,000 kwacha, about <span className="text-fg">930 kwacha</span> reaches
                    the bank account. Your vault is debited the full amount you request.
                  </p>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={bankFeeAccepted}
                      onChange={(e) => setBankFeeAccepted(e.target.checked)}
                    />
                    <span>
                      I understand 700 MWK will be taken from my requested amount by the bank channel, not by
                      NEXA, and I want to continue.
                    </span>
                  </label>
                </div>
              ) : null}

              {method === "momo" || bankFeeAccepted ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-amt">Amount (kwacha)</Label>
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
                        You request <span className="font-semibold">{kwacha}</span> · bank receives about{" "}
                        <span className="font-semibold">{netBankReceive}</span> kwacha after 700 flat
                      </p>
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
                      <span>
                        Final check: I accept that <strong>700 MWK</strong> is deducted from this request by the
                        bank channel so the account receives about{" "}
                        <strong>{netBankReceive ?? "—"} kwacha</strong>. This is not a NEXA fee.
                      </span>
                    </label>
                  ) : null}

                  {(method === "momo" || bankFinalAck) && (
                    <>
                      <div>
                        <Label>Confirm with PIN</Label>
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
                          ? "Sending withdrawal…"
                          : method === "bank"
                            ? "Withdraw to bank"
                            : "Withdraw to mobile"}
                      </Button>
                    </>
                  )}
                </>
              ) : null}
            </>
          ) : (
            <Button className="w-full" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}


