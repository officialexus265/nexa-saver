import { getRequest } from "@tanstack/react-start/server";
import { env, isProduction } from "@/lib/env.server";

export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden: cross-site request blocked") {
    super(message);
    this.name = "CrossSiteRequestError";
  }
}

function expectedOrigins(): string[] {
  const out: string[] = [];
  const authUrl = env("BETTER_AUTH_URL");
  if (authUrl) {
    try {
      out.push(new URL(authUrl).origin);
    } catch {
      /* */
    }
  }
  const site = env("VITE_SITE_URL") || env("SITE_URL");
  if (site) {
    try {
      out.push(new URL(site).origin);
    } catch {
      /* */
    }
  }
  const vercel = env("VERCEL_URL");
  if (vercel) out.push(`https://${vercel.replace(/^https?:\/\//, "")}`);
  const prod = env("VERCEL_PROJECT_PRODUCTION_URL");
  if (prod) out.push(`https://${prod.replace(/^https?:\/\//, "")}`);
  return [...new Set(out.filter(Boolean))];
}

/**
 * Defence in depth on top of SameSite=Lax cookies:
 * 1) Sec-Fetch-Site must not be cross-site when present
 * 2) In production, if Origin is present it must match our known hosts
 */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return;

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none" && site !== "same-site") {
    throw new CrossSiteRequestError();
  }

  if (!isProduction()) return;

  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser / same-origin navigations often omit Origin on GET; server fns are POST

  const allowed = expectedOrigins();
  if (!allowed.length) return; // misconfigured env — do not lock everyone out

  try {
    const o = new URL(origin).origin;
    if (!allowed.includes(o)) {
      throw new CrossSiteRequestError("Forbidden: origin not allowed");
    }
  } catch (err) {
    if (err instanceof CrossSiteRequestError) throw err;
    throw new CrossSiteRequestError("Forbidden: invalid origin");
  }
}
