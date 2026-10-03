import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AuthFrame } from "@/components/auth-frame";
import { PasswordField } from "@/components/password-field";
import { Button } from "@/components/ui/button";
import { errMessage } from "@/lib/nexa/errors";
import { completePasswordReset, inspectPasswordResetToken } from "@/lib/nexa/fns";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "invalid" | "ready" | "done">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    inspectPasswordResetToken({ data: { token } })
      .then((res) => setState(res.ok ? "ready" : "invalid"))
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset({ data: { token, newPassword: password } });
      setState("done");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <AuthFrame>
        <p className="text-sm text-muted">Checking reset link…</p>
      </AuthFrame>
    );
  }

  if (state === "invalid") {
    return (
      <AuthFrame>
        <h1 className="font-display text-2xl font-semibold">Link expired</h1>
        <p className="mt-3 text-sm text-muted">
          This password reset link is invalid or has already been used. Request a new one from the sign-in page.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary">
          Back to sign in
        </Link>
      </AuthFrame>
    );
  }

  if (state === "done") {
    return (
      <AuthFrame>
        <h1 className="font-display text-2xl font-semibold">Password updated</h1>
        <p className="mt-3 text-sm text-muted">
          Your password was changed and all devices were signed out. Sign in with your new password.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary">
          Sign in
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">At least 8 characters. All open sessions will be signed out.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
        <PasswordField
          id="new-pw"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirm-pw"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" loading={busy} disabled={busy || password.length < 8}>
          {busy ? "Updating password…" : "Update password"}
        </Button>
      </form>
    </AuthFrame>
  );
}
