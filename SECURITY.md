# NEXA-SAVER — security notes (Phase H)

## Built-in controls
- Session cookies: Better Auth + SameSite; server `assertSameSiteRequest` on authenticated server functions
- Production Origin allow-list when `BETTER_AUTH_URL` / Vercel URLs are set
- Money paths: auth middleware, user_id scoping, idempotency keys, PIN + rate limits
- Deposits: webhook HMAC (required in production), amount match, atomic credit
- Admin sensitive actions: role + TOTP/passkey elevation
- Kill switch (env + DB), beta caps, KYC threshold for large withdrawals
- HTTP headers via `vercel.json`: nosniff, frame deny, HSTS, referrer policy

## Operator checklist
Admin → **Ops → Security checklist** (re-scan anytime).

## Manual tests before public money
1. Cross-account deposit reference (must fail “not found”)
2. Unsigned webhook POST (must 401 in production)
3. PIN lockout after failed attempts
4. Admin force-credit without 2FA (must fail)
5. `/api/cron/reconcile` without Bearer secret (must 401 when CRON_SECRET set)
6. `skipPaychanguCheck` in production without `NEXA_ALLOW_SKIP_PAYCHANGU` (must fail)

## Emergency
- Pause deposits/withdrawals: Admin → Ops
- Env overrides: `NEXA_PAUSE_DEPOSITS`, `NEXA_PAUSE_WITHDRAWALS`, `NEXA_PAUSE_ALL`
