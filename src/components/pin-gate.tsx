import { useEffect, useState } from "react";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { LoadingStatus } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import { getSecurityQuestion, resetPinWithQuestion, verifyPin } from "@/lib/nexa/fns";

export function PinGate({
  title = "Confirm your PIN",
  subtitle = "Five minutes of quiet and NEXA locks the vault.",
  onUnlocked,
}: {
  title?: string;
  subtitle?: string;
  onUnlocked: (balanceTambala?: number) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    if (pin.length !== 4 || forgot) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    verifyPin({ data: { pin } })
      .then((res) => {
        if (!cancelled) onUnlocked(res.balanceTambala);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errMessage(err, "Incorrect PIN"));
        setPin("");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pin, forgot, onUnlocked]);

  async function loadQuestion() {
    setForgot(true);
    setError(null);
    try {
      const q = await getSecurityQuestion();
      setQuestion(q.question);
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function resetPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPinWithQuestion({ data: { answer, newPin } });
      onUnlocked();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-bg/92 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 stagger-in">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Locked</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{forgot ? "Reset PIN" : title}</h2>
        <p className="mt-2 text-sm text-muted">{forgot ? question || "Answer your security question." : subtitle}</p>

        {forgot ? (
          <form onSubmit={resetPin} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sec-answer">Your answer</Label>
              <Input id="sec-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pin">New 4-digit PIN</Label>
              <Input
                id="new-pin"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || newPin.length !== 4}>
              {busy ? "Saving…" : "Save new PIN"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setForgot(false)}>
              Back to PIN
            </Button>
          </form>
        ) : (
          <div className="mt-6">
            <div className={busy ? "pointer-events-none opacity-50" : undefined}>
              <PinPad value={pin} onChange={setPin} disabled={busy} error={Boolean(error)} />
            </div>
            {error ? <p className="mt-3 text-center text-sm text-danger">{error}</p> : null}
            {busy ? <LoadingStatus label="Unlocking vault…" /> : null}
            {!busy ? (
              <button type="button" onClick={loadQuestion} className="mt-4 w-full text-center text-sm text-muted">
                Forgot PIN? Use security question
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
