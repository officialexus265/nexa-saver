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
import { useT } from "@/lib/i18n/client";
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
  userListPasskeys,
  userDeletePasskey,
  getMyKyc,
  submitKycDetails,
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
  const { t } = useT();
  return <SessionGate>{(ctx) => <Settings {...ctx} />}</SessionGate>;
}

function Settings({
  const { t } = useT(); profile, emailVerified }: { profile: { firstName: string; lastName: string; email: string; phone: string; username: string; loginIdentifierPref: LoginPref; role: string; phoneVerified?: boolean; lockMode?: LockMode; lockIdleMinutes?: number; hasBankDetails?: boolean; bankName?: string | null; bankAccountNumberMasked?: string | null; bankAccountName?: string | null; bankHoldUntil?: string | null }; emailVerified?: boolean }) {
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
  const [lockMode, setLockMode] = useState<LockMode>(
    profile.lockMode === "instant" ? "instant" : profile.lockMode === "off" ? "off" : "idle",
  );
  const [lockMinutes, setLockMinutes] = useState(String(profile.lockIdleMinutes ?? 5));
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<Array<{ id: string; nickname: string; createdAt: string }>>([]);
  const [passkeyPin, setPasskeyPin] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [kycInfo, setKycInfo] = useState<Awaited<ReturnType<typeof getMyKyc>> | null>(null);
  const [kycForm, setKycForm] = useState({ idType: "national_id", idNumber: "", idName: "" });
  const [kycBusy, setKycBusy] = useState(false);

  useEffect(() => {
    void listActiveSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    void getMyKyc()
      .then(setKycInfo)
      .catch(() => setKycInfo(null));
  }, []);

  useEffect(() => {
    void userListPasskeys()
      .then((list) => setPasskeys(list.map((k) => ({ id: k.id, nickname: k.nickname || "Passkey", createdAt: k.createdAt }))))
      .catch(() => setPasskeys([]));
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
      setMessage(t("profile.passwordUpdated"));
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
      setMessage(t("profile.pinUpdated"));
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
        <p className="text-sm text-muted">{t("profile.title")}</p>
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
          title={t("profile.adminContact")}
          summary="Use a real inbox for alerts"
          openId={openSection}
          onToggle={setOpenSection}
        >
          <AdminContactForm currentEmail={profile.email} currentPhone={profile.phone} onDone={(m) => setMessage(m)} onError={(e) => setError(e)} />
        </ProfileSection>
      ) : null}


      <ProfileSection
        id="kyc"
        title={t("profile.identity")}
        summary={
          kycInfo?.kyc?.status === "verified"
            ? t("profile.verified")
            : kycInfo?.kyc?.status === "pending"
              ? t("profile.underReview")
              : kycInfo?.kyc?.status === "rejected"
                ? t("profile.needsUpdate")
                : "Optional until large withdrawals"
        }
        openId={openSection}
        onToggle={setOpenSection}
      >
        <p className="text-sm text-muted">
          Light identity check for larger withdrawals (from about{" "}
          {kycInfo?.thresholdKwacha?.toLocaleString() ?? "100,000"} MWK). Smaller withdrawals still work without this.
          We store your ID type and number for review — no photo upload in this step.
        </p>
        {kycInfo?.kyc?.status === "verified" ? (
          <p className="text-sm text-primary">{t("profile.identityVerified")}</p>
        ) : null}
        {kycInfo?.kyc?.status === "pending" ? (
          <p className="text-sm text-muted">
            Submitted{kycInfo.kyc.submittedAt ? ` ${new Date(kycInfo.kyc.submittedAt).toLocaleString()}` : ""}. Name on ID:{" "}
            {kycInfo.kyc.idName}. Waiting for admin review.
          </p>
        ) : null}
        {kycInfo?.kyc?.status === "rejected" ? (
          <p className="text-sm text-danger">
            Previous submission was not accepted
            {kycInfo.kyc.reviewNote ? `: ${kycInfo.kyc.reviewNote}` : "."} Please correct and resubmit.
          </p>
        ) : null}
        {kycInfo?.kyc?.status !== "verified" && kycInfo?.kyc?.status !== "pending" ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setKycBusy(true);
              setError(null);
              void submitKycDetails({
                data: {
                  idType: kycForm.idType as "national_id" | "passport" | "drivers_license",
                  idNumber: kycForm.idNumber,
                  idName: kycForm.idName,
                },
              })
                .then(() => {
                  setMessage(t("profile.kycSubmitted"));
                  return getMyKyc();
                })
                .then(setKycInfo)
                .catch((err) => setError(errMessage(err)))
                .finally(() => setKycBusy(false));
            }}
          >
            <div className="space-y-1">
              <Label>{t("profile.idType")}</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm"
                value={kycForm.idType}
                onChange={(e) => setKycForm((f) => ({ ...f, idType: e.target.value }))}
              >
                {(kycInfo?.idTypes ?? [
                  { value: "national_id", label: "National ID" },
                  { value: "passport", label: "Passport" },
                  { value: "drivers_license", label: "Driver’s licence" },
                ]).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("profile.idNumber")}</Label>
              <Input
                value={kycForm.idNumber}
                onChange={(e) => setKycForm((f) => ({ ...f, idNumber: e.target.value }))}
                required
                minLength={4}
                placeholder={t("profile.asPrinted")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("profile.fullNameOnId")}</Label>
              <Input
                value={kycForm.idName}
                onChange={(e) => setKycForm((f) => ({ ...f, idName: e.target.value }))}
                required
                minLength={2}
                placeholder={t("profile.exactlyOnId")}
              />
            </div>
            <Button type="submit" disabled={kycBusy}>
              {kycBusy ? t("profile.submitting") : "Submit for review"}
            </Button>
          </form>
        ) : null}
      </ProfileSection>

      <ProfileSection
        id="security-q"
        title={t("profile.securityQuestion")}
        summary="Used for account recovery"
        openId={openSection}
        onToggle={setOpenSection}
      >
        <SecurityQuestionForm onDone={(m) => setMessage(m)} onError={(e) => setError(e)} />
      </ProfileSection>

      <ProfileSection
        id="passkeys"
        title={t("profile.passkey")}
        summary={passkeys.length ? `${passkeys.length} registered` : "Not enabled"}
        openId={openSection}
        onToggle={setOpenSection}
      >
        <p className="text-sm text-muted">{t("profile.passkeyHint")}</p>
        {passkeys.length === 0 ? (
          <p className="text-sm text-muted">{t("profile.noPasskeys")}</p>
        ) : (
          <ul className="space-y-2">
            {passkeys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{k.nickname}</p>
                  <p className="text-xs text-muted">Added {new Date(k.createdAt).toLocaleString()}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={passkeyBusy || passkeyPin.length < 4}
                  onClick={() => {
                    setPasskeyBusy(true);
                    setError(null);
                    void userDeletePasskey({ data: { id: k.id, pin: passkeyPin } })
                      .then(() => {
                        setPasskeys((prev) => prev.filter((x) => x.id !== k.id));
                        setMessage(t("profile.keyRemoved"));
                        setPasskeyPin("");
                      })
                      .catch((err) => setError(errMessage(err)))
                      .finally(() => setPasskeyBusy(false));
                  }}
                >
                  {t("common.remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {passkeys.length > 0 ? (
          <div className="mt-3 space-y-1">
            <Label htmlFor="pk-pin">{t("profile.pinToRemoveKey")}</Label>
            <Input
              id="pk-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={passkeyPin}
              onChange={(e) => setPasskeyPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="PIN"
            />
          </div>
        ) : null}
      </ProfileSection>

      <ProfileSection
        id="signin"
        title={t("profile.signInId")}
        summary={LOGIN_PREF_LABEL[pref]}
        openId={openSection}
        onToggle={setOpenSection}
      >
        <p className="text-sm text-muted">{t("profile.signInIdHint")}</p>
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
        title={t("profile.changePassword")}
        summary="Update your sign-in password"
        openId={openSection}
        onToggle={setOpenSection}
      >
        <form onSubmit={savePassword} className="space-y-3">
          <PasswordField id="p-cur" label={t("profile.currentPassword")} value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} />
          <PasswordField id="p-new" label={t("profile.newPassword")} value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" />
          <Button type="submit" disabled={pw.next.length < 8}>
            {t("profile.updatePassword")}
          </Button>
        </form>
      </ProfileSection>

      <ProfileSection
        id="pin"
        title={t("profile.changePin")}
        summary="4-digit vault PIN"
        openId={openSection}
        onToggle={setOpenSection}
      >
        <form onSubmit={savePin} className="space-y-4">
          <div>
            <Label>{t("profile.currentPin")}</Label>
            <div className="mt-3">
              <PinPad value={pins.current} onChange={(v) => setPins((p) => ({ ...p, current: v }))} />
            </div>
          </div>
          <div>
            <Label>{t("profile.newPin")}</Label>
            <div className="mt-3">
              <PinPad value={pins.next} onChange={(v) => setPins((p) => ({ ...p, next: v }))} />
            </div>
          </div>
          <PasswordField
            id="pin-pw"
            label={t("profile.confirmPassword")}
            value={pins.password}
            onChange={(v) => setPins((p) => ({ ...p, password: v }))}
          />
          <Button
            type="submit"
            disabled={pins.current.length !== 4 || pins.next.length !== 4 || pins.password.length < 1}
          >
            {t("profile.updatePin")}
          </Button>
        </form>
      </ProfileSection>

      <ProfileSection
        id="phone"
        title={t("profile.registeredPhone")}
        summary={formatPhoneDisplay(profile.phone)}
        openId={openSection}
        onToggle={setOpenSection}
      >
        <form onSubmit={savePhone} className="space-y-3">
          <p className="text-sm text-muted">{t("profile.phoneChangeHint")}</p>
          <p className="text-sm">Current: {formatPhoneDisplay(profile.phone)}</p>
          <div className="space-y-1.5">
            <Label htmlFor="new-phone">{t("profile.newPhone")}</Label>
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
            label={t("profile.confirmPassword")}
            value={phoneForm.password}
            onChange={(v) => setPhoneForm((p) => ({ ...p, password: v }))}
          />
          <Button type="submit" disabled={phoneForm.phone.length < 8 || phoneForm.password.length < 1}>
            {t("profile.updateNumber")}
          </Button>
        </form>
      </ProfileSection>

      <ProfileSection
        id="bank"
        title={t("profile.bankDetails")}
        summary={profile.hasBankDetails ? `${profile.bankName ?? "Bank"} ${profile.bankAccountNumberMasked ?? ""}` : "Optional · withdrawals only"}
        openId={openSection}
        onToggle={setOpenSection}
      >
        <p className="text-sm text-muted">
          {t("profile.bankOptionalHint")}</p>
        {profile.hasBankDetails ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            Current: {profile.bankName} {profile.bankAccountNumberMasked}
            {profile.bankAccountName ? ` · ${profile.bankAccountName}` : ""}
            {profile.bankHoldUntil && new Date(profile.bankHoldUntil).getTime() > Date.now()
              ? ` · hold until ${new Date(profile.bankHoldUntil).toLocaleString()}`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-muted">{t("profile.noBank")}</p>
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
            <Label htmlFor="bank-select">{t("profile.bank")}</Label>
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
              <option value="">{t("profile.selectBank")}</option>
              {banks.map((b) => (
                <option key={b.uuid} value={b.uuid}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-acc-name">{t("profile.accountName")}</Label>
            <Input
              id="bank-acc-name"
              value={bankForm.accountName}
              onChange={(e) => setBankForm((f) => ({ ...f, accountName: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-acc-num">{t("profile.accountNumber")}</Label>
            <Input
              id="bank-acc-num"
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm((f) => ({ ...f, accountNumber: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-pin">{t("profile.confirmPin")}</Label>
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
            {bankBusy ? t("profile.saving") : t("profile.saveBank")}
          </Button>
        </form>
      </ProfileSection>

      <ProfileSection
        id="email"
        title={t("profile.email")}
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
              {t("profile.emailVerifyNeed")}
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
                        ? t("profile.emailAlreadyVerified")
                        : "Verification email sent. Check your inbox (and spam).",
                    );
                  } catch (err) {
                    setError(errMessage(err));
                  }
                })();
              }}
            >
              {t("profile.resendEmail")}
            </Button>
          </>
        ) : null}
      </ProfileSection>

      <ProfileSection
        id="lock"
        title={t("profile.vaultLock")}
        summary={
          profile.lockMode === "instant"
            ? t("profile.lockWhenLeave")
            : profile.lockMode === "off"
              ? t("profile.doNotLock")
              : `Idle · ${profile.lockIdleMinutes ?? 5} min`
        }
        openId={openSection}
        onToggle={setOpenSection}
      >
        <p className="text-sm text-muted">
          {t("profile.lockHint")}
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
            <Label htmlFor="lock-mins">{t("profile.lockAfterMins")}</Label>
            <Input
              id="lock-mins"
              inputMode="numeric"
              value={lockMinutes}
              onChange={(e) => setLockMinutes(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="5"
            />
            <p className="text-xs text-muted">{t("profile.lockMinsHint")}</p>
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
                    ? t("profile.lockWhenLeaveApp")
                    : res.mode === "off"
                      ? t("profile.autoLockOffBalance")
                      : `Vault will lock after ${res.idleMinutes} minute${res.idleMinutes === 1 ? "" : "s"} of inactivity.`,
                );
              } catch (err) {
                setError(errMessage(err));
              }
            })();
          }}
        >
          {t("profile.saveLock")}
        </Button>
      </ProfileSection>

      <ProfileSection
        id="sessions"
        title={t("profile.sessions")}
        summary="Devices signed in to this account"
        openId={openSection}
        onToggle={setOpenSection}
      >
        <p className="text-sm text-muted">{t("profile.activeSessions")}</p>
        {sessions === null ? (
          <p className="text-sm text-muted">{t("profile.loadingSessions")}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted">{t("profile.noSessions")}</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {s.isCurrent ? t("profile.thisDevice") : "Other device"}
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
                        setMessage(t("profile.deviceSignedOut"));
                      } catch (err) {
                        setError(errMessage(err));
                      } finally {
                        setSessionBusy(null);
                      }
                    })();
                  }}
                >
                  {t("profile.signOut")}
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
          {t("profile.signOutAll")}
        </Button>
      </ProfileSection>

      {profile.role !== "admin" ? (
        <ProfileSection
          id="delete"
          title={t("profile.deleteAccount")}
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
  const { t } = useT();
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
      <p className="text-sm text-muted">{t("profile.adminEmailSeed")}</p>
      <div className="space-y-1.5">
        <Label htmlFor="adm-email">{t("profile.email")}</Label>
        <Input id="adm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="adm-phone">{t("profile.phone")}</Label>
        <Input id="adm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <PasswordField id="adm-pw" label={t("profile.confirmPassword")} value={password} onChange={setPassword} />
      <Button type="submit" disabled={busy || password.length < 1}>
        {busy ? t("profile.saving") : t("profile.saveContact")}
      </Button>
    </form>
  );
}

function SecurityQuestionForm({
  const { t } = useT();
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
      <p className="text-sm text-muted">{t("profile.securitySeedHint")}</p>
      <div className="space-y-1.5">
        <Label htmlFor="sq">{t("profile.question")}</Label>
        <Input id="sq" value={question} onChange={(e) => setQuestion(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sa">{t("profile.newAnswer")}</Label>
        <Input id="sa" value={answer} onChange={(e) => setAnswer(e.target.value)} required />
      </div>
      <PasswordField id="sq-pw" label={t("profile.password")} value={password} onChange={setPassword} />
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
        {busy ? t("profile.saving") : "Update security question"}
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
  const { t } = useT();

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
      <h2 className="font-display text-lg font-semibold text-danger">{t("profile.deleteAccount")}</h2>
      {layer === 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">{t("profile.deletionHint")}</p>
          <Button variant="danger" className="mt-4" onClick={() => setLayer(1)}>
            {t("profile.startDeletion")}
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
              {t("common.cancel")}
            </Button>
            {layer < 3 ? (
              <Button variant="danger" className="flex-1" disabled={wait} onClick={() => setLayer((n) => n + 1)}>
                {wait ? t("profile.wait5") : "Continue"}
              </Button>
            ) : (
              <Button variant="danger" className="flex-1" disabled={wait || pin.length !== 4} onClick={() => void finish()}>
                {wait ? t("profile.wait5") : "Delete forever"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
