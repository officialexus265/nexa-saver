/** Friendly WebAuthn / passkey errors — never surface W3C or stack links to users. */
export function friendlyWebAuthnError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const name = err instanceof Error ? err.name : "";
  const lower = `${name} ${raw}`.toLowerCase();

  if (
    lower.includes("notallowed") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("not allowed") ||
    lower.includes("privacy-considerations") ||
    lower.includes("w3.org")
  ) {
    return "The security key step was cancelled or timed out. Try again, or use recovery if this is not your usual device.";
  }
  if (lower.includes("invalidstate") || lower.includes("already registered")) {
    return "That key is already registered on this account.";
  }
  if (lower.includes("security") && lower.includes("error")) {
    return "This browser or site cannot use a security key right now. Try Chrome/Safari on HTTPS, or another device.";
  }
  if (lower.includes("abort")) {
    return "Cancelled. You can try again when ready.";
  }
  if (lower.includes("credential") && lower.includes("not found")) {
    return "No matching security key on this device. Use the device where you set it up, or recover by email.";
  }
  if (lower.includes("no security key registered") || lower.includes("no security key")) {
    return "No security key is registered on this account yet.";
  }
  if (lower.includes("challenge expired")) {
    return "That step expired. Tap the button again.";
  }
  // Strip URLs from any remaining message
  const stripped = raw.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (stripped.length > 8 && stripped.length < 160 && !stripped.includes("http")) {
    return stripped;
  }
  return "Could not complete the security key step. Try again, or recover access by email if you are on a new device.";
}
