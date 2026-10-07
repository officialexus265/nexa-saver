/**
 * Source-of-truth English UI strings for the whole front end.
 *
 * Each value is a FULL phrase as shown on screen (sentence / button label / hint).
 * Translators replace the whole string with a natural equivalent in the target language
 * (e.g. "I want tea" → "Ndikufuna tiyi"), never word-by-word glosses.
 *
 * Admin translates by key; missing keys fall back to these English values.
 */
export const EN_CATALOG = {
  // App / shell
  "app.name": "NEXA-SAVER",
  "app.tagline": "Quiet money. Clear control.",
  "nav.home": "Home",
  "nav.profile": "Profile",
  "nav.admin": "Admin",
  "nav.signOut": "Sign out",
  "nav.language": "Language",
  "lang.en": "English",
  "lang.ny": "Chichewa",
  "lang.comingSoon": "Coming soon",
  "lang.choose": "Choose language",
  "theme.day": "Day",
  "theme.night": "Night",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.continue": "Continue",
  "common.back": "Back",
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.success": "Done",
  "common.confirm": "Confirm",
  "common.search": "Search",
  "common.optional": "Optional",
  "common.required": "Required",

  // Auth
  "auth.signIn": "Sign in",
  "auth.signUp": "Create account",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.username": "Username",
  "auth.phone": "Phone",
  "auth.forgotPassword": "Forgot password?",
  "auth.noAccount": "No account yet?",
  "auth.hasAccount": "Already have an account?",
  "auth.firstName": "First name",
  "auth.lastName": "Last name",
  "auth.dateOfBirth": "Date of birth",
  "auth.gender": "Gender",
  "auth.pin": "PIN",
  "auth.securityQuestion": "Security question",
  "auth.securityAnswer": "Security answer",
  "auth.acceptTerms": "I accept the Terms of use",
  "auth.acceptPrivacy": "I accept the Privacy policy",
  "auth.terms": "Terms of use",
  "auth.privacy": "Privacy policy",
  "auth.step.you": "You",
  "auth.step.contact": "Contact",
  "auth.step.security": "Security",
  "auth.step.legal": "Legal",
  "auth.resetPassword": "Reset password",
  "auth.newPassword": "New password",
  "auth.currentPassword": "Current password",

  // Dashboard
  "dash.balance": "Balance",
  "dash.hidden": "Hidden",
  "dash.reveal": "Reveal balance",
  "dash.deposit": "Deposit",
  "dash.withdraw": "Withdraw",
  "dash.activity": "Activity",
  "dash.lifetimeIn": "Lifetime in",
  "dash.lifetimeOut": "out",
  "dash.dailyCap": "Daily withdraw limit",
  "dash.remainingToday": "Remaining today",
  "dash.withdrawHold": "Withdrawals on hold",
  "dash.lockTitle": "Withdrawal lock",
  "dash.lockHint": "Optional commitment: deposit anytime, no withdrawals until the date you set.",
  "dash.lockUntil": "Locked until",
  "dash.coolingOff": "Free cooling-off until",
  "dash.unlockEarly": "Unlock early",
  "dash.cancelLockFree": "Cancel lock free",
  "dash.lockWithdrawals": "Lock withdrawals",

  // Deposit / withdraw
  "money.amount": "Amount (kwacha)",
  "money.minDeposit": "Minimum deposit",
  "money.minWithdraw": "Minimum withdraw",
  "money.depositFeeKeep": "The system will keep {pct}% of whatever amount you are depositing",
  "money.momo": "Mobile money",
  "money.bank": "Bank",
  "money.confirmPin": "Confirm with PIN",
  "money.withdrawToMobile": "Withdraw to mobile",
  "money.withdrawToBank": "Withdraw to bank",
  "money.bankFlatFee": "Bank channel flat fee: 700 MWK",
  "money.bankFlatExplain": "This is charged by the payment / bank rail, not by NEXA-SAVER.",

  // Profile
  "profile.title": "Profile",
  "profile.changePassword": "Change password",
  "profile.changePin": "Change withdraw PIN",
  "profile.withdrawalNumber": "Registered withdrawal number",
  "profile.bankDetails": "Bank payout details",
  "profile.email": "Email",
  "profile.vaultLock": "Vault lock",
  "profile.sessions": "Sessions",
  "profile.deleteAccount": "Delete account",
  "profile.signInIdentifier": "Sign-in identifier",
  "profile.securityQuestion": "Security question",
  "profile.lock.idle": "After idle time",
  "profile.lock.instant": "When I leave the app",
  "profile.lock.off": "Do not lock",

  // Admin
  "admin.performance": "Performance",
  "admin.users": "Accounts",
  "admin.treasury": "Treasury (platform profit)",
  "admin.fees": "Platform fees",
  "admin.translations": "Translations",
  "admin.translate": "Translate",
  "admin.payoutMethods": "Payout methods",
  "admin.survey": "Security survey",

  // i18n studio
  "i18n.studio": "Translation studio",
  "i18n.studioHint": "Edit phrases for a language. Save draft to keep work private. Save & deploy publishes to all users who select that language.",
  "i18n.addLanguage": "Add language",
  "i18n.languageCode": "Code (e.g. ny, pt)",
  "i18n.languageName": "Display name",
  "i18n.saveDraft": "Save draft",
  "i18n.saveDeploy": "Save & deploy",
  "i18n.preview": "Open testing preview",
  "i18n.enabled": "Language enabled for users",
  "i18n.published": "Published",
  "i18n.draft": "Draft",
  "i18n.searchKeys": "Search phrases…",
  "i18n.testingAccount": "Testing preview",
  "i18n.testingHint": "This preview uses your draft translations. Users only see published & enabled languages.",
  "i18n.backAdmin": "Back to admin",
  "i18n.noKeys": "No matching phrases",
  "i18n.deployed": "Published to users",
  "i18n.draftSaved": "Draft saved (not live yet)",

  // Help / common empty
  "help.title": "Help",
  "empty.noActivity": "No activity yet",
  "empty.noSessions": "No active sessions found",
  "gate.enterPin": "Enter your PIN",
  "gate.unlock": "Unlock",
  "notFound": "Page not found",
  "notFound.body": "This link is missing or expired.",
  "notFound.back": "Back to NEXA-SAVER",
} as const;

export type MessageKey = keyof typeof EN_CATALOG;

export const ALL_MESSAGE_KEYS = Object.keys(EN_CATALOG) as MessageKey[];

export function en(key: string): string {
  return (EN_CATALOG as Record<string, string>)[key] ?? key;
}
