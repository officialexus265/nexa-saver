import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import { getReceiveLinkPublic, startPublicReceivePayment } from "@/lib/nexa/fns";
import { parseKwachaInput } from "@/lib/nexa/money";

export const Route = createFileRoute("/pay/$token")({
  component: PublicPayPage,
});

function PublicPayPage() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<{
    label: string | null;
    ownerName: string;
    active: boolean;
    defaultAmountKwacha: number | null;
  } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getReceiveLinkPublic({ data: { token } })
      .then((r) => {
        if (cancelled) return;
        setInfo(r);
        if (r.defaultAmountKwacha) setAmount(String(r.defaultAmountKwacha));
      })
      .catch((e) => {
        if (!cancelled) setLoadErr(errMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function pay() {
    setBusy(true);
    setErr(null);
    try {
      const kwacha = parseKwachaInput(amount);
      if (!kwacha || kwacha < 100) throw new Error("Minimum is 100 kwacha.");
      const res = await startPublicReceivePayment({
        data: {
          token,
          amountKwacha: kwacha,
          phone,
          origin: window.location.origin,
          idempotencyKey: `pub-${token}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      throw new Error("Could not start payment.");
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) {
    return (
      <div className="nexa-shell grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="font-display text-xl font-semibold">Link unavailable</h1>
          <p className="text-sm text-muted">{loadErr}</p>
          <Link to="/" className="text-sm text-primary underline">
            Home
          </Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="nexa-shell grid min-h-dvh place-items-center p-6">
        <p className="text-sm text-muted">Loading payment link…</p>
      </div>
    );
  }

  if (!info.active) {
    return (
      <div className="nexa-shell grid min-h-dvh place-items-center p-6 text-center">
        <p className="text-sm text-muted">This receive link is turned off.</p>
      </div>
    );
  }

  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Pay to</p>
          <h1 className="font-display text-2xl font-semibold">{info.ownerName}</h1>
          {info.label ? <p className="text-sm text-muted">{info.label}</p> : null}
        </div>
        <p className="text-sm text-muted">
          Continue to PayChangu to complete payment. After paying, take a screenshot of the success screen as proof.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="pay-amt">Amount (kwacha)</Label>
          <Input
            id="pay-amt"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="e.g. 500"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-phone">Your mobile number (MoMo)</Label>
          <Input
            id="pay-phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09…"
          />
        </div>
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Button
          type="button"
          className="w-full"
          loading={busy}
          disabled={busy || !amount || phone.length < 8}
          onClick={() => void pay()}
        >
          {busy ? "Opening PayChangu…" : "Continue to PayChangu"}
        </Button>
      </div>
    </div>
  );
}
