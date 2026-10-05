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
  saveBankPayoutDetails,
  adminUpdateContact,
  changeSecurityQuestionFn,
  listPaychanguBanks,
  type PublicSession,
} from "@/lib/nexa/fns";
import { LOCK_MODE_OPTIONS, type LockMode } from "@/lib/nexa/constants";
import { formatPhoneDisplay } from "@/lib/nexa/phone";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  return <SessionGate>{(ctx) => <Settings {...ctx} />}</SessionGate>;
}

function Settings({ profile, emailVerified }: { profile: { firstName: string; lastName: string; email: string; phone: string; username: string; loginIdentifierPref: LoginPref; role: string; phoneVerified?: boolean; lockMode?: LockMode; lockIdleMinutes?: number; hasBankDetails?: boolean; bankName?: string | null; bankAccountNumberMasked?: string | null; bankAccountName?: string | null; bankHoldUntil?: string | null }; emailVerified?: boolean }) {
  const [pref, setPref] = useState<LoginPref>(profile.loginIdentifierPref);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pins, setPins] = useState({ current: "", next: "", password: "" });
  const [phoneForm, setPhoneForm] = useState({ phone: "", password: "" });
  const [banks, setBanks] = useState<Array<{ uuid: string; name: string }>>([]);
  const [bankForm, setBankForm] = useState({ bankUuid: "", bankName: "", accountNumber: "", accountName: "", pin: "" });
  const [bankMsg, setBankMsg] = useState<string | null>(null);
  const [bankBusy, setBankBusy] = useState(false);
  /** null = all collapsed; only one section open at a time */
  const [openSection, setOpenSection] = useState<string | null>(null);


  useEffect(() => {
    void listPaychanguBanks()
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

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

      {profile.role === "admin" ? (
        <ProfileSection
          id="admin-contact"
          title="Admin email & phone"
          summary="Use a real inbox for alerts"
          openId={openSection}
          onToggle={setOpenSection}
        >
          <AdminContactForm currentEmail={profile.email} currentPhone={profile.phone} onDone={(m) => setMessage(m)} onError={(e) => setError(e)} />
        </ProfileSection>
      ) : null}

      <ProfileSection
        id="security-q"
        title="Security question"
        summary="Used for account recovery"
        openId={openSection}
        onToggle={setOpenSection}
      >
        <SecurityQuestionForm onDone={(m) => setMessage(m)} onError={(e) => setError(e)} />
      </ProfileSection>

      <ProfileSection
        id="signin"
        title="Sign-in identifier"
        summary={LOGIN_PREF_LABEL[pref]}
        openId={openSection}
        onToggle={setOpenSection}
      >
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
      </ProfileSection>

      <ProfileSection
        id="password"
        title="Change password"
        summary="Update your sign-in password"
        openId={openSection}
        onToggle={setOpenSection}
      >
        <form onSubmit={savePassword} className="space-y-3">
          <PasswordField id="p-cur" label="Current password" value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} />
          <PasswordField id="p-new" label="New password" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" />
          <Button type="submit" disabled={pw.next.length < 8}>
            Update password
          </Button>
        </form>
      </ProfileSection>

      <ProfileSection
        id="pin"
        title="Change withdraw PIN"
        summary="4-digit vault PIN"
        openId={openSection}
        onToggle={setOpenSection}
      >
        <form onSubmit={savePin} className="space-y-4">
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
      </ProfileSection>

      <ProfileSection
        id="phone"
        title="Registered withdrawal number"
        summary={formatPhoneDisplay(profile.phone)}
        openId={openSection}
        onToggle={setOpenSection}
      >
        <form onSubmit={savePhone} className="space-y-3">
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
      </ProfileSection>

      <ProfileSection
        id="bank"
        title="Bank payout details"
        summary={profile.hasBankDetails ? `${profile.bankName ?? "Bank"} ${profile.bankAccountNumberMasked ?? ""}` : "Optional · withdrawals only"}
        openId={openSection}
        onToggle={setOpenSection}
      >
        <p className="text-sm text-muted">
          Optional. Used only for withdrawals to bank — not for deposits. After you save, bank withdrawals are
          held for 72 hours. The first successful bank payout marks the account verified.
        </p>
        {profile.hasBankDetails ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            Current: {profile.bankName} {profile.bankAccountNumberMasked}
            {profile.bankAccountName ? ` · ${profile.bankAccountName}` : ""}
            {profile.bankHoldUntil && new Date(profile.bankHoldUntil).getTime() > Date.now()
              ? ` · hold until ${new Date(profile.bankHoldUntil).toLocaleString()}`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-muted">No bank details yet.</p>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBankBusy(true);
            setBankMsg(null);
            void saveBankPayoutDetails({ data: bankForm })
              .then((r) => {
                setBankMsg(r.message);
                setBankForm((f) => ({ ...f, pin: "" }));
                window.location.reload();
              })
              .catch((err) => setBankMsg(errMessage(err)))
              .finally(() => setBankBusy(false));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="bank-select">Bank</Label>
            <select
              id="bank-select"
              className="flex h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
              value={bankForm.bankUuid}
              onChange={(e) => {
                const uuid = e.target.value;
                const name = banks.find((b) => b.uuid === uuid)?.name ?? "";
                setBankForm((f) => ({ ...f, bankUuid: uuid, bankName: name }));
              }}
              required
            >
              <option value="">Select bank…</option>
              {banks.map((b) => (
                <option key={b.uuid} value={b.uuid}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-acc-name">Account name</Label>
            <Input
              id="bank-acc-name"
              value={bankForm.accountName}
              onChange={(e) => setBankForm((f) => ({ ...f, accountName: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-acc-num">Account number</Label>
            <Input
              id="bank-acc-num"
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm((f) => ({ ...f, accountNumber: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-pin">Confirm with PIN</Label>
            <Input
              id="bank-pin"
              inputMode="numeric"
              maxLength={4}
              value={bankForm.pin}
              onChange={(e) => setBankForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              required
            />
          </div>
          {bankMsg ? <p className="text-sm text-muted">{bankMsg}</p> : null}
          <Button type="submit" disabled={bankBusy || bankForm.pin.length !== 4 || !bankForm.bankUuid}>
            {bankBusy ? "Saving…" : "Save bank details"}
          </Button>
        </form>
      </ProfileSection>

      <ProfileSection
        id="email"
        title="Email"
        summary={emailVerified ? `${profile.email} · Verified` : `${profile.email} · Not verified`}
        openId={openSection}
        onToggle={setOpenSection}
      >
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
      </ProfileSection>

      <ProfileSection
        id="lock"
        title="Vault lock"
        summary={
          profile.lockMode === "instant"
            ? "Locks when you leave the app"
            : `Idle · ${profile.lockIdleMinutes ?? 5} min`
        }
        openId={openSection}
        onToggle={setOpenSection}
      >
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
      </ProfileSection>

      <ProfileSection
        id="sessions"
        title="Sessions"
        summary="Devices signed in to this account"
        openId={openSection}
        onToggle={setOpenSection}
      >
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
      </ProfileSection>

      {profile.role !== "admin" ? (
        <ProfileSection
          id="delete"
          title="Delete account"
          summary="Permanent · three confirmations"
          openId={openSection}
          onToggle={setOpenSection}
          danger
        >
          <DeleteAccount />
        </ProfileSection>
      ) : null}
    </div>
  );
}

function AdminContactForm({
  currentEmail,
  currentPhone,
  onDone,
  onError,
}: {
  currentEmail: string;
  currentPhone: string;
  onDone: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [email, setEmail] = useState(currentEmail);
  const [phone, setPhone] = useState(currentPhone);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void adminUpdateContact({
          data: {
            email: email.trim() !== currentEmail ? email.trim() : undefined,
            phone: phone.trim() !== currentPhone ? phone.trim() : undefined,
            password,
          },
        })
          .then((r) => {
            onDone(
              `Contact updated.${r.email ? ` Email → ${r.email}` : ""}${r.phone ? ` Phone → ${r.phone}` : ""}`,
            );
            setPassword("");
            // Refresh so header + session show the new email/phone.
            window.setTimeout(() => window.location.reload(), 800);
          })
          .catch((err) => onError(errMessage(err)))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm text-muted">
        Seed default was admin@nexa-saver.app. Set a real email so alerts and recovery work. Confirm with your
        password.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="adm-email">Email</Label>
        <Input id="adm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="adm-phone">Phone</Label>
        <Input id="adm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <PasswordField id="adm-pw" label="Confirm with password" value={password} onChange={setPassword} />
      <Button type="submit" disabled={busy || password.length < 1}>
        {busy ? "Saving…" : "Save contact"}
      </Button>
    </form>
  );
}

function SecurityQuestionForm({
  onDone,
  onError,
}: {
  onDone: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [question, setQuestion] = useState("What was the name of your first pet?");
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void changeSecurityQuestionFn({
          data: { question, answer, password, pin },
        })
          .then(() => {
            onDone("Security question updated.");
            setAnswer("");
            setPassword("");
            setPin("");
          })
          .catch((err) => onError(errMessage(err)))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm text-muted">
        Default seed answer was &quot;nexa&quot;. Choose a question only you can answer. Requires password and PIN
        (default PIN was 0000 if never changed).
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="sq">Question</Label>
        <Input id="sq" value={question} onChange={(e) => setQuestion(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sa">New answer</Label>
        <Input id="sa" value={answer} onChange={(e) => setAnswer(e.target.value)} required />
      </div>
      <PasswordField id="sq-pw" label="Password" value={password} onChange={setPassword} />
      <div className="space-y-1.5">
        <Label htmlFor="sq-pin">PIN</Label>
        <Input
          id="sq-pin"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </div>
      <Button type="submit" disabled={busy || pin.length !== 4 || answer.length < 2}>
        {busy ? "Saving…" : "Update security question"}
      </Button>
    </form>
  );
}

function ProfileSection({

  id,
  title,
  summary,
  openId,
  onToggle,
  children,
  danger,
}: {
  id: string;
  title: string;
  summary?: string;
  openId: string | null;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const open = openId === id;
  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-2/60"
        onClick={() => onToggle(open ? null : id)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2
            className={cn(
              "font-display text-lg font-semibold",
              danger ? "text-danger" : "text-fg",
            )}
          >
            {title}
          </h2>
          {summary ? <p className="mt-0.5 truncate text-xs text-muted">{summary}</p> : null}
        </div>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">{children}</div>
      ) : null}
    </Card>
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
    <div className="space-y-3">
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
    </div>
  );
}
