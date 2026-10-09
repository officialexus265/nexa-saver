import { BrandLockup } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareAppButton } from "@/components/share-app-button";
import { SiteFooter } from "@/components/site-footer";
import { APP_TAGLINE } from "@/lib/nexa/constants";
import { TutorialsButton } from "@/components/tutorials-panel";

export function AuthFrame({
  children,
  aside,
  showTutorials,
}: {
  children: React.ReactNode;
  aside?: string;
  /** Sign-up: show Tutorials control near the brand (admin-configured videos). */
  showTutorials?: boolean;
}) {
  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ShareAppButton variant="pill" label="Share" />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="stagger-in mb-8 flex items-start justify-between gap-3">
          <div>
            <BrandLockup />
            <p className="mt-3 max-w-[22ch] text-sm text-muted">{aside ?? APP_TAGLINE}</p>
          </div>
          {showTutorials ? <TutorialsButton className="shrink-0 text-right" /> : null}
        </div>
        {children}
        <SiteFooter className="mt-8 text-center text-xs text-faint" />
      </div>
    </div>
  );
}
