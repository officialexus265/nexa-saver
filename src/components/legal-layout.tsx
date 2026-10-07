import { Link } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="nexa-shell min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <BrandLockup compact />
          <ThemeToggle />
        </div>
        <h1 className="mt-8 font-display text-3xl font-semibold">{title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted [&_h2]:mt-6 [&_h2]:text-fg [&_ul]:my-2">
          {children}
        </div>
        <p className="mt-10 text-sm">
          <Link to="/" className="text-primary">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
