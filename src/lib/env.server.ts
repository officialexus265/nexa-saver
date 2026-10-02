/** Read an environment variable, treating empty/whitespace as unset. */
export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** Evaluated at call time so behaviour always follows the current NODE_ENV. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
