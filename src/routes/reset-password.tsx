import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
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
  const { t } = useT();
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
      setError(t("auth.passwordsMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.min8"));
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
        <p className="text-sm text-muted">{t("auth.resetChecking")}</p>
      </AuthFrame>
    );
  }

  if (state === "invalid") {
    return (
      <AuthFrame>
        <h1 className="font-display text-2xl font-semibold">{t("auth.linkExpired")}</h1>
        <p className="mt-3 text-sm text-muted">{t("auth.invalidResetLink")}</p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary">
          {t("auth.backToSignIn")}
        </Link>
      </AuthFrame>
    );
  }

  if (state === "done") {
    return (
      <AuthFrame>
        <h1 className="font-display text-2xl font-semibold">{t("auth.passwordUpdated")}</h1>
        <p className="mt-3 text-sm text-muted">{t("auth.passwordChangedAllOut")}</p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary">
          {t("auth.signIn")}
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <h1 className="font-display text-2xl font-semibold">{t("auth.chooseNewPassword")}</h1>
      <p className="mt-2 text-sm text-muted">{t("auth.resetHintLong")}</p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
        <PasswordField
          id="new-pw"
          label=t("auth.newPassword")
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirm-pw"
          label=t("auth.confirmNewPassword")
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" loading={busy} disabled={busy || password.length < 8}>
          {busy ? t("auth.updatingPassword") : "Update password"}
        </Button>
      </form>
    </AuthFrame>
  );
}
