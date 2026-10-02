import { authClient } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
};

export type CurrentUserState = {
  /** `null` both while the session loads and when signed out — check `isPending`. */
  user: AppUser | null;
  isPending: boolean;
};

/** Current user + loading flag. Don't redirect on `user: null` until `isPending` is false. */
export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  return {
    user: user ? { id: user.id, displayName: user.name ?? null, primaryEmail: user.email ?? null } : null,
    isPending,
  };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
