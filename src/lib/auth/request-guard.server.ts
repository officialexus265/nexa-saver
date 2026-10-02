import { getRequest } from "@tanstack/react-start/server";

export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/**
 * Defence in depth on top of SameSite=Lax cookies: reject scripted requests that
 * a browser reports as coming from another site. Same-origin requests, direct
 * navigations and non-browser clients (no Sec-Fetch-Site header) pass.
 */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return;
  const site = request.headers.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return;
  throw new CrossSiteRequestError();
}
