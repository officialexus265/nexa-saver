import { useEffect, useState } from "react";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthFrame } from "@/components/auth-frame";
import { PasswordField } from "@/components/password-field";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SECURITY_QUESTIONS } from "@/lib/nexa/constants";
import { errMessage } from "@/lib/nexa/errors";
import { GENDER_OPTIONS, type Gender } from "@/lib/nexa/constants";
import { checkHandle, completeProfile, getMe } from "@/lib/nexa/fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({ component: SignupPage });

type FormState = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | "";
  email: string;
  phone: string;
  username: string;
  password: string;
  pin: string;
  securityQuestion: (typeof SECURITY_QUESTIONS)[number];
  securityAnswer: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
};

const empty: FormState = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "" as Gender | "",
  email: "",
  phone: "",
  username: "",
  password: "",
  pin: "",
  securityQuestion: SECURITY_QUESTIONS[0],
  securityAnswer: "",
  acceptTerms: false,
  acceptPrivacy: false,
};

function SignupPage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(() => {
    if (typeof window === "undefined") return empty;
    try {
      const raw = localStorage.getItem("nexa-signup-draft-v1");
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as Partial<FormState> & { step?: number };
      return { ...empty, ...parsed, password: "", pin: "" };
    } catch {
      return empty;
    }
  });
  const [step, setStepState] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = localStorage.getItem("nexa-signup-draft-v1");
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { step?: number };
      const s = Number(parsed.step ?? 0);
      return Number.isFinite(s) && s >= 0 && s <= 3 ? s : 0;
    } catch {
      return 0;
    }
  });
  const setStep = (n: number | ((prev: number) => number)) => {
    setStepState((prev) => {
      const next = typeof n === "function" ? n(prev) : n;
      return next;
    });
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const authed = Boolean(user);

  // Persist draft (never store password or PIN)
  useEffect(() => {
    try {
      const { password: _p, pin: _pin, ...safe } = form;
      localStorage.setItem(
        "nexa-signup-draft-v1",
        JSON.stringify({ ...safe, step }),
      );
    } catch {
      /* ignore quota */
    }
  }, [form, step]);

  useEffect(() => {
    if (!user) return;
    getMe()
      .then((me) => {
        if (!me.needsProfile) setHasProfile(true);
        if (me.needsProfile && me.email) setForm((f) => ({ ...f, email: me.email ?? f.email }));
      })
      .catch(() => undefined);
  }, [user]);

  if (!isPending && hasProfile) return <Navigate to="/dashboard" />;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function nextStep() {
    setError(null);
    if (step === 0) {
      if (!form.firstName || !form.lastName || !form.dateOfBirth || !form.gender) {
        setError("All identity fields are required");
        return;
      }
    }
    if (step === 1) {
      if (!form.email || !form.phone || !form.username) {
        setError("Contact details are required");
        return;
      }
      const check = await checkHandle({ data: { username: form.username, phone: form.phone, email: form.email } });
      if (check.phoneInvalid) {
        setError("Use a valid Malawi Airtel or TNM number");
        return;
      }
      if (check.usernameTaken) {
        setError("That username is taken");
        return;
      }
      if (check.phoneTaken) {
        setError("That phone number is already registered");
        return;
      }
      if (check.emailTaken && !authed) {
        setError("That email already has an account. Sign in instead.");
        return;
      }
    }
    if (step === 2) {
      if ((!authed && form.password.length < 8) || form.pin.length !== 4 || !form.securityAnswer) {
        setError("Set a password, a 4-digit PIN, and a security answer");
        return;
      }
    }
    setStep((s) => s + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.acceptTerms || !form.acceptPrivacy) {
      setError("Accept the terms and the privacy policy to continue");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!authed) {
        // requireEmailVerification: user must confirm email before full sign-in works.
        const signed = await authClient.signUp.email({
          email: form.email,
          password: form.password,
          name: `${form.firstName} ${form.lastName}`,
        });
        if (signed.error) throw new Error(signed.error.message ?? "Could not create account");
        // Verification email is sent by Better Auth (SMTP). User should confirm before moving money.
      }
      await completeProfile({
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          username: form.username,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender as Gender,
          pin: form.pin,
          securityQuestion: form.securityQuestion,
          securityAnswer: form.securityAnswer,
          acceptTerms: true,
          acceptPrivacy: true,
          password: authed ? form.password || undefined : undefined,
        },
      });
      // Email verification sent on sign-up when SMTP is configured.
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(errMessage(err, "Could not finish sign up"));
    } finally {
      setBusy(false);
    }
  }

  const steps = ["You", "Contact", "Security", "Legal"];

  return (
    <AuthFrame aside="Open a vault. Deposits keep 94%. Withdrawals return to the number you register today.">
      <div className="mb-4 flex gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
            <p className={cn("mt-2 text-[11px]", i === step ? "text-fg" : "text-faint")}>{label}</p>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div key={step} className="step-enter space-y-4">
          {step === 0 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Create your vault</h1>
              <Field label="First name" id="fn">
                <Input id="fn" value={form.firstName} onChange={(e) => patch("firstName", e.target.value)} required />
              </Field>
              <Field label="Last name" id="ln">
                <Input id="ln" value={form.lastName} onChange={(e) => patch("lastName", e.target.value)} required />
              </Field>
              <Field label="Date of birth" id="dob">
                <Input id="dob" type="date" value={form.dateOfBirth} onChange={(e) => patch("dateOfBirth", e.target.value)} required />
              </Field>
              <Field label="Gender" id="gender">
                <select
                  id="gender"
                  className="flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.gender}
                  onChange={(e) => patch("gender", e.target.value as Gender)}
                  required
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">How we reach you</h1>
              <Field label="Email address" id="em">
                <Input
                  id="em"
                  type="email"
                  value={form.email}
                  onChange={(e) => patch("email", e.target.value)}
                  required
                  disabled={authed && Boolean(form.email)}
                />
              </Field>
              <Field label="Phone number" id="ph">
                <Input id="ph" inputMode="tel" value={form.phone} onChange={(e) => patch("phone", e.target.value)} placeholder="0881 234 567" required />
              </Field>
              <p className="text-xs text-muted">Withdrawals only go to this number. Deposits can use any Malawi mobile number.</p>
              <Field label="Username" id="un">
                <Input id="un" value={form.username} onChange={(e) => patch("username", e.target.value)} required />
              </Field>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Lock it down</h1>
              {(!authed || !form.password) && (
                <PasswordField
                  id="pw"
                  label="Password"
                  value={form.password}
                  onChange={(v) => patch("password", v)}
                  autoComplete="new-password"
                />
              )}
              <div>
                <Label>Withdraw PIN (4 digits)</Label>
                <div className="mt-3">
                  <PinPad value={form.pin} onChange={(v) => patch("pin", v)} />
                </div>
              </div>
              <Field label="Security question" id="sq">
                <select
                  id="sq"
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={form.securityQuestion}
                  onChange={(e) => patch("securityQuestion", e.target.value as FormState["securityQuestion"])}
                >
                  {SECURITY_QUESTIONS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Answer" id="sa">
                <Input id="sa" value={form.securityAnswer} onChange={(e) => patch("securityAnswer", e.target.value)} required />
              </Field>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Agreements</h1>
              <p className="text-sm text-muted">
                NEXA-SAVER keeps 6% of every deposit as a future withdrawal fee. 3% is platform profit. 3% covers the
                payout rail. Deleted accounts cannot be recovered.
              </p>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={form.acceptTerms}
                  onChange={(e) => patch("acceptTerms", e.target.checked)}
                />
                <span>
                  I accept the{" "}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary">
                    Terms of use
                  </Link>{" "}
                  and{" "}
                  <Link to="/conditions" className="text-primary">
                    Terms and conditions
                  </Link>
                  .
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={form.acceptPrivacy}
                  onChange={(e) => patch("acceptPrivacy", e.target.checked)}
                />
                <span>
                  I accept the{" "}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" target="_blank" rel="noopener noreferrer" className="text-primary">
                    Privacy policy
                  </Link>
                  .
                </span>
              </label>
            </>
          ) : null}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          {step > 0 ? (
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" className="flex-1" onClick={() => void nextStep()}>
              Continue
            </Button>
          ) : (
            <Button type="submit" className="flex-1" loading={busy} disabled={busy}>
              {busy ? "Creating vault…" : "Create account"}
            </Button>
          )}
        </div>
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/" className="text-primary">
            Sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
