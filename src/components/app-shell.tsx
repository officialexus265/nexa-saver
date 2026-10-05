import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Shield, UserRound, LogOut } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { signOut } from "@/lib/auth/client";
import type { PublicProfile } from "@/lib/nexa/types";
import { cn } from "@/lib/utils";

export function AppShell({
  profile,
  children,
}: {
  profile: PublicProfile;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = profile.role === "admin";

  return (
    <div className="nexa-shell min-h-dvh pb-24 md:pb-8">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md">
        <BrandLockup compact />
        <div className="hidden items-center gap-1 md:flex">
          <NavLink to="/dashboard" current={pathname}>
            Home
          </NavLink>
          <NavLink to="/profile" current={pathname}>
            Profile
          </NavLink>
          {isAdmin ? (
            <NavLink to="/admin" current={pathname}>
              Admin
            </NavLink>
          ) : null}
          <button
            type="button"
            onClick={() => signOut("/")}
            className="ml-2 inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted hover:text-fg"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-28 md:pb-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 md:hidden">
        <TabLink to="/dashboard" current={pathname} icon={<LayoutDashboard className="size-5" />} label="Home" />
        <TabLink to="/profile" current={pathname} icon={<UserRound className="size-5" />} label="Profile" />
        {isAdmin ? (
          <TabLink to="/admin" current={pathname} icon={<Shield className="size-5" />} label="Admin" />
        ) : (
          <button
            type="button"
            onClick={() => signOut("/")}
            className="grid place-items-center gap-1 py-2 text-[11px] text-muted"
          >
            <LogOut className="size-5" />
            Sign out
          </button>
        )}
      </nav>
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
