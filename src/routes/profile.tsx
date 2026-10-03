import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SessionGate } from "@/components/session-gate";
import { PasswordField } from "@/components/password-field";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut } from "@/lib/auth/client";
import { DELETE_LAYER_WAIT_MS, LOGIN_PREF_LABEL, type LoginPref } from "@/lib/nexa/constants";
import { errMessage } from "@/lib/nexa/errors";
import {
  changeLoginPref,
  changePasswordFn,
  changePinFn,
  changeRegisteredPhone,
  deleteAccountFn,
  signOutOtherDevices,
  resendVerificationEmailFn,
  changeLockPreference,
  listActiveSessions,
  revokeSessionById,
  type PublicSession,
} from "@/lib/nexa/fns";
import { LOCK_MODE_OPTIONS, type LockMode } from "@/lib/nexa/constants";
import { formatPhoneDisplay } from "@/lib/nexa/phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  return <SessionGate>{(ctx) => <Settings {...ctx} />}</SessionGate>;
}

function Settings({ profile, emailVerified }: { profile: { firstName: string; lastName: string; email: string; phone: string; username: string; loginIdentifierPref: LoginPref; role: string; phoneVerified?: boolean; lockMode?: LockMode; lockIdleMinutes?: number }; emailVerified?: boolean }) {
  const [pref, setPref] = useState<LoginPref>(profile.loginIdentifierPref);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pins, setPins] = useState({ current: "", next: "", password: "" });
  const [phoneForm, setPhoneForm] = useState({ phone: "", password: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockMode, setLockMode] = useState<LockMode>(profile.lockMode === "instant" ? "instant" : "idle");
  const [lockMinutes, setLockMinutes] = useState(String(profile.lockIdleMinutes ?? 5));
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);

  useEffect(() => {
    void listActiveSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  async function savePref(next: LoginPref) {
    setPref(next);
    await changeLoginPref({ data: { pref: next } });
    setMessage(`Sign-in identifier set to ${LOGIN_PREF_LABEL[next].toLowerCase()}`);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await changePasswordFn({ data: { currentPassword: pw.current, newPassword: pw.next } });
      setPw({ current: "", next: "" });
      setMessage("Password updated. All devices were signed out — sign in again with the new password.");
      await signOut("/");
      return;
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await changePinFn({ data: { currentPin: pins.current, newPin: pins.next, password: pins.password } });
      setPins({ current: "", next: "", password: "" });
      setMessage("Withdraw PIN updated");
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function savePhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await changeRegisteredPhone({
        data: { newPhone: phoneForm.phone, password: phoneForm.password },
      });
      setPhoneForm({ phone: "", password: "" });
      setMessage(res.message);
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">Profile</p>
        <h1 className="font-display text-3xl font-semibold">
          {profile.firstName} {profile.lastName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {profile.username} · {profile.email} · {formatPhoneDisplay(profile.phone)}
        </p>
      </div>
      {message ? <p className="text-sm text-primary">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Card className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Sign-in identifier</h2>
        <p className="text-sm text-muted">Choose what you type on the login screen next time.</p>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-2 p-1">
          {(Object.keys(LOGIN_PREF_LABEL) as LoginPref[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => void savePref(key)}
              className={cn("h-10 rounded-sm text-sm", pref === key ? "bg-surface text-fg" : "text-muted")}
            >
              {LOGIN_PREF_LABEL[key]}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <form onSubmit={savePassword} className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Change password</h2>
          <PasswordField id="p-cur" label="Current password" value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} />
          <PasswordField id="p-new" label="New password" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" />
          <Button type="submit" disabled={pw.next.length < 8}>
            Update password
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={savePin} className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Change withdraw PIN</h2>
          <div>
            <Label>Current PIN</Label>
            <div className="mt-3">
              <PinPad value={pins.current} onChange={(v) => setPins((p) => ({ ...p, current: v }))} />
            </div>
          </div>
          <div>
            <Label>New PIN</Label>
            <div className="mt-3">
              <PinPad value={pins.next} onChange={(v) => setPins((p) => ({ ...p, next: v }))} />
            </div>
          </div>
          <PasswordField
            id="pin-pw"
            label="Confirm with password"
            value={pins.password}
            onChange={(v) => setPins((p) => ({ ...p, password: v }))}
          />
          <Button
            type="submit"
            disabled={pins.current.length !== 4 || pins.next.length !== 4 || pins.password.length < 1}
          >
            Update PIN
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={savePhone} className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Registered withdrawal number</h2>
          <p className="text-sm text-muted">
            Money is only paid to this number. Changing it requires your password and places a 72-hour hold on
            withdrawals. Your balance stays safe.
          </p>
          <p className="text-sm">Current: {formatPhoneDisplay(profile.phone)}</p>
          <div className="space-y-1.5">
            <Label htmlFor="new-phone">New Malawi mobile</Label>
            <Input
              id="new-phone"
              inputMode="tel"
              value={phoneForm.phone}
              onChange={(e) => setPhoneForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="09… or 08…"
            />
          </div>
          <PasswordField
            id="phone-pw"
            label="Confirm with password"
            value={phoneForm.password}
            onChange={(v) => setPhoneForm((p) => ({ ...p, password: v }))}
          />
          <Button type="submit" disabled={phoneForm.phone.length < 8 || phoneForm.password.length < 1}>
            Update number
          </Button>
        </form>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Email</h2>
        <p className="text-sm text-muted">
          {profile.email}
          {emailVerified ? (
            <span className="ml-2 text-primary">· Verified</span>
          ) : (
            <span className="ml-2 text-amber-400">· Not verified</span>
          )}
        </p>
        {!emailVerified ? (
          <>
            <p className="text-sm text-muted">
              Deposits and withdrawals need a verified email. Check your inbox for a link, or resend.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void (async () => {
                  setError(null);
                  try {
                    const res = await resendVerificationEmailFn();
                    setMessage(
                      res.alreadyVerified
                        ? "Your email is already verified. Pull to refresh or reopen Profile."
                        : "Verification email sent. Check your inbox (and spam).",
                    );
                  } catch (err) {
                    setError(errMessage(err));
                  }
                })();
              }}
            >
              Resend verification email
            </Button>
          </>
        ) : null}
      </Card>

      
      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Vault lock</h2>
        <p className="text-sm text-muted">
          Choose when the PIN screen appears again after you unlock. Instant is safest on a shared phone.
        </p>
        <div className="space-y-2">
          {LOCK_MODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="lock-mode"
                checked={lockMode === opt.value}
                onChange={() => setLockMode(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        {lockMode === "idle" ? (
          <div className="space-y-1.5">
            <Label htmlFor="lock-mins">Lock after (minutes)</Label>
            <Input
              id="lock-mins"
              inputMode="numeric"
              value={lockMinutes}
              onChange={(e) => setLockMinutes(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="5"
            />
            <p className="text-xs text-muted">Between 1 and 60 minutes. Default is 5.</p>
          </div>
        ) : null}
        <Button
          type="button"
          onClick={() => {
            void (async () => {
              setError(null);
              try {
                const mins = Math.min(60, Math.max(1, Number(lockMinutes) || 5));
                const res = await changeLockPreference({
                  data: { mode: lockMode, idleMinutes: mins },
                });
                setLockMinutes(String(res.idleMinutes));
                setMessage(
                  res.mode === "instant"
                    ? "Vault will lock when you leave the app."
                    : `Vault will lock after ${res.idleMinutes} minute${res.idleMinutes === 1 ? "" : "s"} of inactivity.`,
                );
              } catch (err) {
                setError(errMessage(err));
              }
            })();
          }}
        >
          Save lock setting
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Sessions</h2>
        <p className="text-sm text-muted">Active sign-ins on this account. Sign out any device you do not recognise.</p>
        {sessions === null ? (
          <p className="text-sm text-muted">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted">No active sessions found.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {s.isCurrent ? "This device" : "Other device"}
                    {s.isCurrent ? (
                      <span className="ml-2 text-xs font-normal text-primary">current</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {s.userAgent ? s.userAgent.slice(0, 80) : "Unknown browser"}
                  </p>
                  <p className="text-xs text-faint">
                    {s.ipAddress ? `IP ${s.ipAddress} · ` : null}
                    Last active {new Date(s.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  loading={sessionBusy === s.id}
                  disabled={Boolean(sessionBusy)}
                  onClick={() => {
                    void (async () => {
                      setError(null);
                      setSessionBusy(s.id);
                      try {
                        if (s.isCurrent) {
                          await signOutOtherDevices();
                          await signOut("/");
                          return;
                        }
                        await revokeSessionById({ data: { sessionId: s.id } });
                        setSessions((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
                        setMessage("Device signed out.");
                      } catch (err) {
                        setError(errMessage(err));
                      } finally {
                        setSessionBusy(null);
                      }
                    })();
                  }}
                >
                  {s.isCurrent ? "Sign out" : "Sign out"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            void (async () => {
              setError(null);
              try {
                await signOutOtherDevices();
                await signOut("/");
              } catch (err) {
                setError(errMessage(err));
              }
            })();
          }}
        >
          Sign out all devices
        </Button>
      </Card>

      {profile.role !== "admin" ? <DeleteAccount /> : null}
    </div>
  );
}

function DeleteAccount() {
  const navigate = useNavigate();
  const [layer, setLayer] = useState(0);
  const [wait, setWait] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (layer === 0) return;
    setWait(true);
    const t = window.setTimeout(() => setWait(false), DELETE_LAYER_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [layer]);

  async function finish() {
    setError(null);
    try {
      await deleteAccountFn({ data: { pin, confirm: "DELETE" } });
      await signOut("/");
      navigate({ to: "/" });
    } catch (err) {
      setError(errMessage(err));
    }
  }

  const copy = [
    {
      title: "Delete this vault?",
      body: "This is the first of three confirmations. Once the account is gone it cannot be recovered. Withdraw every kwacha first.",
    },
    {
      title: "Funds will be lost",
      body: "Withdraw your balance to zero first. Pending deposits or withdrawals must finish. After deletion you cannot sign in again.",
    },
    {
      title: "Final warning",
      body: "Last step. Confirm with your PIN. After this, the username, number, and ledger disappear permanently.",
    },
  ][Math.max(0, layer - 1)];

  return (
    <Card className="border-danger/40">
      <h2 className="font-display text-lg font-semibold text-danger">Delete account</h2>
      {layer === 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">Three confirmations. Each waits five seconds. Balance must be zero and no payment may be in progress. Personal details are removed; transaction records are kept for audits.</p>
          <Button variant="danger" className="mt-4" onClick={() => setLayer(1)}>
            Start deletion
          </Button>
        </>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-danger">Layer {layer} of 3</p>
          <h3 className="font-display text-xl font-semibold">{copy.title}</h3>
          <p className="text-sm text-muted">{copy.body}</p>
          {layer === 3 ? (
            <div>
              <Label>PIN</Label>
              <div className="mt-3">
                <PinPad value={pin} onChange={setPin} />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setLayer(0)}>
              Cancel
            </Button>
            {layer < 3 ? (
              <Button variant="danger" className="flex-1" disabled={wait} onClick={() => setLayer((n) => n + 1)}>
                {wait ? "Wait 5 seconds…" : "Continue"}
              </Button>
            ) : (
              <Button variant="danger" className="flex-1" disabled={wait || pin.length !== 4} onClick={() => void finish()}>
                {wait ? "Wait 5 seconds…" : "Delete forever"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
