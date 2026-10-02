import { createAuthClient } from "better-auth/react";

/** Better Auth browser client — talks to this app's own `/api/auth/*` (same origin). */
export const authClient = createAuthClient();

/** Sign out, then hard-redirect (clears all in-memory state). */
export async function signOut(redirectTo = "/"): Promise<void> {
  try {
    const { error } = await authClient.signOut();
    if (error) throw new Error(error.message ?? "Sign-out failed");
  } finally {
    window.location.href = redirectTo;
  }
}
