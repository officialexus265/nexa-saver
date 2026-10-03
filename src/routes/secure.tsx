import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AuthFrame } from "@/components/auth-frame";
import { PasswordField } from "@/components/password-field";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { errMessage } from "@/lib/nexa/errors";
import {
  inspectSecureToken,
  secureAccountWithPassword,
  secureAccountWithPin,
} from "@/lib/nexa/fns";
import { formatPhoneDisplay } from "@/lib/nexa/phone";

export const Route = createFileRoute("/secure")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: SecureAccountPage,
});

function SecureAccountPage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "invalid" | "ready" | "done">("loading");
  const [action, setAction] = useState<"new_device" | "phone_change" | "pin_change" | null>(null);
  const [firstName, setFirstName] = useState("");
  const [previousPhone, setPreviousPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [password, setPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [restorePhone, setRestorePhone] = useState(true);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    inspectSecureToken({ data: { token } })
      .then((res) => {
        if (!res.ok) {
          setState("invalid");
          return;
        }
        setAction(res.action);
        setFirstName(res.firstName);
        setPreviousPhone(res.previousPhone ?? null);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await secureAccountWithPassword({
        data: {
          token,
          currentPassword,
          newPassword,
          restorePhone: action === "phone_change" ? restorePhone : false,
        },
      });
      setDoneMsg(
        res.phoneRestored
          ? "Password updated, all devices signed out, and your previous withdrawal number was restored."
          : "Password updated and all devices were signed out. Sign in again with your new password.",
      );
      setState("done");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await secureAccountWithPin({ data: { token, password, newPin } });
      setDoneMsg("PIN updated and all devices were signed out. Sign in again, then unlock with your new PIN.");
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
        <p className="text-sm text-muted">Checking secure link…</p>
      </AuthFrame>
    );
  }

  if (state === "invalid") {
    return (
      <AuthFrame>
        <h1 className="font-display text-2xl font-semibold">Link expired</h1>
        <p className="mt-3 text-sm text-muted">
          This secure link is invalid or has already been used. If you still need help, sign in and change your
          password from Profile, or contact platform support.
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
        <h1 className="font-display text-2xl font-semibold">Account secured</h1>
        <p className="mt-3 text-sm text-muted">{doneMsg}</p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary">
          Sign in
        </Link>
      </AuthFrame>
    );
  }

  const pinMode = action === "pin_change";

  return (
    <AuthFrame>
      <h1 className="font-display text-2xl font-semibold">Secure your account</h1>
      <p className="mt-2 text-sm text-muted">
        {firstName ? `Hi ${firstName}. ` : null}
        {action === "new_device"
          ? "We saw a sign-in from a new device or network. If that was not you, change your password below. We recommend signing out every device."
          : action === "phone_change"
            ? "Your registered withdrawal number was changed. If that was not you, change your password and restore the previous number."
            : "Your withdraw PIN was changed. If that was not you, set a new PIN below. All devices will be signed out."}
      </p>

      {pinMode ? (
        <form onSubmit={(e) => void submitPin(e)} className="mt-6 space-y-4">
          <PasswordField
            id="sec-pw"
            label="Account password"
            value={password}
            onChange={setPassword}
          />
          <div>
            <p className="mb-2 text-sm font-medium">New 4-digit PIN</p>
            <PinPad value={newPin} onChange={setNewPin} />
          </div>
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
            Recommendation: this will sign out all devices. You will need to sign in again.
          </p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full" loading={busy} disabled={busy || password.length < 1 || newPin.length !== 4}>
            {busy ? "Securing account…" : "Update PIN & sign out all devices"}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void submitPassword(e)} className="mt-6 space-y-4">
          <PasswordField
            id="cur-pw"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            id="new-pw"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
          />
          {action === "phone_change" && previousPhone ? (
            <label className="flex items-start gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="mt-1"
                checked={restorePhone}
                onChange={(e) => setRestorePhone(e.target.checked)}
              />
              <span>
                Restore previous withdrawal number{" "}
                <span className="text-fg">{formatPhoneDisplay(previousPhone)}</span>
              </span>
            </label>
          ) : null}
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
            Recommendation: all active sessions will be signed out after you save. Use the new password on your
            trusted device only.
          </p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            loading={busy} disabled={busy || currentPassword.length < 1 || newPassword.length < 8}
          >
            {busy ? "Securing account…" : "Change password & sign out all devices"}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
