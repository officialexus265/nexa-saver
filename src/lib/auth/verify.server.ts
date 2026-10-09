import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./server";

/** Thrown when the caller has no valid session. The message is a stable contract ("Unauthorized"). */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = {
  id: string;
  email: string | null;
  /** Stable id for this browser session — used for admin 2FA elevation binding */
  sessionToken: string | null;
};

function tokenFromSession(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const s = session as {
    session?: { token?: string; id?: string };
    token?: string;
  };
  if (s.session?.token) return String(s.session.token);
  if (s.session?.id) return String(s.session.id);
  if (s.token) return String(s.token);
  return null;
}

/** Resolve the signed-in user from the request cookies, or null. Never trusts client-supplied ids. */
export async function getSessionUser(): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  let token = tokenFromSession(session);
  if (!token) {
    // Fallback: hash the session cookie so elevation is still per-browser-session.
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/(?:^|;\s*)(?:better-auth\.session_token|__Secure-better-auth\.session_token)=([^;]+)/);
    if (match?.[1]) {
      token = createHash("sha256").update(decodeURIComponent(match[1])).digest("hex").slice(0, 48);
    }
  }
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    sessionToken: token,
  };
}

/** The verified user id for a server function, or throw `UnauthorizedError`. */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

export async function requireSessionToken(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.sessionToken;
}
