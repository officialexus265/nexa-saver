import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";
import { errMessage } from "@/lib/nexa/errors";
import {
  completeSecuritySurvey,
  getSecuritySurveyState,
  type SecuritySurveyState,
} from "@/lib/nexa/fns";
import { formatPhoneDisplay } from "@/lib/nexa/phone";

type Step = "intro" | "email" | "phone" | "bank" | "security" | "done";

/**
 * Full-screen mandatory survey. Renders nothing when not required.
 * Blocks interaction with the rest of the dashboard while open.
 */
export function SecuritySurveyGate() {
  const [state, setState] = useState<SecuritySurveyState | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [emailIsMine, setEmailIsMine] = useState(true);
  const [phoneIsMine, setPhoneIsMine] = useState(true);
  const [bankIsMine, setBankIsMine] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    void getSecuritySurveyState()
      .then(setState)
      .catch(() => setState({ required: false }));
  }, []);

  useEffect(() => {
    if (!thanks) return;
    const t = window.setTimeout(() => setThanks(false), 3000);
    return () => window.clearTimeout(t);
  }, [thanks]);

  if (!state?.required && !thanks) return null;

  if (thanks) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-bg/90 p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <h2 className="font-display text-2xl font-semibold">Thank you</h2>
          <p className="mt-2 text-sm text-muted">
            Your security check is complete. Your vault is safer when contact details stay under your control.
          </p>
          <Button type="button" className="mt-5 w-full" variant="secondary" onClick={() => setThanks(false)}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (!state?.required) return null;

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await completeSecuritySurvey({
        data: {
          campaignId: state!.campaignId,
          emailIsMine,
          phoneIsMine,
          bankIsMine: state!.hasBank ? bankIsMine : true,
          securityAnswer: answer,
          newPassword: emailIsMine ? undefined : newPassword,
          newPin: phoneIsMine ? undefined : newPin,
        },
      });
      if (res.mustReLogin) {
        window.location.href = "/?reset=1";
        return;
      }
      setState({ required: false });
      setThanks(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/90 p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6">
        {step === "intro" ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Security survey</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Quick account check</h2>
            <p className="mt-3 text-sm text-muted">
              We are running a short security survey so you can confirm that nobody has changed your email,
              withdrawal number, or other details without your knowledge. It only takes about two minutes and
              cannot be skipped until you finish.
            </p>
            <Button type="button" className="mt-6 w-full" onClick={() => setStep("email")}>
              Take survey
            </Button>
          </>
        ) : null}

        {step === "email" ? (
          <>
            <h2 className="font-display text-xl font-semibold">Is this your email?</h2>
            <p className="mt-3 break-all rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium">{state.email}</p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                variant={emailIsMine ? "default" : "secondary"}
                onClick={() => {
                  setEmailIsMine(true);
                  setStep("phone");
                }}
              >
                Yes, this is mine
              </Button>
              <Button
                type="button"
                variant={!emailIsMine ? "default" : "secondary"}
                onClick={() => setEmailIsMine(false)}
              >
                No — restore my original email
              </Button>
            </div>
            {!emailIsMine ? (
              <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm text-muted">
                  We will restore your first registered email (
                  <span className="font-medium text-fg">{state.anchorEmail}</span>
                  ), set a new password, and sign you out of all devices.
                </p>
                <PasswordField
                  id="survey-pw"
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  className="w-full"
                  disabled={newPassword.length < 8}
                  onClick={() => setStep("phone")}
                >
                  Continue
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {step === "phone" ? (
          <>
            <h2 className="font-display text-xl font-semibold">Is this your withdrawal number?</h2>
            <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium">
              {formatPhoneDisplay(state.phone)}
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                variant={phoneIsMine ? "default" : "secondary"}
                onClick={() => {
                  setPhoneIsMine(true);
                  setStep(state.hasBank ? "bank" : "security");
                }}
              >
                Yes, this is mine
              </Button>
              <Button
                type="button"
                variant={!phoneIsMine ? "default" : "secondary"}
                onClick={() => setPhoneIsMine(false)}
              >
                No — restore my original number
              </Button>
            </div>
            {!phoneIsMine ? (
              <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm text-muted">
                  We will restore{" "}
                  <span className="font-medium text-fg">{formatPhoneDisplay(state.anchorPhone)}</span> and you
                  must set a new PIN.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="survey-pin">New 4-digit PIN</Label>
                  <Input
                    id="survey-pin"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={newPin.length !== 4}
                  onClick={() => setStep(state.hasBank ? "bank" : "security")}
                >
                  Continue
                </Button>
              </div>
            ) : null}
            <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setStep("email")}>
              Back
            </Button>
          </>
        ) : null}

        {step === "bank" && state.hasBank ? (
          <>
            <h2 className="font-display text-xl font-semibold">Is this your bank account?</h2>
            <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium">
              {state.bankName} · {state.bankAccountMasked}
              {state.bankAccountName ? (
                <span className="mt-1 block text-muted">{state.bankAccountName}</span>
              ) : null}
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                onClick={() => {
                  setBankIsMine(true);
                  setStep("security");
                }}
              >
                Yes, this is mine
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setBankIsMine(false);
                  setStep("security");
                }}
              >
                No — restore original bank details
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Restoring clears verification and applies a 72-hour hold on bank withdrawals again.
            </p>
            <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setStep("phone")}>
              Back
            </Button>
          </>
        ) : null}

        {step === "security" ? (
          <>
            <h2 className="font-display text-xl font-semibold">Security question</h2>
            <p className="mt-2 text-sm text-muted">{state.securityQuestion}</p>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="survey-answer">Your answer</Label>
              <Input
                id="survey-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                autoComplete="off"
              />
            </div>
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <Button
              type="button"
              className="mt-5 w-full"
              loading={busy}
              disabled={busy || answer.trim().length < 1}
              onClick={() => void finish()}
            >
              {busy ? "Finishing…" : "Finish survey"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => setStep(state.hasBank ? "bank" : "phone")}
            >
              Back
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
