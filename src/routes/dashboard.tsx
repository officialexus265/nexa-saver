import { useCallback, useState } from "react";
import { Eye, EyeOff, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Modal } from "@/components/modal";
import { PinPad } from "@/components/pin-pad";
import { SessionGate } from "@/components/session-gate";
import { SuccessBurst } from "@/components/success-burst";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPOSIT_FEE_RATE, MIN_DEPOSIT_KWACHA, MIN_WITHDRAW_KWACHA } from "@/lib/nexa/constants";
import { errMessage } from "@/lib/nexa/errors";
import {
  confirmDemoDeposit,
  getBalance,
  listTransactions,
  startDeposit,
  startWithdraw,
  verifyPin,
} from "@/lib/nexa/fns";
import { formatKwacha, kwachaToTambala, parseKwachaInput, splitDeposit } from "@/lib/nexa/money";
import { formatPhoneDisplay } from "@/lib/nexa/phone";
import type { BalanceResponse, PublicTx } from "@/lib/nexa/types";

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
}: {
  profile: { firstName: string; phone: string };
  demoPayments: boolean;
}) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [txs, setTxs] = useState<PublicTx[] | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [success, setSuccess] = useState<{ title: string; body: string } | null>(null);

  const revealed = balance && !balance.locked;

  const reloadMoney = useCallback(async () => {
    const [b, t] = await Promise.all([getBalance(), listTransactions().catch(() => [] as PublicTx[])]);
    setBalance(b);
    if (!b.locked) setTxs(t);
  }, []);

  return (
    <div className="space-y-5">
      <div className="stagger-in">
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="font-display text-3xl font-semibold">{profile.firstName}</h1>
      </div>

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
          <Button variant="secondary" size="icon" onClick={() => (revealed ? setBalance({ ok: true, locked: true }) : setCheckOpen(true))} aria-label="Toggle balance">
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
        ) : (
          <p className="mt-3 text-sm text-muted">
            Lifetime in {formatKwacha(balance.lifetimeDepositedTambala)} · out {formatKwacha(balance.lifetimeWithdrawnTambala)}
          </p>
        )}
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
        <h2 className="mb-3 font-display text-lg font-semibold">Activity</h2>
        {!revealed ? (
          <p className="text-sm text-muted">Confirm your PIN to see the ledger.</p>
        ) : !txs?.length ? (
          <p className="text-sm text-muted">No movements yet. Make a deposit to open the vault.</p>
        ) : (
          <ul className="space-y-2">
            {txs.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">{tx.kind}</p>
                  <p className="text-xs text-muted">{tx.status} · {new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-sm tabular-nums">
                  {tx.kind === "deposit" ? "+" : "−"}
                  {formatKwacha(tx.kind === "deposit" ? tx.creditedTambala : tx.grossTambala, { compact: true })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CheckBalanceModal
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        onDone={async () => {
          setCheckOpen(false);
          await reloadMoney();
        }}
      />
      <DepositModal
        open={depositOpen}
        demo={demoPayments}
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
        maxTambala={revealed ? balance.balanceTambala : 0}
        revealed={Boolean(revealed)}
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

function CheckBalanceModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await verifyPin({ data: { pin } });
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
      <p className="mb-4 text-sm text-muted">Enter the 4-digit withdraw PIN to reveal your available kwacha.</p>
      <PinPad value={pin} onChange={setPin} disabled={busy} error={Boolean(error)} />
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <Button className="mt-4 w-full" disabled={pin.length !== 4 || busy} onClick={() => void confirm()}>
        Reveal balance
      </Button>
    </Modal>
  );
}

function DepositModal({
  open,
  demo,
  onClose,
  onSuccess,
}: {
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
  const split = kwacha ? splitDeposit(kwachaToTambala(kwacha)) : null;

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
        data: { amountKwacha: kwacha, phone, origin: window.location.origin },
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
              The system will keep {(DEPOSIT_FEE_RATE * 100).toFixed(0)}% of whatever amount you are depositing as a
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
            <Button className="flex-1" disabled={busy} onClick={() => void start()}>
              {busy ? "Starting…" : "I understand"}
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
          <Button className="w-full" disabled={busy} onClick={() => void approve()}>
            {busy ? "Confirming…" : "I've approved the payment"}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}

function WithdrawModal({
  open,
  phone,
  maxTambala,
  revealed,
  onClose,
  onNeedPin,
  onSuccess,
}: {
  open: boolean;
  phone: string;
  maxTambala: number;
  revealed: boolean;
  onClose: () => void;
  onNeedPin: () => void;
  onSuccess: (title: string, body: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kwacha = parseKwachaInput(amount);

  async function send() {
    if (!kwacha) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startWithdraw({ data: { amountKwacha: kwacha, pin } });
      onSuccess(
        "Withdrawal sent",
        `${formatKwacha(res.amountTambala)} is on the way to ${formatPhoneDisplay(res.phone)}. This confirmation stays for three seconds.`,
      );
      setAmount("");
      setPin("");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Withdraw" onClose={onClose}>
      {!revealed ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Reveal your balance with your PIN before withdrawing.</p>
          <Button className="w-full" onClick={onNeedPin}>
            Check balance first
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Funds only leave to your registered number {formatPhoneDisplay(phone)}. You can send at most{" "}
            {formatKwacha(maxTambala)}.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="w-amt">Amount (kwacha)</Label>
            <Input id="w-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted">Minimum {MIN_WITHDRAW_KWACHA} kwacha</p>
          </div>
          <div>
            <Label>Confirm with PIN</Label>
            <div className="mt-3">
              <PinPad value={pin} onChange={setPin} disabled={busy} error={Boolean(error)} />
            </div>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" disabled={!kwacha || pin.length !== 4 || busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Withdraw"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
