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
} from "@/lib/nexa/fns";
import { formatPhoneDisplay } from "@/lib/nexa/phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  return <SessionGate>{(ctx) => <Settings {...ctx} />}</SessionGate>;
}

function Settings({ profile }: { profile: { firstName: string; lastName: string; email: string; phone: string; username: string; loginIdentifierPref: LoginPref; role: string } }) {
  const [pref, setPref] = useState<LoginPref>(profile.loginIdentifierPref);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pins, setPins] = useState({ current: "", next: "", password: "" });
  const [phoneForm, setPhoneForm] = useState({ phone: "", password: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <h2 className="font-display text-lg font-semibold">Sessions</h2>
        <p className="text-sm text-muted">
          Sign out every device using this account. You will need to sign in again on this device too.
        </p>
        <Button
          type="button"
          variant="secondary"
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
          Sign out other devices
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
