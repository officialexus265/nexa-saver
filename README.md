# NEXA-SAVER

*Quiet money. Clear control.* A Malawi kwacha savings PWA: sign up, deposit, check your balance behind a 4-digit PIN, withdraw to your registered number.

**Stack:** TanStack Start (React 19) · Better Auth (email + password sessions) · Neon Postgres · PayChangu (mobile money) · Tailwind 4 · deployed on Vercel. No other platform dependencies.

## Money model

| Event | What happens |
|---|---|
| Deposit 100 | 6 reserved → **94** credited. Of the 6: 3 is platform profit, 3 is kept as the payout (withdrawal) fee. |
| Withdraw | Only up to the balance shown. Paid to the number registered at signup; the 3 reserved pays the payout fee. |

Rates, minimums and timers live in `src/lib/nexa/constants.ts` (5-min idle PIN lock, 30-day session, 3 × 5 s account-deletion waits, 3 s success pop-up).

## Run locally

```bash
npm install
cp .env.example .env        # fill DATABASE_URL (a free Neon project) and BETTER_AUTH_SECRET
npm run db:migrate          # creates the tables in Neon
npm run dev                 # http://localhost:3000
```

`NEXA_DEMO_PAYMENTS=true` in `.env` simulates PayChangu so you can try deposits/withdrawals locally. It is ignored in production builds and whenever PayChangu keys are set.

First admin login: set `ADMIN_INITIAL_PASSWORD` (min 8 chars) before the first request so a known default never exists in production. Locally, without that env var, the seed still uses `admin` / `admin` and forces a password change.

## Deploy (Vercel + Neon)

1. **Neon:** create a project, open *Connection details*, enable **Connection pooling**, copy the string → `DATABASE_URL`.
2. **GitHub:** push this folder to a repository.
3. **Vercel:** *Add New → Project →* import the repo. Framework preset: *Other* (Nitro output is auto-detected). Add environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | your public URL, e.g. `https://nexa-saver.vercel.app` |
   | `PAYCHANGU_SECRET_KEY` | from the PayChangu dashboard |
   | `PAYCHANGU_WEBHOOK_SECRET` | the webhook secret you set in PayChangu |
   | `ADMIN_INITIAL_PASSWORD` | strong password for the first admin (min 8 chars; required in production to seed admin) |
   | `NEXA_PIN_PEPPER` | `openssl rand -base64 32` — server-only pepper for PIN / security-answer hashes |
   | `CRON_SECRET` | bearer token for `/api/cron/reconcile` (Vercel Cron uses this automatically) |
   | `NEXA_PAUSE_DEPOSITS` / `NEXA_PAUSE_WITHDRAWALS` / `NEXA_PAUSE_ALL` | set to `true` to pause money movement instantly |

4. **Deploy.** The build runs `vite build` then `npm run db:migrate`, so the schema is applied to Neon automatically (and the build fails if `DATABASE_URL` is missing).
5. **PayChangu:** set the webhook/callback URL to `https://<your-domain>/api/paychangu/webhook`.
6. Open the site on a phone: Android shows the install prompt; on iOS use Share → *Add to Home Screen*.

Production safeguards: unsigned PayChangu webhooks are rejected; webhooks re-verify amount with PayChangu before crediting; deposits/withdrawals refuse to run unless PayChangu is configured; kill-switch env flags pause money movement; daily reconciliation runs at 04:00 UTC via Vercel Cron.

## Scripts

`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run db:migrate`

## PWA

`public/manifest.webmanifest`, `public/sw.js` (caches only static build assets plus an offline page; never touches `/api`, server functions or user data), `public/offline.html`, and an install prompt with iOS "Add to Home Screen" steps.


## Your checklist (not in code)

These need your accounts / judgment before real money:

1. **PayChangu** — confirm collection fee, payout fee, and that holding customer balances is allowed.
2. **Legal** — short consult on Malawi payment-system / e-money rules and data protection.
3. **Staging** — separate Neon branch + PayChangu test keys; production keys only in Vercel production.
4. **Neon** — enable point-in-time recovery and test one restore.
5. **Secrets** — set `ADMIN_INITIAL_PASSWORD`, `NEXA_PIN_PEPPER`, `CRON_SECRET`, `PAYCHANGU_*`; rotate on a schedule.
6. **Support phone** — set the large-withdrawal number in the admin console.
7. **Beta** — 10–20 trusted users, low caps, watch reconciliation daily for two weeks.
8. **Incident plan** — written steps for failed payout, recon mismatch, and kill-switch use.
