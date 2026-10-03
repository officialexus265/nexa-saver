import { useCallback, useEffect, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PinGate } from "@/components/pin-gate";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/password-field";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { IDLE_LOCK_MS } from "@/lib/nexa/constants";
import { errMessage } from "@/lib/nexa/errors";
import { changePasswordFn, getMe, heartbeat } from "@/lib/nexa/fns";
import type { MeResponse, PublicProfile } from "@/lib/nexa/types";

export function SessionGate({
  children,
  admin,
}: {
  children: (ctx: {
    profile: PublicProfile;
    demoPayments: boolean;
    pinUnlocked: boolean;
    lock: () => void;
    unlock: () => void;
  }) => React.ReactNode;
  admin?: boolean;
}) {
  const { user, isPending } = useCurrentUserState();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

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
    if (!user) return;
    void refresh();
  }, [isPending, user, refresh]);

  useEffect(() => {
    if (!me || me.needsProfile) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const idle = window.setInterval(() => {
      if (Date.now() - last >= IDLE_LOCK_MS) setLocked(true);
    }, 1000);
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") void heartbeat().catch(() => undefined);
    }, 120_000);
    const vis = () => {
      // iOS Safari standalone often suspends without reliable idle timers.
      // Lock as soon as the app is backgrounded so the PIN gate is required on return.
      if (document.visibilityState === "hidden") {
        setLocked(true);
        return;
      }
      if (Date.now() - last >= IDLE_LOCK_MS) setLocked(true);
    };
    document.addEventListener("visibilitychange", vis);
    const onPageHide = () => setLocked(true);
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
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="text-sm text-danger">{loadError}</p>
      </div>
    );
  }
  if (!me) return <Navigate to="/" />;
  if (me.needsProfile) return <Navigate to="/signup" />;
  if (admin && me.profile.role !== "admin") return <Navigate to="/dashboard" />;

  const profile = me.profile;

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwError(null);
    try {
      await changePasswordFn({ data: { currentPassword: pw.current, newPassword: pw.next } });
      await refresh();
    } catch (err) {
      setPwError(errMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <AppShell profile={profile}>
      {children({
        profile,
        demoPayments: me.demoPayments,
        pinUnlocked: !locked,
        lock: () => setLocked(true),
        unlock: () => setLocked(false),
      })}
      {profile.mustChangePassword ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/92 p-5">
          <form onSubmit={savePassword} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">First login</p>
            <h2 className="font-display text-2xl font-semibold">Change the default password</h2>
            <p className="text-sm text-muted">
              Admin access starts with a throwaway password. Set a strong one before you continue.
            </p>
            <PasswordField
              id="cur-pw"
              label="Current password"
              value={pw.current}
              onChange={(v) => setPw((p) => ({ ...p, current: v }))}
            />
            <PasswordField
              id="new-pw"
              label="New password"
              value={pw.next}
              onChange={(v) => setPw((p) => ({ ...p, next: v }))}
              autoComplete="new-password"
            />
            {pwError ? <p className="text-sm text-danger">{pwError}</p> : null}
            <Button type="submit" className="w-full" disabled={pwBusy || pw.next.length < 8}>
              Save password
            </Button>
          </form>
        </div>
      ) : null}
      {locked && !profile.mustChangePassword ? (
        <PinGate
          onUnlocked={() => {
            setLocked(false);
            void refresh();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function ShellSkeleton() {
  return (
    <div className="nexa-shell min-h-dvh p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-12 w-40 rounded-md bg-surface-2 shimmer" />
        <div className="h-48 rounded-2xl bg-surface-2 shimmer" />
        <div className="h-32 rounded-2xl bg-surface-2 shimmer" />
      </div>
    </div>
  );
}
