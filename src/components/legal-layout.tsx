import { Link } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand";

export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="nexa-shell min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <BrandLockup compact />
        <h1 className="mt-8 font-display text-3xl font-semibold">{title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">{children}</div>
        <p className="mt-10 text-sm">
          <Link to="/" className="text-primary">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
