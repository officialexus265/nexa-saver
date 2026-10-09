/**
 * Phrase-level English catalog (full lines users see — not word-by-word).
 * Translation studio edits these keys; published maps overlay EN at runtime.
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

  // —— Auth ——
  "auth.signIn": "Sign in",
  "auth.signUp": "Sign up",
  "auth.createVault": "Create your vault",
  "auth.password": "Password",
  "auth.forgotPassword": "Forgot password?",
  "auth.noAccount": "New here?",
  "auth.hasAccount": "Already have a vault?",
  "auth.loginAside": "A Malawi kwacha vault with a PIN-locked balance and a quiet session.",
  "auth.signupAside": "Open a vault. Deposits keep most of what you send; withdrawals return to the number you register.",
  "auth.identifier": "Username, email, or phone",
  "auth.shareApp": "Share",

  // —— Signup intro ——
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
    "Money sent to you stays here until you withdraw it or move it to your main vault. Bank withdrawals take a 700 MWK flat from this bag (not a NEXA fee). MoMo can take the full amount.",
  "dash.moveToMain": "Move all to main vault (free)",
  "dash.movedTitle": "Moved to main vault",
  "dash.movedBody":
    "Received funds are now in your main balance. Bank withdraws from main still use the 700 MWK bank flat.",
  "dash.verifyPhoneTitle": "Verify your withdrawal number",
  "dash.verifyPhoneBody":
    "To unlock withdrawals, deposit once from your registered number. That proves the line is active and yours.",
  "dash.depositToVerify": "Deposit to verify",
  "dash.holdWithdraw": "Withdrawals on hold",
  "dash.maxDaily": "Daily max",
  "dash.loanTitle": "Loan (against self-lock)",
  "dash.loanHint":
    "Only while a voluntary withdrawal time-lock is active. Admin locks do not qualify. Max 90% of locked balance. Interest is charged monthly on the amount due.",
  "dash.loanBlocked": "Withdrawals are locked by the platform. Loans need a self time-lock only.",
  "dash.affiliateTitle": "Affiliate / referral",
  "dash.affiliateHint":
    "Earn a share of a friend’s first deposit only. After that, no further commission from them. Withdraw earnings from the minimum shown (platform fee on withdrawal).",
  "dash.affiliateTerms":
    "I accept the affiliate terms: commission only on each referred user’s first deposit; withdrawal fee applies as shown.",
  "dash.becomeAffiliate": "Become an affiliate",
  "dash.shareInvite": "Share invite link",
  "dash.referralPaused": "Referral program is paused. You can still withdraw earnings you already have.",

  // —— Send ——
  "send.title": "Send money",
  "send.intro":
    "Send the full amount to another NEXA-SAVER account. A small fixed fee is charged from your balance; the recipient gets what you type into their received bag.",
  "send.amount": "Amount (kwacha)",
  "send.theirNumber": "Their registered number",
  "send.lookup": "Look up account",
  "send.checking": "Checking…",
  "send.coverTitle": "Cover bank flat (700 MWK)",
  "send.coverHint":
    "You also pay 700 so their received bag includes enough for a full bank payout of your amount. When they withdraw the whole bag to bank, 700 covers the bank flat. MoMo never needs the 700. Leave unchecked if they should fund the 700 from the amount alone.",
  "send.feeLine": "Send fee",
  "send.theyReceive": "They receive",
  "send.totalFromYou": "Total from your vault",
  "send.confirmRecipient": "Confirm recipient",
  "send.now": "Send now",
  "send.sending": "Sending…",
  "send.min": "Minimum send is 100 kwacha.",
  "send.noMatch": "That number does not match any NEXA-SAVER account.",

  // —— Withdraw ——
  "withdraw.title": "Withdraw",
  "withdraw.revealFirst": "Reveal your balance with your PIN before withdrawing.",
  "withdraw.checkFirst": "Check balance first",
  "withdraw.from": "Withdraw from",
  "withdraw.mainVault": "Main vault",
  "withdraw.receivedBag": "Received bag",
  "withdraw.momo": "Mobile money",
  "withdraw.bank": "Bank",
  "withdraw.bankFlatTitle": "Bank channel flat fee: 700 MWK",
  "withdraw.bankFlatBody":
    "Charged by the bank / PayChangu rail, not NEXA-SAVER. The 700 MWK is taken from the balance you withdraw. MoMo has no 700 flat.",
  "withdraw.paused": "Withdrawals are paused by the platform.",
  "withdraw.momoOff": "Mobile money withdrawals are off right now.",
  "withdraw.bankOff": "Bank withdrawals are off right now.",

  // —— Deposit ——
  "deposit.title": "Deposit",
  "deposit.amount": "Amount (kwacha)",
  "deposit.feeNote": "A platform fee is taken from each deposit; the rest is credited to your vault.",

  // —— Activity kinds ——
  "tx.deposit": "Deposit",
  "tx.withdrawal": "Withdrawal",
  "tx.fee": "Fee",
  "tx.transfer_out": "Sent",
  "tx.transfer_in": "Received",
  "tx.success": "success",
  "tx.pending": "pending",
  "tx.failed": "failed",
  "tx.processing": "processing",

  // —— Profile ——
  "profile.title": "Profile",
  "profile.changePassword": "Change password",
  "profile.changePin": "Change PIN",
  "profile.securityQuestion": "Security question",
  "profile.vaultLock": "Vault lock",
  "profile.lockOff": "Do not lock",
  "profile.lockIdle": "After idle time",
  "profile.lockLeave": "When I leave the app",
  "profile.withdrawLock": "Withdrawal time-lock",
  "profile.sessions": "Active sessions",
  "profile.signOutSession": "Sign out this session",
  "profile.phone": "Phone",
  "profile.email": "Email",
  "profile.bankDetails": "Bank payout details",

  // —— Vault lock ——
  "vault.unlock": "Unlock vault",
  "vault.locked": "Vault locked",
  "vault.enterPin": "Enter your PIN",

  // —— Share ——
  "share.title": "Share NEXA-SAVER",
  "share.hint": "Tell a friend — no referral code required.",
  "share.button": "Share app",
  "share.copied": "Link copied.",

  // —— Legal ——
  "legal.terms": "Terms of service",
  "legal.privacy": "Privacy policy",
  "legal.acceptTerms": "I accept the terms of service",
  "legal.acceptPrivacy": "I accept the privacy policy",

  // —— Admin (labels only) ——
  "admin.title": "Admin",
  "admin.overview": "Overview",
  "admin.users": "Users",
  "admin.translations": "Translations",

  // —— i18n studio ——
  "i18n.studioTitle": "Translation studio",
  "i18n.studioHint":
    "Edit full phrases as users see them (not word-by-word). Save draft privately, then Save & deploy so enabled languages go live.",
  "i18n.language": "Language",
  "i18n.addLanguage": "Add language",
  "i18n.saveDraft": "Save draft",
  "i18n.deploy": "Save & deploy",
  "i18n.published": "Published",
  "i18n.enabled": "Enabled for users",
  "i18n.preview": "Preview",
  "i18n.testingHint": "Preview uses your draft. Users only see published & enabled languages.",
  "i18n.selectPhrase": "Select a phrase to edit",
  "i18n.englishSource": "English (source)",
  "i18n.yourTranslation": "Your translation",
  "i18n.applyLine": "Apply this line",
  "i18n.deployedOk": "Deployed. Users who pick this language will see published phrases after refresh.",
} as const;

export type MessageKey = keyof typeof EN_CATALOG;

export const ALL_MESSAGE_KEYS = Object.keys(EN_CATALOG) as MessageKey[];

export function en(key: string): string {
  return (EN_CATALOG as Record<string, string>)[key] ?? key;
}
