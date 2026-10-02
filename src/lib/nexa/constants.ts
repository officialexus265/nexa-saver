export const APP_NAME = "NEXA-SAVER";
export const APP_TAGLINE = "Quiet money. Clear control.";

export const IDLE_LOCK_MS = 5 * 60 * 1000;
export const SESSION_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
export const PIN_VERIFY_WINDOW_MS = 5 * 60 * 1000;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60 * 1000;
export const SUCCESS_TOAST_MS = 3000;
export const DELETE_LAYER_WAIT_MS = 5000;

export const MIN_DEPOSIT_KWACHA = 100;
export const MIN_WITHDRAW_KWACHA = 50;
export const DEPOSIT_FEE_RATE = 0.06;
export const PLATFORM_PROFIT_RATE = 0.03;
export const PAYOUT_FEE_RATE = 0.03;

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
