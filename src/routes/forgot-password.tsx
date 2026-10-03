import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/nexa/errors";
import { requestPasswordReset } from "@/lib/nexa/fns";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await requestPasswordReset({ data: { identifier } });
      setMessage(res.message);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <h1 className="font-display text-2xl font-semibold">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the <strong className="font-medium text-fg">email</strong> or{" "}
        <strong className="font-medium text-fg">Malawi mobile number</strong> on your account. If we find a
        match, we send a reset link to the registered email (even if you typed the phone).
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="id">Email or phone</Label>
          <Input
            id="id"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
            inputMode="email"
            placeholder="you@email.com or 0881 234 567"
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="text-sm text-primary">{message}</p> : null}
        <Button type="submit" className="w-full" loading={busy} disabled={busy || identifier.trim().length < 3}>
          {busy ? "Sending reset link…" : "Send reset link"}
        </Button>
      </form>
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
