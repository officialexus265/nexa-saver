import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthFrame } from "@/components/auth-frame";
import { PasswordField } from "@/components/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LOGIN_PREF_LABEL, type LoginPref } from "@/lib/nexa/constants";
import { errMessage } from "@/lib/nexa/errors";
import { bootstrapAdmin, getMe, resolveSignInEmail } from "@/lib/nexa/fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: LoginPage });

function LoginPage() {
  const { t } = useT();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [pref, setPref] = useState<LoginPref>("username");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dest, setDest] = useState<"dashboard" | "signup" | "admin" | null>(null);

  useEffect(() => {
    void bootstrapAdmin().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        if (me.needsProfile) setDest("signup");
        else if (me.profile.role === "admin") setDest("admin");
        else setDest("dashboard");
      })
      .catch(() => {
        if (!cancelled) setDest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  if (!isPending && dest === "dashboard") return <Navigate to="/dashboard" />;
  if (!isPending && dest === "admin") return <Navigate to="/admin" />;
  if (!isPending && dest === "signup") return <Navigate to="/signup" />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { email } = await resolveSignInEmail({ data: { identifier } });
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message ?? t("auth.couldNotSignIn"));
      const me = await getMe();
      if (me.needsProfile) navigate({ to: "/signup" });
      else if (me.profile.role === "admin") navigate({ to: "/admin" });
      else navigate({ to: "/dashboard" });
    } catch (err) {
      setError(errMessage(err, t("auth.invalidCredentials")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame aside={t("auth.asideLogin")}>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("auth.signInTitle")}</h1>
          <p className="mt-1 text-sm text-muted">{t("auth.signInHint")}</p>
        </div>
        <div className="grid grid-cols-3 rounded-md bg-surface-2 p-1">
          {(Object.keys(LOGIN_PREF_LABEL) as LoginPref[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPref(key)}
              className={cn(
                "h-10 rounded-sm text-sm transition-colors duration-150",
                pref === key ? "bg-surface text-fg" : "text-muted",
              )}
            >
              {LOGIN_PREF_LABEL[key]}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="identifier">{LOGIN_PREF_LABEL[pref]}</Label>
          <Input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete={pref === "email" ? "username" : "username"}
            inputMode={pref === "phone" ? "tel" : "text"}
            placeholder={pref === "phone" ? "0881 234 567" : pref === "email" ? "you@email.com" : "yourname"}
            required
          />
        </div>
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} />
        <p className="text-right text-sm">
          <Link to="/forgot-password" className="text-muted hover:text-primary">
            {t("auth.forgotPassword")}
          </Link>
        </p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" loading={busy}>
          {busy ? t("auth.signingIn") : t("auth.enterVault")}
        </Button>
        <p className="text-center text-sm text-muted">
          {t("auth.noAccount")}{" "}
          <Link to="/signup" className="text-primary">
            {t("auth.createAccountLink")}
          </Link>
        </p>
      </form>
      <p className="mt-6 text-center text-xs text-faint">
        <Link to="/terms" className="hover:text-muted">
          Terms of use
        </Link>
        {" · "}
        <Link to="/conditions" className="hover:text-muted">
          Terms and conditions
        </Link>
        {" · "}
        <Link to="/privacy" className="hover:text-muted">
          Privacy
        </Link>
      </p>
    </AuthFrame>
  );
}
