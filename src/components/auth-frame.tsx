import { BrandLockup } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareAppButton } from "@/components/share-app-button";
import { SiteFooter } from "@/components/site-footer";
import { APP_TAGLINE } from "@/lib/nexa/constants";

export function AuthFrame({ children, aside }: { children: React.ReactNode; aside?: string }) {
  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ShareAppButton variant="pill" label="Share" />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="stagger-in mb-8">
          <BrandLockup />
          <p className="mt-3 max-w-[22ch] text-sm text-muted">{aside ?? APP_TAGLINE}</p>
        </div>
        {children}
        <SiteFooter className="mt-8 text-center text-xs text-faint" />
      </div>
    </div>
  );
}
