import { BrandLockup } from "@/components/brand";
import { APP_TAGLINE } from "@/lib/nexa/constants";

export function AuthFrame({ children, aside }: { children: React.ReactNode; aside?: string }) {
  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="stagger-in mb-8">
          <BrandLockup />
          <p className="mt-3 max-w-[22ch] text-sm text-muted">{aside ?? APP_TAGLINE}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
