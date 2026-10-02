import { createMiddleware } from "@tanstack/react-start";

/**
 * Server-function middleware: resolves the caller's verified user id from the
 * session cookie and exposes it as `context.userId`. Every per-user query must
 * be scoped by that id — never by anything the client sends.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // Dynamic imports keep server-only modules out of the browser bundle.
  const { assertSameSiteRequest } = await import("./request-guard.server");
  const { requireUserId } = await import("./verify.server");
  assertSameSiteRequest();
  const userId = await requireUserId();
  return next({ context: { userId } });
});
