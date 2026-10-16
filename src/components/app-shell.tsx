import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { LayoutDashboard, Shield, UserRound, LogOut } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { ShareAppButton } from "@/components/share-app-button";
import { SiteFooter } from "@/components/site-footer";
import { PinGate } from "@/components/pin-gate";
import { signOut } from "@/lib/auth/client";
import type { PublicProfile } from "@/lib/nexa/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const ADMIN_PIN_KEY = "nexa-admin-pin-ok";
const ADMIN_PIN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function isAdminPinFresh(): boolean {
  try {
    const raw = sessionStorage.getItem(ADMIN_PIN_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < ADMIN_PIN_TTL_MS;
  } catch {
    return false;
  }
}

export function markAdminPinOk(): void {
  try {
    sessionStorage.setItem(ADMIN_PIN_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

export function clearAdminPin(): void {
  try {
    sessionStorage.removeItem(ADMIN_PIN_KEY);
  } catch {
    /* ignore */
  }
}

export function AppShell({
  profile,
  children,
}: {
  profile: PublicProfile;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isAdmin = profile.role === "admin";
  const { t } = useT();
  const [adminPinOpen, setAdminPinOpen] = useState(false);

  const goAdmin = useCallback(() => {
    if (isAdminPinFresh()) {
      void navigate({ to: "/admin" });
      return;
    }
    setAdminPinOpen(true);
  }, [navigate]);

  return (
    <div className="nexa-shell min-h-dvh pb-24 md:pb-8">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md">
        <BrandLockup compact />
        <div className="flex items-center gap-1.5 sm:gap-2">
          <LanguageSwitcher />
          <ThemeToggle className="h-9 px-2.5" />
          <div className="hidden md:block">
            <ShareAppButton variant="nav" label={t("nav.share")} />
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <NavLink to="/dashboard" current={pathname}>
              {t("nav.home")}
            </NavLink>
            <NavLink to="/profile" current={pathname}>
              {t("nav.profile")}
            </NavLink>
            {isAdmin ? (
              <button
                type="button"
                onClick={goAdmin}
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  pathname === "/admin" || pathname.startsWith("/admin/")
                    ? "bg-surface-2 text-fg"
                    : "text-muted hover:text-fg",
                )}
              >
                {t("nav.admin")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                clearAdminPin();
                void signOut("/").then(() => { window.location.href = "/"; });
              }}
              className="ml-2 inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted hover:text-fg"
            >
              <LogOut className="size-4" />
              {t("nav.signOut")}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      <SiteFooter className="mx-auto hidden max-w-3xl px-4 pb-4 text-center text-xs text-faint md:block" />

      <nav
        className={
          isAdmin
            ? "fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] pt-2 md:hidden"
            : "fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] pt-2 md:hidden"
        }
        aria-label="Primary"
      >
        <TabLink to="/dashboard" current={pathname} icon={<LayoutDashboard className="size-5" />} label={t("nav.home")} />
        <TabLink to="/profile" current={pathname} icon={<UserRound className="size-5" />} label={t("nav.profile")} />
        <ShareAppButton variant="tab" label={t("nav.share")} />
        {isAdmin ? (
          <button
            type="button"
            onClick={goAdmin}
            className={cn(
              "grid place-items-center gap-1 py-2 text-[11px]",
              pathname === "/admin" || pathname.startsWith("/admin/") ? "text-primary" : "text-muted",
            )}
          >
            <Shield className="size-5" />
            {t("nav.admin")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            clearAdminPin();
            void signOut("/").then(() => { window.location.href = "/"; });
          }}
          className="grid place-items-center gap-1 py-2 text-[11px] text-muted"
        >
          <LogOut className="size-5" />
          {t("nav.signOut")}
        </button>
      </nav>

      {adminPinOpen ? (
        <div className="fixed inset-0 z-50">
          <PinGate
            title={t("admin.pinTitle") || "Admin access"}
            subtitle={t("admin.pinSubtitle") || "Enter your PIN to open the admin console."}
            onUnlocked={() => {
              markAdminPinOk();
              setAdminPinOpen(false);
              void navigate({ to: "/admin" });
            }}
          />
          <button
            type="button"
            className="absolute right-4 top-4 z-[60] rounded-md bg-surface px-3 py-1.5 text-sm text-muted shadow"
            onClick={() => setAdminPinOpen(false)}
          >
            {t("common.cancel") || "Cancel"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NavLink({ to, current, children }: { to: string; current: string; children: React.ReactNode }) {
  const active = current === to || current.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={cn("rounded-md px-3 py-2 text-sm", active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}
    >
      {children}
    </Link>
  );
}

function TabLink({
  to,
  current,
  icon,
  label,
}: {
  to: string;
  current: string;
  icon: React.ReactNode;
  label: string;
}) {
  const active = current === to || current.startsWith(`${to}/`);
  return (
    <Link to={to} className={cn("grid place-items-center gap-1 py-2 text-[11px]", active ? "text-primary" : "text-muted")}>
      {icon}
      {label}
    </Link>
  );
}
