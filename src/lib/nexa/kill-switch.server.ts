import { env } from "@/lib/env.server";

/** Instant pause for deposits / withdrawals via env flags (no deploy of code needed on Vercel). */
export function depositsPaused(): boolean {
  return env("NEXA_PAUSE_DEPOSITS") === "true" || env("NEXA_PAUSE_ALL") === "true";
}

export function withdrawalsPaused(): boolean {
  return env("NEXA_PAUSE_WITHDRAWALS") === "true" || env("NEXA_PAUSE_ALL") === "true";
}

export function assertDepositsAllowed(): void {
  if (depositsPaused()) {
    throw new Error("Deposits are temporarily paused. Please try again later.");
  }
}

export function assertWithdrawalsAllowed(): void {
  if (withdrawalsPaused()) {
    throw new Error("Withdrawals are temporarily paused. Your balance was not touched.");
  }
}
