import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  // No Google Fonts / third-party scripts. PayChangu API only for server-side fetch
  // (browser connects to same origin). unsafe-inline kept for Vite/React hydration styles.
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
};

export default defineConfig(({ command }) => ({
  server: { host: "0.0.0.0", port: 3000 },
  preview: { host: "127.0.0.1", port: 4173 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // Nitro turns the build into a Vercel deployment (Build Output API).
    ...(command === "build"
      ? [
          nitro({
            preset: "vercel",
            routeRules: {
              "/**": { headers: securityHeaders },
              // The service worker must always be revalidated so updates roll out.
              "/sw.js": { headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } },
              "/manifest.webmanifest": { headers: { "Content-Type": "application/manifest+json" } },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
