import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { PwaPrompt } from "@/components/pwa-prompt";
import { THEME_BOOT_SCRIPT } from "@/components/theme-toggle";
import { I18nProvider } from "@/lib/i18n/client";
import { PwaRegister } from "@/components/pwa-register";
import { APP_NAME } from "@/lib/nexa/constants";
import appCss from "../styles.css?url";

const APP_TITLE = APP_NAME;
const DESCRIPTION = "NEXA-SAVER — a quiet Malawi kwacha vault with PIN-locked balances.";
// Optional: set VITE_SITE_URL (e.g. https://nexa-saver.vercel.app) so link previews get an absolute image URL.
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export const Route = createRootRoute({
  notFoundComponent: () => (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">This link is missing or expired.</p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary">
          Back to NEXA-SAVER
        </Link>
      </div>
    </div>
  ),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "format-detection", content: "telephone=no" },
      { title: APP_TITLE },
      { name: "theme-color", content: "#07110e" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: APP_TITLE },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: APP_TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: `${SITE_URL}/og.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider>
          <Outlet />
          <PwaPrompt />
          <PwaRegister />
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  ),
});
