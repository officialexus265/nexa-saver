import { useCallback, useEffect, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PinGate } from "@/components/pin-gate";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/password-field";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut as clientSignOut } from "@/lib/auth/client";
import { errMessage } from "@/lib/nexa/errors";
import { OfflineScreen, isLikelyOffline } from "@/components/offline-screen";
import { FocusTrap } from "@/components/focus-trap";
import { friendlyWebAuthnError } from "@/lib/nexa/webauthn-errors";
import { useT } from "@/lib/i18n/client";
import {
  adminVerifyTotp,
  adminWebAuthnAuthOptions,
  adminWebAuthnAuthVerify,
  userWebAuthnAuthOptions,
  userWebAuthnAuthVerify,
  userRequestPasskeyRecovery,
  userConfirmPasskeyRecovery,
  changePasswordFn,
  getMe,
  heartbeat,
  recordPageVisit,
} from "@/lib/nexa/fns";
import { I18nProvider } from "@/lib/i18n/client";
import { isAdminPinFresh, markAdminPinOk } from "@/components/app-shell";
import type { MeResponse, PublicProfile } from "@/lib/nexa/types";

export function SessionGate({
  children,
  admin,
}: {
  children: (ctx: {
    profile: PublicProfile;
    demoPayments: boolean;
    pinUnlocked: boolean;
    emailVerified: boolean;
    hasPasskey: boolean;
    lock: () => void;
    unlock: () => void;
  }) => React.ReactNode;
  admin?: boolean;
}) {
  const { user, isPending } = useCurrentUserState();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null); // null = not hydrated from server yet

  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);
  const [passkeyRecoverySent, setPasskeyRecoverySent] = useState<string | null>(null);
  const { t } = useT();


  const refresh = useCallback(async () => {
    try {
      const next = await getMe();
      setMe(next);
      setLoadError(null);
    } catch (err) {
      const message = errMessage(err);
      if (message === "Unauthorized") setMe(null);
      else setLoadError(message);
    }
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setLocked(null);
      setMe(null);
      return;
    }
    void refresh();
  }, [isPending, user, refresh]);

  // After sign-in / page load: no PIN gate. Password session is enough to use the app.
  // PIN appears only when idle/instant lock rules fire (or user locks). Balance still needs PIN to reveal.

  useEffect(() => {
    if (!me || me.needsProfile) return;
    void recordPageVisit({ data: { path: window.location.pathname } }).catch(() => {});
  }, [me]);

  useEffect(() => {
    if (!me || me.needsProfile) return;
    setLocked((prev) => (prev === null ? false : prev));
  }, [me]);

  useEffect(() => {
    if (!me || me.needsProfile) return;
    const lockMode =
      me.profile.lockMode === "instant"
        ? "instant"
        : me.profile.lockMode === "off"
          ? "off"
          : "idle";
    const idleMs = Math.max(1, me.profile.lockIdleMinutes ?? 5) * 60 * 1000;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

    // No auto PIN lock when user chose "Do not lock".
    if (lockMode === "off") {
      setLocked(false);
      return;
    }

    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const idle = window.setInterval(() => {
      if (lockMode === "idle" && Date.now() - last >= idleMs) setLocked(true);
    }, 1000);

    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") void heartbeat().catch(() => undefined);
    }, 120_000);

    const vis = () => {
      if (document.visibilityState === "hidden") {
        // Instant mode: lock as soon as the app is backgrounded.
        // Idle mode: only lock if the idle window already elapsed while hidden.
        if (lockMode === "instant") setLocked(true);
        else if (Date.now() - last >= idleMs) setLocked(true);
        return;
      }
      if (lockMode === "idle" && Date.now() - last >= idleMs) setLocked(true);
    };
    document.addEventListener("visibilitychange", vis);

    const onPageHide = () => {
      if (lockMode === "instant") setLocked(true);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(idle);
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [me]);

  if (isPending || (user && !me && !loadError)) {
    return <ShellSkeleton />;
  }
  if (!user) return <Navigate to="/" />;
  if (loadError === "Unauthorized") return <Navigate to="/" />;
  if (loadError) {
    if (isLikelyOffline(loadError) || typeof navigator !== "undefined" && !navigator.onLine) {
      return <OfflineScreen message={loadError} onRetry={() => void refresh()} />;
    }
    return (
      <div className="nexa-shell grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="font-display text-xl font-semibold">{t("session.couldNotLoad")}</h1>
          <p className="text-sm text-muted">{loadError}</p>
          <Button className="w-full" onClick={() => void refresh()}>
            {t("session.tryAgain")}
          </Button>
        </div>
      </div>
    );
  }
  if (!me) return <Navigate to="/" />;
  if (me.needsProfile) return <Navigate to="/signup" />;
  if (admin && me.profile.role !== "admin") return <Navigate to="/dashboard" />;
  // Admin console requires a fresh PIN unlock (Home stays open without this).
  if (admin && me.profile.role === "admin" && !isAdminPinFresh()) {
    return (
      <I18nProvider>
        <PinGate
          title={t("admin.pinTitle") || "Admin access"}
          subtitle={t("admin.pinSubtitle") || "Enter your PIN to open the admin console."}
          onUnlocked={() => {
            markAdminPinOk();
            // stay on current admin URL
          }}
        />
      </I18nProvider>
    );
  }
  if (me.profile.adminLocked) {
    return (
      <I18nProvider><AppShell profile={me.profile}>
        <div className="mx-auto max-w-md space-y-4 p-6 text-center">
          <h1 className="font-display text-2xl font-semibold">{t("session.accountLocked")}</h1>
          <p className="text-sm text-muted">
            This account was locked by platform support
            {me.profile.adminLockReason ? `: ${me.profile.adminLockReason}` : "."} Contact support to
            recover access. Sessions were signed out when the account was locked.
          </p>
          <Button
            className="w-full"
            onClick={() => { try { sessionStorage.removeItem("nexa-admin-pin-ok"); } catch {} setLocked(false); void clientSignOut().then(() => { window.location.href = "/"; }); }}
          >
            {t("nav.signOut")}
          </Button>
        </div>
      </AppShell></I18nProvider>
    );
  }
  if (locked === null) return <ShellSkeleton />;

  const profile = me.profile;

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwError(null);
    try {
      await changePasswordFn({ data: { currentPassword: pw.current, newPassword: pw.next } });
      // All sessions revoked — send them to sign in with the new password.
      window.location.href = "/";
      return;
    } catch (err) {
      setPwError(errMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <I18nProvider><AppShell profile={profile}>
      {children({
        profile,
        demoPayments: me.demoPayments,
        pinUnlocked: locked === false,
        emailVerified: Boolean(!me.needsProfile && me.emailVerified),
        hasPasskey: Boolean(!me.needsProfile && me.hasPasskey),
        lock: () => setLocked(true),
        unlock: () => setLocked(false),
      })}
      
      {!me.needsProfile && me.profile.role === "admin" && me.needsAdminTotp ? (
        <FocusTrap label={t("session.adminVerification")} className="grid place-items-center bg-bg p-5">
          {(() => {
            const showPasskey = Boolean(me.adminHasPasskey);
            const showTotp = Boolean(me.adminTotpEnabled);
            const title = showPasskey && !showTotp
              ? t("session.securityKey")
              : showTotp && !showPasskey
                ? t("session.authenticatorCode")
                : "Admin verification";
            const hint = showPasskey && showTotp
              ? t("session.useKeyOrCode")
              : showPasskey
                ? t("session.touchKey")
                : "Enter the 6-digit code from your authenticator app, or a one-time backup code.";
            return (
          <form
            className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!showTotp) return;
              setTotpBusy(true);
              setTotpError(null);
              void adminVerifyTotp({ data: { code: totpCode } })
                .then(() => {
                  setTotpCode("");
                  return refresh();
                })
                .catch((err) => setTotpError(errMessage(err)))
                .finally(() => setTotpBusy(false));
            }}
          >
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{t("session.admin2fa")}</p>
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <p className="text-sm text-muted">{hint}</p>
            {showPasskey ? (
            <Button
              type="button"
              className="w-full"
              disabled={totpBusy}
              onClick={() => {
                setTotpBusy(true);
                setTotpError(null);
                void (async () => {
                  try {
                    const opts = await adminWebAuthnAuthOptions();
                    const { startAuthentication } = await import("@simplewebauthn/browser");
                    const assertion = await startAuthentication({ optionsJSON: opts });
                    await adminWebAuthnAuthVerify({ data: { response: assertion } });
                    await refresh();
                  } catch (err) {
                    setTotpError(friendlyWebAuthnError(err));
                  } finally {
                    setTotpBusy(false);
                  }
                })();
              }}
            >
              {totpBusy ? t("passkey.waiting") : t("passkey.useKey")}
            </Button>
            ) : null}
            {showPasskey && showTotp ? (
            <div className="relative py-1 text-center text-xs text-muted">
              <span className="bg-surface px-2">{t("session.orAuthCode")}</span>
            </div>
            ) : null}
            {showTotp ? (
            <>
            <input
              className="flex h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-center text-lg tracking-[0.3em] tabular-nums"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, "").slice(0, 16))}
              placeholder="000000"
            />
            <Button type="submit" className="w-full" disabled={totpBusy || totpCode.length < 6}>
              {totpBusy ? t("session.checking") : "Verify code"}
            </Button>
            </>
            ) : null}
            {totpError ? <p className="text-sm text-danger">{totpError}</p> : null}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => { try { sessionStorage.removeItem("nexa-admin-pin-ok"); } catch {} setLocked(false); void clientSignOut().then(() => { window.location.href = "/"; }); }}
            >
              {t("nav.signOut")}
            </Button>
          </form>
            );
          })()}
        </FocusTrap>
      ) : null}

      
      {!me.needsProfile && me.profile.role !== "admin" && me.needsUserPasskey ? (
        <FocusTrap label={t("session.passkeyVerification")} className="grid place-items-center bg-bg p-5">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{t("session.extraSecurity")}</p>
            <h2 className="font-display text-2xl font-semibold">{t("passkey.challengeTitle")}</h2>
            <p className="text-sm text-muted">{t("passkey.challengeBody")}</p>
            {totpError ? <p className="text-sm text-danger">{totpError}</p> : null}
            <Button
              type="button"
              className="w-full"
              disabled={totpBusy}
              onClick={() => {
                setTotpBusy(true);
                setTotpError(null);
                void (async () => {
                  try {
                    const opts = await userWebAuthnAuthOptions();
                    const { startAuthentication } = await import("@simplewebauthn/browser");
                    const assertion = await startAuthentication({ optionsJSON: opts });
                    await userWebAuthnAuthVerify({ data: { response: assertion } });
                    await refresh();
                  } catch (err) {
                    setTotpError(friendlyWebAuthnError(err));
                  } finally {
                    setTotpBusy(false);
                  }
                })();
              }}
            >
              {totpBusy ? t("passkey.waiting") : t("passkey.useKey")}
            </Button>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs text-muted">{t("passkey.recoveryHint")}</p>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={totpBusy}
                onClick={() => {
                  setTotpBusy(true);
                  setTotpError(null);
                  void userRequestPasskeyRecovery()
                    .then((r) => {
                      setTotpError(null);
                      setPasskeyRecoverySent(r.emailMasked);
                    })
                    .catch((err) => setTotpError(errMessage(err)))
                    .finally(() => setTotpBusy(false));
                }}
              >
                {t("passkey.emailCode")}
              </Button>
              {passkeyRecoverySent ? (
                <>
                  <p className="text-xs text-muted">{t("passkey.recoverySent", { email: passkeyRecoverySent })}</p>
                  <input
                    className="flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-center tracking-widest"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, "").slice(0, 8))}
                    placeholder={t("passkey.recoveryPlaceholder")}
                  />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={totpBusy || totpCode.length < 6}
                    onClick={() => {
                      setTotpBusy(true);
                      setTotpError(null);
                      void userConfirmPasskeyRecovery({ data: { code: totpCode } })
                        .then(() => {
                          setTotpCode("");
                          setPasskeyRecoverySent(null);
                          return refresh();
                        })
                        .catch((err) => setTotpError(errMessage(err)))
                        .finally(() => setTotpBusy(false));
                    }}
                  >
                    {t("passkey.removeAndContinue")}
                  </Button>
                </>
              ) : null}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => { try { sessionStorage.removeItem("nexa-admin-pin-ok"); } catch {} setLocked(false); void clientSignOut().then(() => { window.location.href = "/"; }); }}
            >
              {t("nav.signOut")}
            </Button>
          </div>
        </FocusTrap>
      ) : null}

      {profile.mustChangePassword ? (
        <FocusTrap label={t("session.setNewPassword")} className="grid place-items-center bg-bg p-5">
          <form onSubmit={savePassword} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{t("session.firstLogin")}</p>
            <h2 className="font-display text-2xl font-semibold">{t("session.changeDefaultPw")}</h2>
            <p className="text-sm text-muted">
              {t("session.firstLoginPw")}
            </p>
            <PasswordField
              id="cur-pw"
              label={t("session.currentPassword")}
              value={pw.current}
              onChange={(v) => setPw((p) => ({ ...p, current: v }))}
            />
            <PasswordField
              id="new-pw"
              label={t("session.newPassword")}
              value={pw.next}
              onChange={(v) => setPw((p) => ({ ...p, next: v }))}
              autoComplete="new-password"
            />
            {pwError ? <p className="text-sm text-danger">{pwError}</p> : null}
            <Button type="submit" className="w-full" loading={pwBusy} disabled={pwBusy || pw.next.length < 8}>
              {pwBusy ? t("session.savingPassword") : "Save password"}
            </Button>
          </form>
        </FocusTrap>
      ) : null}
      {user && locked === true && !profile.mustChangePassword ? (
        <PinGate
          subtitle={
            profile.lockMode === "instant"
              ? t("session.lockOnLeave")
              : profile.lockMode === "off"
                ? t("session.autoLockOff")
                : `After ${profile.lockIdleMinutes ?? 5} minute${(profile.lockIdleMinutes ?? 5) === 1 ? "" : "s"} of quiet, NEXA locks the vault.`
          }
          onUnlocked={() => {
            setLocked(false);
            void refresh();
          }}
        />
      ) : null}
    </AppShell></I18nProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="font-display text-lg font-semibold text-fg">{t("session.vaultLoading")}</p>
        <p className="text-sm text-muted">{t("session.checkingSession")}</p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="vault-load-bar h-full rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}
