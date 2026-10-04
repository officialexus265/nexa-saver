import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import { requestPasswordReset, type PasswordResetAccountChoice } from "@/lib/nexa/fns";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<PasswordResetAccountChoice[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setAccounts(null);
    try {
      const res = await requestPasswordReset({ data: { identifier } });
      if (res.mode === "choose" && res.accounts?.length) {
        setAccounts(res.accounts);
        setMessage(res.message);
      } else {
        setMessage(res.message);
      }
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function chooseAccount(userId: string) {
    setPicking(userId);
    setError(null);
    try {
      const res = await requestPasswordReset({ data: { identifier, userId } });
      setAccounts(null);
      setMessage(res.message);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setPicking(null);
    }
  }

  return (
    <AuthFrame>
      <h1 className="font-display text-2xl font-semibold">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the <strong className="font-medium text-fg">email</strong> or{" "}
        <strong className="font-medium text-fg">Malawi mobile number</strong> on your account. We match it
        against registered accounts. If more than one matches, you choose which one to reset.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="id">Email or phone</Label>
          <Input
            id="id"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setAccounts(null);
              setMessage(null);
            }}
            required
            autoComplete="username"
            inputMode="email"
            placeholder="you@email.com or 0881 234 567"
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message && !accounts?.length ? <p className="text-sm text-primary">{message}</p> : null}
        <Button type="submit" className="w-full" loading={busy} disabled={busy || identifier.trim().length < 3}>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>

      {accounts && accounts.length > 0 ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted">{message}</p>
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.userId}>
                <button
                  type="button"
                  disabled={Boolean(picking)}
                  onClick={() => void chooseAccount(a.userId)}
                  className="flex w-full flex-col rounded-xl border border-border bg-surface px-4 py-3 text-left transition hover:border-primary/40 hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="font-medium text-fg">
                    {a.firstName} · @{a.username}
                  </span>
                  <span className="mt-0.5 text-xs text-muted">
                    {a.maskedEmail} · {a.maskedPhone}
                  </span>
                  <span className="mt-2 text-xs font-medium text-primary">
                    {picking === a.userId ? "Sending link…" : "Send reset link to this account"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        PIN reset is done after you sign in: use &quot;Forgot PIN? Use security question&quot; on the PIN screen.
      </p>
      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/" className="text-primary">
          Back to sign in
        </Link>
      </p>
    </AuthFrame>
  );
}
