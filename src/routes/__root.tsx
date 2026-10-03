import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { PwaPrompt } from "@/components/pwa-prompt";
import { PwaRegister } from "@/components/pwa-register";
import { APP_NAME } from "@/lib/nexa/constants";
import appCss from "../styles.css?url";

const APP_TITLE = APP_NAME;
const DESCRIPTION = "NEXA-SAVER — a quiet Malawi kwacha vault with PIN-locked balances.";
// Optional: set VITE_SITE_URL (e.g. https://nexa-saver.vercel.app) so link previews get an absolute image URL.
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
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
      </head>
      <body>
        <Outlet />
        <PwaPrompt />
        <PwaRegister />
        <Scripts />
      </body>
    </html>
  ),
});
