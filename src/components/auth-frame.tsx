import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareAppButton } from "@/components/share-app-button";
import { SiteFooter } from "@/components/site-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { APP_TAGLINE } from "@/lib/nexa/constants";
import { TutorialsButton } from "@/components/tutorials-panel";
import { getPublicLaunchInfo } from "@/lib/nexa/fns";


export function AuthFrame({
  children,
  aside,
  showTutorials,
}: {
  children: React.ReactNode;
  aside?: string;
  /** Sign-up: show “Not familiar…” when admin enables tutorials feature. */
  showTutorials?: boolean;
}) {
  const [banner, setBanner] = useState("");
  useEffect(() => {
    void getPublicLaunchInfo()
      .then((i) => setBanner(i.publicBanner || ""))
      .catch(() => setBanner(""));
  }, []);
  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ShareAppButton variant="pill" label="Share" />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        {banner ? (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-fg">
            {banner}
          </div>
        ) : null}
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
