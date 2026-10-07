export const APP_NAME = "NEXA-SAVER";
export const APP_TAGLINE = "Quiet money. Clear control.";

export const IDLE_LOCK_MS = 5 * 60 * 1000;
export const SESSION_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
export const PIN_VERIFY_WINDOW_MS = 5 * 60 * 1000;
export const PIN_MAX_ATTEMPTS = 5;
/** Base lock after first trip of max attempts; escalates 5m → 1h → 24h. */
export const PIN_LOCK_MS = 5 * 60 * 1000;
export const PIN_LOCK_ESCALATION_MS = [5 * 60 * 1000, 60 * 60 * 1000, 24 * 60 * 60 * 1000] as const;
export const SUCCESS_TOAST_MS = 3000;
export const DELETE_LAYER_WAIT_MS = 5000;

export const MIN_DEPOSIT_KWACHA = 100;
export const MIN_WITHDRAW_KWACHA = 50;
/** PayChangu bank payout flat fee (MWK). Deducted from the user's requested amount so they receive request − 700. Not a NEXA fee. */
export const BANK_FLAT_FEE_KWACHA = 700;
export const MIN_BANK_WITHDRAW_KWACHA = MIN_WITHDRAW_KWACHA + BANK_FLAT_FEE_KWACHA;

export const DEPOSIT_FEE_RATE = 0.06;
export const PLATFORM_PROFIT_RATE = 0.03;
export const PAYOUT_FEE_RATE = 0.03;

/**
 * Daily withdrawal limits (calendar day, Africa/Blantyre).
 *
 *   Start:                 100,000 MWK
 *   After 14 days (auto):  250,000 MWK
 *   Then only if the user withdraws close to the current limit (≥ NEAR_LIMIT_RATIO)
 *   and has been on that tier for at least TIER_HOLD_DAYS:
 *     250k → 350k → 500k → 800k → 1,000,000 (final automatic)
 *   Above the final tier in a single day → contact platform support phone.
 */
export const WITHDRAW_CAP_LADDER_KWACHA = [100_000, 250_000, 350_000, 500_000, 800_000, 1_000_000] as const;
export const STARTING_DAILY_WITHDRAW_CAP_KWACHA = WITHDRAW_CAP_LADDER_KWACHA[0];
export const AUTO_RAISE_AFTER_DAYS = 14;
export const AUTO_RAISE_CAP_KWACHA = WITHDRAW_CAP_LADDER_KWACHA[1]; // 250k
export const TIER_HOLD_DAYS = 31;
/** Fraction of current daily cap that counts as a "near-limit" withdrawal (e.g. 0.9 = 90%). */
export const NEAR_LIMIT_RATIO = 0.9;
export const FINAL_DAILY_WITHDRAW_CAP_KWACHA = WITHDRAW_CAP_LADDER_KWACHA[WITHDRAW_CAP_LADDER_KWACHA.length - 1];
export const NEW_ACCOUNT_WITHDRAW_HOLD_MS = 24 * 60 * 60 * 1000;
export const PIN_RESET_WITHDRAW_HOLD_MS = 24 * 60 * 60 * 1000;
export const PHONE_CHANGE_WITHDRAW_HOLD_MS = 72 * 60 * 60 * 1000;
export const BUSINESS_TZ = "Africa/Blantyre";
export const PLATFORM_SUPPORT_PHONE_KEY = "support_phone";

export const ADMIN_USERNAME = "admin";
export const ADMIN_EMAIL = "admin@nexa-saver.app";
export const ADMIN_USER_ID = "nexa-admin";

export const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "In which city were you born?",
  "What was the name of your first school?",
  "What is your favourite teacher's surname?",
] as const;

export type LoginPref = "username" | "email" | "phone";

export const LOGIN_PREF_LABEL: Record<LoginPref, string> = {
  username: "Username",
  email: "Email",
  phone: "Phone",
};


export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;
export type Gender = (typeof GENDER_OPTIONS)[number]["value"];


export const LOCK_MODE_OPTIONS = [
  { value: "idle", label: "After idle time" },
  { value: "instant", label: "When I leave the app" },
  { value: "off", label: "Do not lock" },
] as const;
export type LockMode = (typeof LOCK_MODE_OPTIONS)[number]["value"];
export const DEFAULT_LOCK_IDLE_MINUTES = 5;
export const MIN_LOCK_IDLE_MINUTES = 1;
export const MAX_LOCK_IDLE_MINUTES = 60;


/** Voluntary withdrawal time-lock (commitment feature). */
export const WITHDRAW_LOCK_COOLING_OFF_MS = 48 * 60 * 60 * 1000;
export const WITHDRAW_LOCK_MAX_YEARS = 5;
export const WITHDRAW_LOCK_LONG_YEARS = 2;
/** Max early-unlock fee as fraction of vault balance. */
export const EARLY_UNLOCK_FEE_CAP_RATE = 0.05;
/** Base early-unlock fee rate scaled by remaining lock fraction. */
export const EARLY_UNLOCK_FEE_BASE_RATE = 0.03;
