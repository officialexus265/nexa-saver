/**
 * Phrase-level English catalog (full lines users see — not word-by-word).
 * Translation studio edits these keys; published maps overlay EN at runtime.
 * Phase F: includes passkeys, KYC, tutorials, locks, send, loans, affiliate.
 */
export const EN_CATALOG = {
  // —— Nav / chrome ——
  "nav.home": "Home",
  "nav.profile": "Profile",
  "nav.admin": "Admin",
  "nav.signOut": "Sign out",
  "nav.language": "Language",
  "nav.share": "Share",
  "nav.themeDay": "Day",
  "nav.themeNight": "Night",

  "lang.choose": "Choose language",
  "lang.comingSoon": "Coming soon",
  "lang.english": "English",

  "footer.developedBy": "Developed by",

  // —— Common ——
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.save": "Save",
  "common.back": "Back",
  "common.continue": "Continue",
  "common.confirm": "Confirm",
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.success": "Done",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.remove": "Remove",
  "common.submit": "Submit",

  // —— Auth ——
  "auth.signIn": "Sign in",
  "auth.signUp": "Sign up",
  "auth.createVault": "Create your vault",
  "auth.password": "Password",
  "auth.forgotPassword": "Forgot password?",
  "auth.noAccount": "New here?",
  "auth.hasAccount": "Already have a vault?",
  "auth.loginAside": "A Malawi kwacha vault with a PIN-locked balance and a quiet session.",
  "auth.signupAside":
    "Open a vault. Deposits keep most of what you send; withdrawals return to the number you register.",
  "auth.identifier": "Username, email, or phone",
  "auth.shareApp": "Share",

  // —— Signup intro / tutorials ——
  "signup.introTitle": "Before you open a vault",
  "signup.introBody":
    "Are you already familiar with how NEXA-SAVER works (deposits, fees, withdrawals, and locks)?",
  "signup.introYes": "Yes — go to sign up",
  "signup.introNo": "No — show me how it works",
  "signup.introCancel": "Cancel and go home",
  "signup.videoTitle": "How NEXA-SAVER works",
  "signup.videoHint": "Watch the short guide. You can skip anytime.",
  "signup.skipVideo": "Skip video",
  "signup.proceed": "Proceed to sign up",
  "signup.ready": "Ready when you are.",
  "signup.notFamiliar": "Not familiar with the system?",
  "signup.tutorials": "Tutorials",
  "signup.rewatchIntro": "Rewatch intro",
  "signup.tutorialsTitle": "Tutorials",
  "signup.tutorialsHint":
    "Short videos about NEXA-SAVER. Pick one to watch — you can close anytime and continue signing up.",
  "signup.tutorialsEmpty":
    "Tutorial videos are being prepared. You can continue signing up — check back here soon.",

  // —— Dashboard ——
  "dash.welcome": "Welcome back",
  "dash.available": "Available to withdraw",
  "dash.checkBalance": "Check balance",
  "dash.lifetimeIn": "Lifetime in",
  "dash.lifetimeOut": "out",
  "dash.deposit": "Deposit",
  "dash.withdraw": "Withdraw",
  "dash.send": "Send",
  "dash.activity": "Activity",
  "dash.noActivity": "No activity yet.",
  "dash.receivedBag": "Received bag",
  "dash.receivedHint":
    "Money sent to you stays here until you withdraw it or move it to your main vault. Bank withdrawals may take a bank flat fee from this bag. MoMo can take the full amount.",
  "dash.moveToMain": "Move to main vault",
  "dash.verifyPhoneTitle": "Verify your withdrawal number",
  "dash.verifyPhoneBody":
    "Deposit once from this registered number so we can confirm it is yours before withdrawals.",
  "dash.verifyPhoneCta": "Deposit to verify",
  "dash.passkeyTitle": "Secure your account with a hardware key / passkey",
  "dash.passkeyBody":
    "Add a security key or device passkey so only you can open this vault — even if someone knows your password. No authenticator app needed.",
  "dash.passkeyCta": "Set up security key / passkey",
  "dash.passkeySaved": "Passkey saved. Next sign-in will ask for this key.",
  "dash.passkeyWaiting": "Waiting for key…",
  "dash.lockWithdraw": "Lock withdrawals",
  "dash.loanTitle": "Vault loan",
  "dash.affiliateTitle": "Affiliate",
  "dash.becomeAffiliate": "Become an affiliate",

  // —— Passkey challenge ——
  "passkey.challengeTitle": "Security key / passkey",
  "passkey.challengeBody":
    "This account is protected with a key on a device you set up before. Use that same key or device to continue. If you are on a different computer, recover by email below.",
  "passkey.useKey": "Use security key / passkey",
  "passkey.waiting": "Waiting for key…",
  "passkey.recoveryHint": "On a new device without your key?",
  "passkey.emailCode": "Email me a recovery code",
  "passkey.recoverySent":
    "Code sent to {email}. Enter it to remove keys and continue. You can add a new key later on this device.",
  "passkey.recoveryPlaceholder": "Recovery code",
  "passkey.removeAndContinue": "Remove keys and continue",

  // —— Profile / KYC ——
  "profile.title": "Profile",
  "profile.kycTitle": "Identity (KYC)",
  "profile.kycVerified": "Verified",
  "profile.kycPending": "Under review",
  "profile.kycRejected": "Needs update",
  "profile.kycNone": "Optional until large withdrawals",
  "profile.kycHint":
    "Light identity check for larger withdrawals. Smaller withdrawals still work without this.",
  "profile.kycSubmit": "Submit for review",
  "profile.kycIdType": "ID type",
  "profile.kycIdNumber": "ID number",
  "profile.kycIdName": "Full name on ID",
  "profile.passkeyTitle": "Security key / passkey",
  "profile.passkeyHint":
    "When a key is registered, sign-in asks for it after your password. To turn this off, remove every key (confirm with your withdraw PIN).",
  "profile.passkeyNone": "No security keys on this account.",
  "profile.passkeyPin": "Withdraw PIN to remove a key",
  "profile.sessions": "Sessions",
  "profile.changePassword": "Change password",
  "profile.changePin": "Change withdraw PIN",

  // —— Money actions ——
  "money.depositTitle": "Deposit",
  "money.withdrawTitle": "Withdraw",
  "money.sendTitle": "Send money",
  "money.amount": "Amount (MWK)",
  "money.confirmPin": "Confirm with PIN",
  "money.momo": "Mobile money",
  "money.bank": "Bank",
  "money.bankFlatNote":
    "The bank charges a flat fee on bank payouts. That amount is taken from what you request — it is not an extra NEXA percentage fee.",

  // —— Legal ——
  "legal.terms": "Terms of use",
  "legal.privacy": "Privacy policy",
  "legal.conditions": "Terms and conditions",

  // —— Vault lock ——
  "lock.title": "Lock withdrawals",
  "lock.platform": "Withdrawals locked by the platform",
  "lock.contactAdmin": "Contact admin on WhatsApp",
  "lock.cooling": "Cooling-off window — you can cancel free until {time}",
  "lock.until": "Locked until {time}",

  // —— Errors (user-facing soft) ——
  "error.tryAgain": "Please try again.",
  "error.network": "Network problem. Check your connection and try again.",
} as const;

export type MessageKey = keyof typeof EN_CATALOG;

export const ALL_MESSAGE_KEYS = Object.keys(EN_CATALOG) as MessageKey[];

export function en(key: string): string {
  return (EN_CATALOG as Record<string, string>)[key] ?? key;
}
