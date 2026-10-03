import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  ADMIN_EMAIL,
  LOGIN_PREF_LABEL,
  PIN_MAX_ATTEMPTS,
  PIN_LOCK_MS,
  PIN_VERIFY_WINDOW_MS,
  SECURITY_QUESTIONS,
  SESSION_INACTIVITY_MS,
  type LoginPref,
} from "./constants";
import {
  formatKwacha,
  kwachaToTambala,
  splitDeposit,
  tambalaToKwacha,
  validateDepositAmount,
  validateWithdrawAmount,
} from "./money";
import { normalizeMwPhone } from "./phone";
import type {
  AdminOverview,
  AdminUserRow,
  BalanceResponse,
  DepositStart,
  MeResponse,
  PublicProfile,
  PublicTx,
} from "./types";

const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be 4 digits");
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, "Username may use letters, numbers, and underscores");

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Canonical public origin for PayChangu return/callback URLs (no trailing slash). */
async function publicSiteOrigin(clientOrigin?: string): Promise<string> {
  const { env } = await import("@/lib/env.server");
  const configured = env("BETTER_AUTH_URL") || env("SITE_URL") || env("VITE_SITE_URL");
  const raw = (configured || clientOrigin || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("Site URL is not configured");
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
    return u.origin;
  } catch {
    throw new Error("Invalid site URL");
  }
}

function isAdult(dob: string): boolean {
  const born = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(born.getTime())) return false;
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return born <= limit;
}

type ProfileRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  phone_verified_at: unknown;
  lock_mode: string;
  lock_idle_minutes: number;
  username: string;
  date_of_birth: string;
  role: string;
  must_change_password: boolean;
  login_identifier_pref: string;
  failed_pin_attempts: number;
  pin_locked_until: unknown;
  last_activity_at: unknown;
  pin_verified_at: unknown;
  pin_hash: string;
  security_question: string;
  security_answer_hash: string;
  withdrawals_held_until: unknown;
  daily_withdraw_cap_kwacha: number;
  withdraw_cap_updated_at: unknown;
  created_at: unknown;
};

function toPublic(row: ProfileRow): PublicProfile {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    phoneVerified: Boolean(row.phone_verified_at),
    lockMode: row.lock_mode === "instant" ? "instant" : "idle",
    lockIdleMinutes: Math.min(60, Math.max(1, asInt(row.lock_idle_minutes) || 5)),
    username: row.username,
    dateOfBirth: String(row.date_of_birth).slice(0, 10),
    gender: (row.gender as PublicProfile["gender"]) ?? null,
    role: row.role === "admin" ? "admin" : "user",
    mustChangePassword: Boolean(row.must_change_password),
    loginIdentifierPref: (row.login_identifier_pref in LOGIN_PREF_LABEL
      ? row.login_identifier_pref
      : "username") as LoginPref,
    pinLockedUntil: iso(row.pin_locked_until),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
  };
}

function pinWindowOpen(verifiedAt: unknown): boolean {
  const ts = verifiedAt instanceof Date ? verifiedAt.getTime() : Date.parse(String(verifiedAt ?? ""));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < PIN_VERIFY_WINDOW_MS;
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select * from profiles
    where user_id = ${userId} and deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

async function touchSession(userId: string) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ last_activity_at: unknown }>`
    select last_activity_at from profiles where user_id = ${userId} limit 1
  `;
  const last = rows[0]?.last_activity_at;
  const lastMs = last instanceof Date ? last.getTime() : Date.parse(String(last ?? ""));
  if (Number.isFinite(lastMs) && Date.now() - lastMs > SESSION_INACTIVITY_MS) {
    await sql`delete from "session" where "userId" = ${userId}`;
    const { UnauthorizedError } = await import("@/lib/auth/verify.server");
    throw new UnauthorizedError();
  }
  await sql`update profiles set last_activity_at = now(), updated_at = now() where user_id = ${userId}`;
  await sql`
    update "session"
    set "expiresAt" = now() + interval '32 days', "updatedAt" = now()
    where "userId" = ${userId} and "expiresAt" > now()
  `;
}

async function requirePinWindow(userId: string) {
  const profile = await loadProfile(userId);
  if (!profile) throw new Error("Complete your profile first");
  if (!pinWindowOpen(profile.pin_verified_at)) {
    throw new Error("PIN_REQUIRED");
  }
  return profile;
}

export const bootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureAdmin } = await import("./seed-admin.server");
  await ensureAdmin();
  return { ok: true as const };
});

export const checkHandle = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ensureAdmin } = await import("./seed-admin.server");
    await ensureAdmin();
    const { getSql } = await import("@/lib/db");
    const { assertRateLimit } = await import("./rate-limit.server");
    const sql = await getSql();
    await assertRateLimit(sql, {
      bucket: "signup-check:global",
      limit: 60,
      windowSeconds: 60 * 60,
      message: "Too many checks. Try again later.",
    });
    const username = data.username?.trim();
    const email = data.email?.trim().toLowerCase();
    const phone = data.phone ? normalizeMwPhone(data.phone) : null;
    const [u, e, p] = await Promise.all([
      username
        ? sql<{ n: number }>`select count(*)::int as n from profiles where lower(username) = ${username.toLowerCase()}`
        : Promise.resolve([{ n: 0 }]),
      email ? sql<{ n: number }>`select count(*)::int as n from profiles where lower(email) = ${email}` : Promise.resolve([{ n: 0 }]),
      phone ? sql<{ n: number }>`select count(*)::int as n from profiles where phone = ${phone}` : Promise.resolve([{ n: 0 }]),
    ]);
    return {
      usernameTaken: asInt(u[0]?.n) > 0,
      emailTaken: asInt(e[0]?.n) > 0,
      phoneTaken: asInt(p[0]?.n) > 0,
      phoneInvalid: Boolean(data.phone) && !phone,
    };
  });

export const resolveSignInEmail = createServerFn({ method: "POST" })
  .validator(z.object({ identifier: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { ensureAdmin } = await import("./seed-admin.server");
    await ensureAdmin();
    const { getSql } = await import("@/lib/db");
    const { assertRateLimit } = await import("./rate-limit.server");
    const sql = await getSql();
    const raw = data.identifier.trim();
    // Constant-ish work + rate limit; always return an email-shaped string so
    // callers cannot enumerate accounts from timing or response shape alone.
    await assertRateLimit(sql, {
      bucket: `signin-resolve:${raw.toLowerCase().slice(0, 64)}`,
      limit: 30,
      windowSeconds: 60 * 60,
      message: "Too many sign-in attempts. Try again later.",
    });
    const phone = normalizeMwPhone(raw);
    const rows = await sql<{ email: string }>`
      select email from profiles
      where lower(username) = ${raw.toLowerCase()}
         or lower(email) = ${raw.toLowerCase()}
         or phone = ${phone ?? "__none__"}
      limit 1
    `;
    return { email: rows[0]?.email ?? (raw.includes("@") ? raw.toLowerCase() : ADMIN_EMAIL.replace("admin", "nobody")) };
  });

const completeSchema = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().min(1).max(40),
  phone: z.string().min(8),
  username: usernameSchema,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]),
  pin: pinSchema,
  securityQuestion: z.enum(SECURITY_QUESTIONS),
  securityAnswer: z.string().trim().min(2).max(80),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  password: z.string().min(8).max(128).optional(),
  loginIdentifierPref: z.enum(["username", "email", "phone"]).optional(),
});

export const completeProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(completeSchema)
  .handler(async ({ context, data }): Promise<PublicProfile> => {
    const { getSql } = await import("@/lib/db");
    const { hashSecret, normalizeAnswer } = await import("./crypto");
    const { hashPassword } = await import("better-auth/crypto");
    const { assertRateLimit } = await import("./rate-limit.server");
    const sql = await getSql();

    await assertRateLimit(sql, {
      bucket: `profile:${context.userId}`,
      limit: 10,
      windowSeconds: 60 * 60,
      message: "Too many profile attempts. Try again later.",
    });

    const existing = await loadProfile(context.userId);
    if (existing) return toPublic(existing);

    if (!isAdult(data.dateOfBirth)) throw new Error("You must be 18 or older to open an account");
    const phone = normalizeMwPhone(data.phone);
    if (!phone) throw new Error("Enter a valid Malawi mobile number (Airtel 09x or TNM 08x)");

    const userRows = await sql<{ email: string; name: string }>`
      select email, name from "user" where id = ${context.userId} limit 1
    `;
    const email = userRows[0]?.email;
    if (!email) throw new Error("Account email is missing");

    const clashes = await sql<{ k: string }>`
      select 'username' as k from profiles where lower(username) = ${data.username.toLowerCase()}
      union all
      select 'phone' from profiles where phone = ${phone}
      union all
      select 'email' from profiles where lower(email) = ${email.toLowerCase()}
    `;
    if (clashes.some((c) => c.k === "username")) throw new Error("That username is taken");
    if (clashes.some((c) => c.k === "phone")) throw new Error("That phone number is already registered");
    if (clashes.some((c) => c.k === "email")) throw new Error("That email already has a NEXA-SAVER profile");

    const pinHash = await hashSecret(data.pin);
    const answerHash = await hashSecret(normalizeAnswer(data.securityAnswer));

    await sql`
      insert into profiles (
        user_id, first_name, last_name, email, phone, username, date_of_birth, gender,
        pin_hash, security_question, security_answer_hash, role, login_identifier_pref
      ) values (
        ${context.userId}, ${data.firstName}, ${data.lastName}, ${email}, ${phone},
        ${data.username}, ${data.dateOfBirth}, ${data.gender}, ${pinHash}, ${data.securityQuestion},
        ${answerHash}, ${"user"}, ${data.loginIdentifierPref ?? "username"}
      )
    `;
    await sql`insert into wallets (user_id) values (${context.userId})`;

    if (data.password) {
      const passwordHash = await hashPassword(data.password);
      const cred = await sql<{ id: string }>`
        select id from "account" where "userId" = ${context.userId} and "providerId" = ${"credential"} limit 1
      `;
      if (!cred.length) {
        const id = `${context.userId}-credential`;
        await sql`
          insert into "account" (
            "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
          ) values (${id}, ${context.userId}, ${"credential"}, ${context.userId}, ${passwordHash}, now(), now())
        `;
      }
    }

    const row = await loadProfile(context.userId);
    if (!row) throw new Error("Could not create profile");
    return toPublic(row);
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MeResponse> => {
    const { ensureAdmin } = await import("./seed-admin.server");
    await ensureAdmin();
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { demoPaymentsEnabled } = await import("./paychangu.server");
    const session = await getSessionUser();
    const profile = await loadProfile(context.userId);
    if (!profile) {
      return {
        ok: true,
        needsProfile: true,
        email: session?.email ?? null,
        name: null,
      };
    }
    await touchSession(context.userId);
    const fresh = await loadProfile(context.userId);
    if (!fresh) throw new Error("Profile missing");
    try {
      const { getSql } = await import("@/lib/db");
      const { noteDeviceAccess } = await import("./devices.server");
      const sql = await getSql();
      await noteDeviceAccess(sql, {
        userId: context.userId,
        email: fresh.email,
        firstName: fresh.first_name,
      });
    } catch (err) {
      console.error("[getMe] device note:", (err as Error).message);
    }
    const { getSql } = await import("@/lib/db");
    const sqlUser = await getSql();
    const ev = await sqlUser<{ emailVerified: boolean }>`
      select "emailVerified" from "user" where id = ${context.userId} limit 1
    `;
    return {
      ok: true,
      needsProfile: false,
      emailVerified: Boolean(ev[0]?.emailVerified),
      profile: toPublic(fresh),
      pinUnlocked: pinWindowOpen(fresh.pin_verified_at),
      demoPayments: demoPaymentsEnabled(),
    };
  });

export const heartbeat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await touchSession(context.userId);
    try {
      const profile = await loadProfile(context.userId);
      if (profile) {
        const { getSql } = await import("@/lib/db");
        const { noteDeviceAccess } = await import("./devices.server");
        await noteDeviceAccess(await getSql(), {
          userId: context.userId,
          email: profile.email,
          firstName: profile.first_name,
        });
      }
    } catch {
      /* ignore */
    }
    return { ok: true as const };
  });

export const verifyPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pin: pinSchema }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret } = await import("./crypto");
    const { assertRateLimit } = await import("./rate-limit.server");
    const { PIN_LOCK_ESCALATION_MS } = await import("./constants");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");

    await assertRateLimit(sql, {
      bucket: `pin:${context.userId}`,
      limit: 20,
      windowSeconds: 60 * 60,
      message: "Too many PIN attempts. Try again later.",
    });

    const lockedMs = profile.pin_locked_until
      ? profile.pin_locked_until instanceof Date
        ? profile.pin_locked_until.getTime()
        : Date.parse(String(profile.pin_locked_until))
      : 0;
    if (lockedMs && lockedMs > Date.now()) {
      throw new Error("PIN is locked. Try again later or reset it with your security question.");
    }

    const ok = await verifySecret(profile.pin_hash, data.pin);
    if (!ok) {
      const attempts = asInt(profile.failed_pin_attempts) + 1;
      if (attempts >= PIN_MAX_ATTEMPTS && attempts % PIN_MAX_ATTEMPTS === 0) {
        // Escalate: 5m → 1h → 24h based on how many full attempt cycles failed.
        const cycle = Math.min(Math.floor(attempts / PIN_MAX_ATTEMPTS) - 1, PIN_LOCK_ESCALATION_MS.length - 1);
        const lockMs = PIN_LOCK_ESCALATION_MS[cycle] ?? PIN_LOCK_MS;
        const lockMinutes = Math.round(lockMs / 60_000);
        await sql`
          update profiles
          set failed_pin_attempts = ${attempts},
              pin_locked_until = now() + make_interval(secs => ${Math.round(lockMs / 1000)}),
              updated_at = now()
          where user_id = ${context.userId}
        `;
        const label =
          lockMinutes >= 60 * 24
            ? "24 hours"
            : lockMinutes >= 60
              ? "1 hour"
              : `${lockMinutes} minutes`;
        const { writeAudit } = await import("./audit.server");
        await writeAudit(sql, {
          action: "pin_locked",
          userId: context.userId,
          detail: `locked ${label}; attempts=${attempts}`,
        });
        throw new Error(`Too many incorrect PINs. Locked for ${label}.`);
      }
      await sql`
        update profiles
        set failed_pin_attempts = ${attempts}, updated_at = now()
        where user_id = ${context.userId}
      `;
      const { writeAudit } = await import("./audit.server");
      await writeAudit(sql, {
        action: "pin_failed",
        userId: context.userId,
        detail: `attempts=${attempts}`,
      });
      const leftInCycle = PIN_MAX_ATTEMPTS - (attempts % PIN_MAX_ATTEMPTS);
      throw new Error(`Incorrect PIN. ${leftInCycle} attempts left.`);
    }

    await sql`
      update profiles
      set failed_pin_attempts = 0, pin_locked_until = null, pin_verified_at = now(), updated_at = now()
      where user_id = ${context.userId}
    `;
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, { action: "pin_ok", userId: context.userId });
    const wallets = await sql<{ balance_tambala: number }>`
      select balance_tambala from wallets where user_id = ${context.userId} limit 1
    `;
    return { ok: true as const, balanceTambala: asInt(wallets[0]?.balance_tambala) };
  });

export const getBalance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BalanceResponse> => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (!pinWindowOpen(profile.pin_verified_at)) return { ok: true, locked: true };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const wallets = await sql<{
      balance_tambala: number;
      lifetime_deposited_tambala: number;
      lifetime_withdrawn_tambala: number;
    }>`select balance_tambala, lifetime_deposited_tambala, lifetime_withdrawn_tambala from wallets where user_id = ${context.userId}`;
    const w = wallets[0];
    const { withdrawRoomTambala, holdMessage } = await import("./withdraw-limits.server");
    const room = await withdrawRoomTambala(sql, context.userId, profile);
    return {
      ok: true,
      locked: false,
      balanceTambala: asInt(w?.balance_tambala),
      lifetimeDepositedTambala: asInt(w?.lifetime_deposited_tambala),
      lifetimeWithdrawnTambala: asInt(w?.lifetime_withdrawn_tambala),
      withdrawHoldUntil: room.holdUntilMs > 0 ? new Date(room.holdUntilMs).toISOString() : null,
      withdrawHoldMessage: room.holdUntilMs > 0 ? holdMessage(room.holdUntilMs) : null,
      dailyWithdrawCapTambala: room.capTambala,
      dailyWithdrawRemainingTambala: room.remainingTambala,
    };
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PublicTx[]> => {
    // Activity is visible without PIN; only the balance figure stays locked.
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      kind: string;
      status: string;
      gross_tambala: number;
      credited_tambala: number;
      phone: string | null;
      reference: string;
      note: string | null;
      created_at: unknown;
    }>`
      select id, kind, status, gross_tambala, credited_tambala, phone, reference, note, created_at
      from transactions
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
    return rows.map((r) => ({
      id: asInt(r.id),
      kind: r.kind === "withdrawal" ? "withdrawal" : "deposit",
      status:
        r.status === "success"
          ? "success"
          : r.status === "failed"
            ? "failed"
            : r.status === "processing"
              ? "processing"
              : "pending",
      grossTambala: asInt(r.gross_tambala),
      creditedTambala: asInt(r.credited_tambala),
      phone: r.phone,
      reference: r.reference,
      note: r.note,
      createdAt: iso(r.created_at) ?? new Date().toISOString(),
    }));
  });

export const startDeposit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      amountKwacha: z.number().positive(),
      phone: z.string().min(8),
      origin: z.string().url(),
      idempotencyKey: z.string().min(8).max(128),
    }),
  )
  .handler(async ({ context, data }): Promise<DepositStart> => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    await requireVerifiedEmail(context.userId);
    const amountErr = validateDepositAmount(data.amountKwacha);
    if (amountErr) throw new Error(amountErr);
    const phone = normalizeMwPhone(data.phone);
    if (!phone) throw new Error("Enter a valid Malawi number to deposit from");

    const { getSql } = await import("@/lib/db");
    const { newReference } = await import("./crypto");
    const { paychanguConfigured, demoPaymentsEnabled, initiateHostedCheckout } = await import("./paychangu.server");
    const { claimIdempotencyKey, storeIdempotencyResponse } = await import("./idempotency.server");
    if (!paychanguConfigured() && !demoPaymentsEnabled()) {
      throw new Error("Deposits are not available right now. Please try again later.");
    }
    const { assertDepositsAllowed } = await import("./kill-switch.server");
    assertDepositsAllowed();
    const sql = await getSql();

    const claim = await claimIdempotencyKey(sql, {
      key: data.idempotencyKey,
      userId: context.userId,
      action: "deposit",
    });
    if (claim.hit) return claim.response as DepositStart;

    try {
      const gross = kwachaToTambala(data.amountKwacha);
      const split = splitDeposit(gross);
      const reference = newReference("DEP");

      await sql`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, phone, reference, note
        ) values (
          ${context.userId}, ${"deposit"}, ${"pending"}, ${split.gross}, ${split.credited},
          ${split.profit}, ${split.reserve}, ${phone}, ${reference},
          ${`Deposit ${formatKwacha(split.gross)} from ${phone}`}
        )
      `;

      let result: DepositStart;
      if (demoPaymentsEnabled()) {
        result = { ok: true, mode: "demo", reference, phone, amountTambala: split.gross };
      } else {
        const site = await publicSiteOrigin(data.origin);
        const { checkoutUrl } = await initiateHostedCheckout({
          amountKwacha: tambalaToKwacha(split.gross),
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          txRef: reference,
          callbackUrl: `${site}/api/paychangu/webhook`,
          returnUrl: `${site}/deposit/return?ref=${encodeURIComponent(reference)}`,
          description: `NEXA-SAVER deposit of ${formatKwacha(split.gross)}`,
        });
        result = { ok: true, mode: "live", checkoutUrl, reference };
      }

      await storeIdempotencyResponse(sql, data.idempotencyKey, result);
      return result;
    } catch (err) {
      // Release the key so the client can retry with the same or a new key.
      await sql`delete from idempotency_keys where key = ${data.idempotencyKey} and response_json is null`;
      throw err;
    }
  });

export const confirmDemoDeposit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4) }))
  .handler(async ({ context, data }) => {
    const { demoPaymentsEnabled } = await import("./paychangu.server");
    if (!demoPaymentsEnabled()) throw new Error("Payments must complete through PayChangu");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const owned = await sql<{ id: number }>`
      select id from transactions where reference = ${data.reference} and user_id = ${context.userId} limit 1
    `;
    if (!owned.length) throw new Error("Deposit not found");
    const { creditDeposit } = await import("./ledger.server");
    return creditDeposit(data.reference);
  });

export const verifyDeposit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const owned = await sql<{ id: number; status: string; gross_tambala: number }>`
      select id, status, gross_tambala from transactions
      where reference = ${data.reference} and user_id = ${context.userId} limit 1
    `;
    if (!owned.length) throw new Error("Deposit not found");
    const { paychanguConfigured, demoPaymentsEnabled, verifyPayment } = await import("./paychangu.server");
    if (!demoPaymentsEnabled()) {
      if (!paychanguConfigured()) throw new Error("Payments are not available right now");
      const result = await verifyPayment(data.reference);
      if (!result.ok) throw new Error("Payment is not confirmed yet");
      // Match amount (PayChangu returns kwacha).
      const verifiedTambala = kwachaToTambala(result.amount);
      if (verifiedTambala > 0 && verifiedTambala !== asInt(owned[0].gross_tambala)) {
        throw new Error("Payment amount does not match this deposit");
      }
    }
    const { creditDeposit } = await import("./ledger.server");
    return creditDeposit(data.reference);
  });

export const startWithdraw = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  // email verified checked inside handler

  .validator(
    z.object({
      amountKwacha: z.number().positive(),
      pin: pinSchema,
      idempotencyKey: z.string().min(8).max(128),
    }),
  )
  .handler(async ({ context, data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { verifySecret, newReference } = await import("./crypto");
    const { paychanguConfigured, demoPaymentsEnabled, initiateMomoPayout } = await import("./paychangu.server");
    const { claimIdempotencyKey, storeIdempotencyResponse } = await import("./idempotency.server");
    const { finalizeWithdrawalSuccess, finalizeWithdrawalFailure } = await import("./ledger.server");
    if (!paychanguConfigured() && !demoPaymentsEnabled()) {
      throw new Error("Withdrawals are not available right now. Your balance was not touched.");
    }
    const { assertWithdrawalsAllowed } = await import("./kill-switch.server");
    assertWithdrawalsAllowed();

    const sql = await getSql();

    const claim = await claimIdempotencyKey(sql, {
      key: data.idempotencyKey,
      userId: context.userId,
      action: "withdraw",
    });
    if (claim.hit) return claim.response as {
      ok: true;
      reference: string;
      amountTambala: number;
      phone: string;
      remainingTambala: number;
    };

    const releaseKey = async () => {
      await sql`delete from idempotency_keys where key = ${data.idempotencyKey} and response_json is null`;
    };

    let profile;
    try {
      profile = await loadProfile(context.userId);
      if (!profile) throw new Error("Complete your profile first");

      const pinOk = await verifySecret(profile.pin_hash, data.pin);
      await requireVerifiedEmail(context.userId);
      if (!pinOk) throw new Error("Incorrect withdrawal PIN");
      await sql`update profiles set pin_verified_at = now(), failed_pin_attempts = 0, pin_locked_until = null where user_id = ${context.userId}`;

      const amountTambala = kwachaToTambala(data.amountKwacha);
      if (!profile.phone_verified_at) {
        throw new Error(
          "Verify your registered number first: make a successful deposit from " +
            profile.phone +
            ". Once that deposit lands, withdrawals unlock.",
        );
      }
      const { assertWithdrawAllowed } = await import("./withdraw-limits.server");
      await assertWithdrawAllowed(sql, {
        userId: context.userId,
        profile,
        amountTambala,
      });
    } catch (err) {
      await releaseKey();
      throw err;
    }

    const amount = kwachaToTambala(data.amountKwacha);
    const reference = newReference("WTH");

    // Atomic: lock wallet row, debit, insert processing transaction.
    let prepared;
    try {
      prepared = await withTransaction(async (tx) => {
      const wallets = await tx<{ balance_tambala: number; payout_reserve_tambala: number }>`
        select balance_tambala, payout_reserve_tambala
        from wallets
        where user_id = ${context.userId}
        for update
      `;
      const balance = asInt(wallets[0]?.balance_tambala);
      const amountErr = validateWithdrawAmount(data.amountKwacha, balance);
      if (amountErr) throw new Error(amountErr);

      const reserveShare = Math.min(
        asInt(wallets[0]?.payout_reserve_tambala),
        Math.round(amount * (0.03 / 0.94)),
      );

      const updated = await tx<{ balance_tambala: number }>`
        update wallets
        set balance_tambala = balance_tambala - ${amount},
            lifetime_withdrawn_tambala = lifetime_withdrawn_tambala + ${amount},
            payout_reserve_tambala = greatest(payout_reserve_tambala - ${reserveShare}, 0),
            updated_at = now()
        where user_id = ${context.userId} and balance_tambala >= ${amount}
        returning balance_tambala
      `;
      if (!updated.length) throw new Error("You can only withdraw the amount shown in your account");

      const inserted = await tx<{ id: number }>`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, phone, reference, note
        ) values (
          ${context.userId}, ${"withdrawal"}, ${"processing"}, ${amount}, ${amount},
          ${0}, ${reserveShare}, ${profile.phone}, ${reference},
          ${`Withdraw ${formatKwacha(amount)} to registered number ${profile.phone}`}
        )
        returning id
      `;
      return {
        txId: inserted[0]!.id,
        remaining: asInt(updated[0]?.balance_tambala),
        reserveShare,
      };
      });
    } catch (err) {
      await releaseKey();
      throw err;
    }

    // Outside the DB transaction: talk to PayChangu (or demo).
    try {
      if (paychanguConfigured()) {
        const payout = await initiateMomoPayout({
          phone: profile.phone,
          amountKwacha: tambalaToKwacha(amount),
          chargeId: reference,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
        });
        const status = String(payout.status ?? "").toLowerCase();
        // Provider accepted the request. Terminal success statuses vary by operator;
        // treat explicit failure as failure, everything else as success for now
        // (async payout confirmation can be added when a payout webhook is available).
        if (status === "failed" || status === "failure" || status === "rejected") {
          throw new Error(`Payout rejected by provider (${status})`);
        }
      }

      await withTransaction(async (tx) => {
        await finalizeWithdrawalSuccess(tx, {
          txId: prepared.txId,
          amount,
          reserveShare: prepared.reserveShare,
        });
      });
      // Near-limit withdrawal may unlock the next daily-cap tier (after 31 days on current tier).
      try {
        const { maybeRaiseCapAfterNearLimitWithdraw } = await import("./withdraw-limits.server");
        await maybeRaiseCapAfterNearLimitWithdraw(sql, {
          userId: context.userId,
          amountTambala: amount,
          profile,
        });
      } catch (capErr) {
        console.error("[withdraw-cap] raise failed:", (capErr as Error).message);
      }
    } catch (err) {
      await withTransaction(async (tx) => {
        await finalizeWithdrawalFailure(tx, {
          txId: prepared.txId,
          userId: context.userId,
          amount,
          reserveShare: prepared.reserveShare,
          note: String((err as Error).message ?? "payout failed"),
        });
      });
      await releaseKey();
      throw new Error("Withdrawal could not be sent. Your balance was not taken.");
    }

    const result = {
      ok: true as const,
      reference,
      amountTambala: amount,
      phone: profile.phone,
      remainingTambala: prepared.remaining,
    };
    await storeIdempotencyResponse(sql, data.idempotencyKey, result);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      action: "withdraw_success",
      userId: context.userId,
      detail: `ref=${reference} amount=${amount}`,
    });
    return result;
  });

export const resetPinWithQuestion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ answer: z.string().min(1), newPin: pinSchema }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret, hashSecret, normalizeAnswer } = await import("./crypto");
    const { assertRateLimit } = await import("./rate-limit.server");
    const sql = await getSql();
    await assertRateLimit(sql, {
      bucket: `pin-reset:${context.userId}`,
      limit: 5,
      windowSeconds: 60 * 60,
      message: "Too many PIN reset attempts. Try again in an hour.",
    });
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const ok = await verifySecret(profile.security_answer_hash, normalizeAnswer(data.answer));
    if (!ok) throw new Error("That answer does not match");
    const pinHash = await hashSecret(data.newPin);
    const { PIN_RESET_WITHDRAW_HOLD_MS } = await import("./constants");
    const { extendWithdrawHold } = await import("./withdraw-limits.server");
    await sql`
      update profiles
      set pin_hash = ${pinHash},
          failed_pin_attempts = 0,
          pin_locked_until = null,
          pin_verified_at = now(),
          updated_at = now()
      where user_id = ${context.userId}
    `;
    await extendWithdrawHold(
      sql,
      context.userId,
      new Date(Date.now() + PIN_RESET_WITHDRAW_HOLD_MS),
    );
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, { action: "pin_reset", userId: context.userId, detail: "security question reset; 24h withdraw hold" });
    return {
      ok: true as const,
      question: profile.security_question,
      withdrawHoldMessage:
        "Withdrawals are on a short hold for 24 hours after a PIN reset. Your balance is safe.",
    };
  });

export const getSecurityQuestion = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    return { question: profile.security_question };
  });

export const changeLoginPref = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pref: z.enum(["username", "email", "phone"]) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`update profiles set login_identifier_pref = ${data.pref}, updated_at = now() where user_id = ${context.userId}`;
    return { ok: true as const, pref: data.pref };
  });

export const changePasswordFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { hashPassword, verifyPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    const accounts = await sql<{ password: string | null }>`
      select password from "account" where "userId" = ${context.userId} and "providerId" = ${"credential"} limit 1
    `;
    const currentHash = accounts[0]?.password;
    if (!currentHash) throw new Error("No password is set on this account");
    const matches = await (verifyPassword as unknown as (hash: string, password: string) => Promise<boolean>)(
      currentHash,
      data.currentPassword,
    );
    if (!matches) throw new Error("Current password is incorrect");
    const next = await hashPassword(data.newPassword);
    await sql`
      update "account" set password = ${next}, "updatedAt" = now()
      where "userId" = ${context.userId} and "providerId" = ${"credential"}
    `;
    await sql`update profiles set must_change_password = false, updated_at = now() where user_id = ${context.userId}`;
    // Revoke every session so other devices must sign in again with the new password.
    await sql`delete from "session" where "userId" = ${context.userId}`;
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      action: "password_change",
      userId: context.userId,
      detail: "password updated; all sessions revoked",
    });
    return { ok: true as const, sessionsRevoked: true as const };
  });

export const changePinFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ currentPin: pinSchema, newPin: pinSchema, password: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret, hashSecret } = await import("./crypto");
    const { verifyPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const accounts = await sql<{ password: string | null }>`
      select password from "account" where "userId" = ${context.userId} and "providerId" = ${"credential"} limit 1
    `;
    const currentHash = accounts[0]?.password;
    if (!currentHash) throw new Error("No password is set on this account");
    const pwOk = await (verifyPassword as unknown as (hash: string, password: string) => Promise<boolean>)(
      currentHash,
      data.password,
    );
    if (!pwOk) throw new Error("Password is incorrect");
    const ok = await verifySecret(profile.pin_hash, data.currentPin);
    if (!ok) throw new Error("Current PIN is incorrect");
    const pinHash = await hashSecret(data.newPin);
    await sql`
      update profiles set pin_hash = ${pinHash}, pin_verified_at = now(), failed_pin_attempts = 0, updated_at = now()
      where user_id = ${context.userId}
    `;
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, { action: "pin_change", userId: context.userId });
    try {
      const { issueSecurityToken } = await import("./security-tokens.server");
      const { sendSecurityAlertEmail } = await import("./mail.server");
      const { url } = await issueSecurityToken(sql, {
        userId: context.userId,
        action: "pin_change",
      });
      void sendSecurityAlertEmail({
        to: profile.email,
        firstName: profile.first_name,
        kind: "pin_change",
        secureUrl: url,
        detailLines: [
          `When: ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Blantyre" })} (Malawi time)`,
        ],
      });
    } catch (err) {
      console.error("[pin_change] alert:", (err as Error).message);
    }
    return { ok: true as const };
  });


export const signOutOtherDevices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    // Better Auth session token is in the cookie; we cannot easily keep "this" session
    // without the token id, so revoke all — the client should sign in again or the
    // current request already completed. Prefer: delete all sessions (user signs in again).
    await sql`delete from "session" where "userId" = ${context.userId}`;
    await writeAudit(sql, {
      action: "session_revoke_others",
      userId: context.userId,
      detail: "all sessions revoked",
    });
    return { ok: true as const };
  });

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pin: pinSchema, confirm: z.literal("DELETE") }))
  .handler(async ({ context, data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { verifySecret } = await import("./crypto");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (profile.role === "admin") throw new Error("The platform admin account cannot be deleted");
    const ok = await verifySecret(profile.pin_hash, data.pin);
    if (!ok) throw new Error("Incorrect PIN");

    const wallets = await sql<{ balance_tambala: number }>`
      select balance_tambala from wallets where user_id = ${context.userId} limit 1
    `;
    if (asInt(wallets[0]?.balance_tambala) > 0) {
      throw new Error(
        "Withdraw your balance to zero before deleting this account. A vault with money cannot be closed.",
      );
    }
    const pending = await sql<{ n: number }>`
      select count(*)::int as n from transactions
      where user_id = ${context.userId} and status in (${"pending"}, ${"processing"})
    `;
    if (asInt(pending[0]?.n) > 0) {
      throw new Error(
        "You still have a deposit or withdrawal in progress. Wait for it to finish before deleting.",
      );
    }

    const tombstone = `deleted_${context.userId.slice(0, 12)}`;
    await withTransaction(async (tx) => {
      // Keep profile + transactions for audit; strip personal data and block login.
      await tx`
        update profiles
        set first_name = ${"Deleted"},
            last_name = ${"User"},
            email = ${`${tombstone}@deleted.local`},
            phone = ${tombstone},
            username = ${tombstone},
            pin_hash = ${"deleted"},
            security_answer_hash = ${"deleted"},
            deleted_at = now(),
            pin_verified_at = null,
            updated_at = now()
        where user_id = ${context.userId}
      `;
      await tx`delete from "session" where "userId" = ${context.userId}`;
      await tx`delete from "account" where "userId" = ${context.userId}`;
      // Free the Better Auth email unique slot without losing the user id link.
      await tx`
        update "user"
        set email = ${`${tombstone}@deleted.local`},
            name = ${"Deleted User"},
            "updatedAt" = now()
        where "id" = ${context.userId}
      `;
    });
    await writeAudit(sql, {
      action: "account_delete",
      userId: context.userId,
      detail: "soft-delete; ledger retained",
    });
    return { ok: true as const };
  });

async function requireVerifiedEmail(userId: string) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ emailVerified: boolean }>`
    select "emailVerified" from "user" where id = ${userId} limit 1
  `;
  if (!rows[0]?.emailVerified) {
    throw new Error(
      "Verify your email before moving money. Open the link we sent, or resend it from Profile.",
    );
  }
}

async function requireAdmin(userId: string) {
  const profile = await loadProfile(userId);
  if (!profile || profile.role !== "admin") throw new Error("Admin only");
  return profile;
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const { ensureAdmin } = await import("./seed-admin.server");
    await ensureAdmin();
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { demoPaymentsEnabled } = await import("./paychangu.server");
    const sql = await getSql();

    const users = await sql<{ n: number }>`select count(*)::int as n from profiles where role = ${"user"}`;
    const wallet = await sql<{ bal: number; res: number }>`
      select coalesce(sum(balance_tambala),0)::bigint as bal, coalesce(sum(payout_reserve_tambala),0)::bigint as res from wallets
    `;
    const money = await sql<{
      deposits: number;
      withdrawals: number;
      profit: number;
      pending: number;
    }>`
      select
        coalesce(sum(case when kind = 'deposit' and status = 'success' then gross_tambala else 0 end), 0)::bigint as deposits,
        coalesce(sum(case when kind = 'withdrawal' and status = 'success' then gross_tambala else 0 end), 0)::bigint as withdrawals,
        coalesce(sum(case when kind = 'deposit' and status = 'success' then platform_profit_tambala else 0 end), 0)::bigint as profit,
        coalesce(sum(case when status in ('pending', 'processing') then 1 else 0 end), 0)::int as pending
      from transactions
    `;
    const seriesRows = await sql<{ day: string; deposits: number; withdrawals: number; profit: number }>`
      select
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
        coalesce(sum(case when kind = 'deposit' and status = 'success' then gross_tambala else 0 end), 0)::bigint as deposits,
        coalesce(sum(case when kind = 'withdrawal' and status = 'success' then gross_tambala else 0 end), 0)::bigint as withdrawals,
        coalesce(sum(case when kind = 'deposit' and status = 'success' then platform_profit_tambala else 0 end), 0)::bigint as profit
      from transactions
      where created_at > now() - interval '14 days'
      group by 1
      order by 1
    `;

    return {
      userCount: asInt(users[0]?.n),
      totalDepositsTambala: asInt(money[0]?.deposits),
      totalWithdrawalsTambala: asInt(money[0]?.withdrawals),
      userBalancesTambala: asInt(wallet[0]?.bal),
      platformProfitTambala: asInt(money[0]?.profit),
      payoutReserveTambala: asInt(wallet[0]?.res),
      pendingCount: asInt(money[0]?.pending),
      demoPayments: demoPaymentsEnabled(),
      series: seriesRows.map((r) => ({
        day: String(r.day).slice(0, 10),
        deposits: asInt(r.deposits),
        withdrawals: asInt(r.withdrawals),
        profit: asInt(r.profit),
      })),
    };
  });

export const adminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<
      ProfileRow & { balance_tambala: number; lifetime_deposited_tambala: number; lifetime_withdrawn_tambala: number }
    >`
      select p.*, coalesce(w.balance_tambala,0) as balance_tambala,
             coalesce(w.lifetime_deposited_tambala,0) as lifetime_deposited_tambala,
             coalesce(w.lifetime_withdrawn_tambala,0) as lifetime_withdrawn_tambala
      from profiles p
      left join wallets w on w.user_id = p.user_id
      where p.deleted_at is null
      order by p.created_at desc
    `;
    return rows.map((r) => ({
      ...toPublic(r),
      balanceTambala: asInt(r.balance_tambala),
      lifetimeDepositedTambala: asInt(r.lifetime_deposited_tambala),
      lifetimeWithdrawnTambala: asInt(r.lifetime_withdrawn_tambala),
    }));
  });

export const adminTransactions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Array<PublicTx & { username: string }>> => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      kind: string;
      status: string;
      gross_tambala: number;
      credited_tambala: number;
      phone: string | null;
      reference: string;
      note: string | null;
      created_at: unknown;
      username: string;
    }>`
      select t.id, t.kind, t.status, t.gross_tambala, t.credited_tambala, t.phone, t.reference, t.note, t.created_at, p.username
      from transactions t
      join profiles p on p.user_id = t.user_id
      order by t.created_at desc
      limit 80
    `;
    return rows.map((r) => ({
      id: asInt(r.id),
      kind: r.kind === "withdrawal" ? "withdrawal" : "deposit",
      status:
        r.status === "success"
          ? "success"
          : r.status === "failed"
            ? "failed"
            : r.status === "processing"
              ? "processing"
              : "pending",
      grossTambala: asInt(r.gross_tambala),
      creditedTambala: asInt(r.credited_tambala),
      phone: r.phone,
      reference: r.reference,
      note: r.note,
      createdAt: iso(r.created_at) ?? new Date().toISOString(),
      username: r.username,
    }));
  });


export const changeRegisteredPhone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      newPhone: z.string().min(8),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { normalizeMwPhone } = await import("./phone");
    const { verifyPassword } = await import("better-auth/crypto");
    const { PHONE_CHANGE_WITHDRAW_HOLD_MS } = await import("./constants");
    const { extendWithdrawHold, formatHoldUntil } = await import("./withdraw-limits.server");
    const sql = await getSql();

    const phone = normalizeMwPhone(data.newPhone);
    if (!phone) throw new Error("Enter a valid Malawi mobile number (Airtel 09x or TNM 08x)");

    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (profile.phone === phone) throw new Error("That is already your registered number");

    const accounts = await sql<{ password: string | null }>`
      select password from "account" where "userId" = ${context.userId} and "providerId" = ${"credential"} limit 1
    `;
    const currentHash = accounts[0]?.password;
    if (!currentHash) throw new Error("No password is set on this account");
    const matches = await (verifyPassword as unknown as (hash: string, password: string) => Promise<boolean>)(
      currentHash,
      data.password,
    );
    if (!matches) throw new Error("Password is incorrect");

    const clash = await sql<{ n: number }>`
      select count(*)::int as n from profiles where phone = ${phone} and user_id <> ${context.userId}
    `;
    if (asInt(clash[0]?.n) > 0) throw new Error("That phone number is already registered");

    const previousPhone = profile.phone;
    await sql`
      update profiles
      set phone = ${phone},
          previous_phone = ${previousPhone},
          phone_verified_at = null,
          updated_at = now()
      where user_id = ${context.userId}
    `;
    const until = new Date(Date.now() + PHONE_CHANGE_WITHDRAW_HOLD_MS);
    await extendWithdrawHold(sql, context.userId, until);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      action: "phone_change",
      userId: context.userId,
      detail: `new phone; 72h hold until ${until.toISOString()}`,
    });
    try {
      const { issueSecurityToken } = await import("./security-tokens.server");
      const { sendSecurityAlertEmail } = await import("./mail.server");
      const { formatPhoneDisplay } = await import("./phone");
      const { url } = await issueSecurityToken(sql, {
        userId: context.userId,
        action: "phone_change",
        payload: { previousPhone },
      });
      void sendSecurityAlertEmail({
        to: profile.email,
        firstName: profile.first_name,
        kind: "phone_change",
        secureUrl: url,
        detailLines: [
          `Previous number: ${formatPhoneDisplay(previousPhone)}`,
          `New number: ${formatPhoneDisplay(phone)}`,
          `When: ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Blantyre" })} (Malawi time)`,
        ],
      });
    } catch (err) {
      console.error("[phone_change] alert:", (err as Error).message);
    }
    return {
      ok: true as const,
      phone,
      withdrawHoldUntil: until.toISOString(),
      message:
        `Registered number updated. Withdrawals are on a short hold until ${formatHoldUntil(until)}. Your balance is safe.`,
    };
  });


export const getPlatformSupportPhone = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await loadProfile(context.userId);
    if (!profile || profile.role !== "admin") throw new Error("Admin only");
    const { getSql } = await import("@/lib/db");
    const { getSupportPhone } = await import("./withdraw-limits.server");
    const sql = await getSql();
    return { phone: await getSupportPhone(sql) };
  });

export const setPlatformSupportPhone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ phone: z.string().min(8).max(20) }))
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile || profile.role !== "admin") throw new Error("Admin only");
    const { getSql } = await import("@/lib/db");
    const { normalizeMwPhone } = await import("./phone");
    const { setSupportPhone } = await import("./withdraw-limits.server");
    const phone = normalizeMwPhone(data.phone);
    if (!phone) throw new Error("Enter a valid Malawi mobile number");
    const sql = await getSql();
    await setSupportPhone(sql, phone);
    return { ok: true as const, phone };
  });

export const runReconciliationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await loadProfile(context.userId);
    if (!profile || profile.role !== "admin") throw new Error("Admin only");
    const { runReconciliation } = await import("./reconcile.server");
    return runReconciliation();
  });

/** Public: inspect a secure-account email token (no login required). */
export const inspectSecureToken = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().min(20) }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { loadValidToken } = await import("./security-tokens.server");
    const sql = await getSql();
    const row = await loadValidToken(sql, data.token);
    if (!row) return { ok: false as const, reason: "invalid" as const };
    const profiles = await sql<{ first_name: string; email: string; previous_phone: string | null; phone: string }>`
      select first_name, email, previous_phone, phone from profiles
      where user_id = ${row.user_id} and deleted_at is null limit 1
    `;
    const p = profiles[0];
    if (!p) return { ok: false as const, reason: "invalid" as const };
    return {
      ok: true as const,
      action: row.action,
      firstName: p.first_name,
      previousPhone: (row.payload?.previousPhone as string | undefined) ?? p.previous_phone,
      currentPhone: p.phone,
    };
  });

/**
 * Secure account from email link: set a new password (proves identity),
 * revoke all sessions, and for phone_change restore the previous number.
 */
export const secureAccountWithPassword = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().min(20),
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
      restorePhone: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { loadValidToken, consumeToken } = await import("./security-tokens.server");
    const { hashPassword, verifyPassword } = await import("better-auth/crypto");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const row = await loadValidToken(sql, data.token);
    if (!row) throw new Error("This secure link is invalid or has expired. Request a new one by changing settings again, or contact support.");
    if (row.action === "pin_change") {
      throw new Error("Use the PIN form on this page for PIN alerts.");
    }
    if (row.action === "password_reset") {
      throw new Error("Use the password reset page from your email link.");
    }

    const accounts = await sql<{ password: string | null }>`
      select password from "account" where "userId" = ${row.user_id} and "providerId" = ${"credential"} limit 1
    `;
    const currentHash = accounts[0]?.password;
    if (!currentHash) throw new Error("No password is set on this account");
    const matches = await (verifyPassword as unknown as (hash: string, password: string) => Promise<boolean>)(
      currentHash,
      data.currentPassword,
    );
    if (!matches) throw new Error("Current password is incorrect");

    const next = await hashPassword(data.newPassword);
    const previousPhone =
      (row.payload?.previousPhone as string | undefined) ||
      (
        await sql<{ previous_phone: string | null }>`
          select previous_phone from profiles where user_id = ${row.user_id} limit 1
        `
      )[0]?.previous_phone;

    await withTransaction(async (tx) => {
      await tx`
        update "account" set password = ${next}, "updatedAt" = now()
        where "userId" = ${row.user_id} and "providerId" = ${"credential"}
      `;
      await tx`delete from "session" where "userId" = ${row.user_id}`;
      if (row.action === "phone_change" && data.restorePhone !== false && previousPhone) {
        await tx`
          update profiles
          set phone = ${previousPhone},
              previous_phone = null,
              phone_verified_at = null,
              updated_at = now()
          where user_id = ${row.user_id}
        `;
      }
      await consumeToken(tx as unknown as typeof sql, row.id);
    });

    await writeAudit(sql, {
      action: "secure_account_password",
      userId: row.user_id,
      detail: `from ${row.action}; sessions revoked; restorePhone=${Boolean(row.action === "phone_change" && previousPhone)}`,
    });

    return {
      ok: true as const,
      phoneRestored: Boolean(row.action === "phone_change" && previousPhone && data.restorePhone !== false),
      sessionsRevoked: true as const,
    };
  });

/** Secure from PIN-change alert: password + new PIN, revoke all sessions. */
export const secureAccountWithPin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().min(20),
      password: z.string().min(1),
      newPin: pinSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { loadValidToken, consumeToken } = await import("./security-tokens.server");
    const { verifyPassword } = await import("better-auth/crypto");
    const { hashSecret } = await import("./crypto");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const row = await loadValidToken(sql, data.token);
    if (!row) throw new Error("This secure link is invalid or has expired.");
    if (row.action !== "pin_change" && row.action !== "new_device") {
      // allow new_device to set pin too? user asked pin_change specifically; keep pin_change only
    }
    if (row.action !== "pin_change") {
      throw new Error("Use the password form on this page for this alert.");
    }

    const accounts = await sql<{ password: string | null }>`
      select password from "account" where "userId" = ${row.user_id} and "providerId" = ${"credential"} limit 1
    `;
    const currentHash = accounts[0]?.password;
    if (!currentHash) throw new Error("No password is set on this account");
    const matches = await (verifyPassword as unknown as (hash: string, password: string) => Promise<boolean>)(
      currentHash,
      data.password,
    );
    if (!matches) throw new Error("Password is incorrect");

    const pinHash = await hashSecret(data.newPin);
    await withTransaction(async (tx) => {
      await tx`
        update profiles
        set pin_hash = ${pinHash},
            pin_verified_at = null,
            failed_pin_attempts = 0,
            updated_at = now()
        where user_id = ${row.user_id}
      `;
      await tx`delete from "session" where "userId" = ${row.user_id}`;
      await consumeToken(tx as unknown as typeof sql, row.id);
    });

    await writeAudit(sql, {
      action: "secure_account_pin",
      userId: row.user_id,
      detail: "pin reset via secure link; sessions revoked",
    });

    return { ok: true as const, sessionsRevoked: true as const };
  });


/** Request a password-reset email. Always returns ok (no account enumeration). */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ identifier: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { assertRateLimit } = await import("./rate-limit.server");
    const { normalizeMwPhone } = await import("./phone");
    const { issueSecurityToken } = await import("./security-tokens.server");
    const { sendMail } = await import("./mail.server");
    const { APP_NAME } = await import("./constants");
    const sql = await getSql();
    const raw = data.identifier.trim();
    await assertRateLimit(sql, {
      bucket: `pw-reset:${raw.toLowerCase().slice(0, 64)}`,
      limit: 5,
      windowSeconds: 60 * 60,
      message: "Too many reset attempts. Try again later.",
    });

    const phone = normalizeMwPhone(raw);
    const rows = await sql<{ user_id: string; email: string; first_name: string }>`
      select user_id, email, first_name from profiles
      where deleted_at is null
        and (
          lower(email) = ${raw.toLowerCase()}
          or lower(username) = ${raw.toLowerCase()}
          or phone = ${phone ?? "__none__"}
        )
      limit 1
    `;
    const profile = rows[0];
    if (profile) {
      try {
        const { url } = await issueSecurityToken(sql, {
          userId: profile.user_id,
          action: "password_reset",
          ttlHours: 2,
        });
        const subject = `${APP_NAME}: reset your password`;
        const text = [
          `Hi ${profile.first_name},`,
          ``,
          `We received a request to reset your ${APP_NAME} password.`,
          `Open this link within 2 hours:`,
          url,
          ``,
          `If you did not ask for this, you can ignore this email. Your password will stay the same.`,
          ``,
          `— ${APP_NAME}`,
        ].join("\n");
        const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;padding:24px">
          <p>Hi ${profile.first_name},</p>
          <p>We received a request to reset your ${APP_NAME} password.</p>
          <p><a href="${url}" style="display:inline-block;background:#3dcf8e;color:#062016;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Reset password</a></p>
          <p style="font-size:12px;color:#666;word-break:break-all">${url}</p>
          <p style="font-size:12px;color:#666">This link expires in 2 hours. If you did not request it, ignore this email.</p>
        </body></html>`;
        void sendMail({ to: profile.email, subject, text, html });
      } catch (err) {
        console.error("[password-reset]", (err as Error).message);
      }
    }
    return {
      ok: true as const,
      message: "If an account matches, we sent a reset link to the registered email.",
    };
  });

export const inspectPasswordResetToken = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().min(20) }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { loadValidToken } = await import("./security-tokens.server");
    const sql = await getSql();
    const row = await loadValidToken(sql, data.token);
    if (!row || row.action !== "password_reset") return { ok: false as const };
    return { ok: true as const };
  });

/** Complete password reset from email link — no current password required. */
export const completePasswordReset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().min(20),
      newPassword: z.string().min(8).max(128),
    }),
  )
  .handler(async ({ data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { loadValidToken, consumeToken } = await import("./security-tokens.server");
    const { hashPassword } = await import("better-auth/crypto");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const row = await loadValidToken(sql, data.token);
    if (!row || row.action !== "password_reset") {
      throw new Error("This reset link is invalid or has expired. Request a new one from the sign-in page.");
    }
    const next = await hashPassword(data.newPassword);
    await withTransaction(async (tx) => {
      await tx`
        update "account" set password = ${next}, "updatedAt" = now()
        where "userId" = ${row.user_id} and "providerId" = ${"credential"}
      `;
      await tx`delete from "session" where "userId" = ${row.user_id}`;
      await consumeToken(tx as unknown as typeof sql, row.id);
    });
    await writeAudit(sql, {
      action: "password_reset",
      userId: row.user_id,
      detail: "password reset via email link; sessions revoked",
    });
    return { ok: true as const, sessionsRevoked: true as const };
  });


export const resendVerificationEmailFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { assertRateLimit } = await import("./rate-limit.server");
    const sql = await getSql();
    await assertRateLimit(sql, {
      bucket: `email-verify:${context.userId}`,
      limit: 5,
      windowSeconds: 60 * 60,
      message: "Too many verification emails. Try again later.",
    });
    const rows = await sql<{ email: string; emailVerified: boolean }>`
      select email, "emailVerified" from "user" where id = ${context.userId} limit 1
    `;
    const u = rows[0];
    if (!u) throw new Error("Account not found");
    if (u.emailVerified) return { ok: true as const, alreadyVerified: true as const };
    // Better Auth client-side resend is preferred; server triggers via API if available.
    const { auth } = await import("@/lib/auth/server");
    try {
      // Internal helper: send verification for this email
      await auth.api.sendVerificationEmail({
        body: { email: u.email, callbackURL: "/" },
        headers: new Headers(),
      });
    } catch (err) {
      console.error("[resend-verify]", (err as Error).message);
      throw new Error("Could not send verification email. Check SMTP settings or try again later.");
    }
    return { ok: true as const, alreadyVerified: false as const };
  });


export const changeLockPreference = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      mode: z.enum(["instant", "idle"]),
      idleMinutes: z.number().int().min(1).max(60).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const minutes = data.mode === "idle" ? (data.idleMinutes ?? 5) : 5;
    await sql`
      update profiles
      set lock_mode = ${data.mode},
          lock_idle_minutes = ${minutes},
          updated_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true as const, mode: data.mode, idleMinutes: minutes };
  });


export type PublicSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
};

/** List active sessions for the signed-in user. */
export const listActiveSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PublicSession[]> => {
    const { getSql } = await import("@/lib/db");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { auth } = await import("@/lib/auth/server");
    const sql = await getSql();
    const request = getRequest();
    let currentId: string | null = null;
    try {
      const sess = await auth.api.getSession({ headers: request.headers });
      currentId = sess?.session?.id ?? null;
    } catch {
      currentId = null;
    }

    const rows = await sql<{
      id: string;
      createdAt: unknown;
      updatedAt: unknown;
      expiresAt: unknown;
      ipAddress: string | null;
      userAgent: string | null;
    }>`
      select id, "createdAt", "updatedAt", "expiresAt", "ipAddress", "userAgent"
      from "session"
      where "userId" = ${context.userId}
        and "expiresAt" > now()
      order by "updatedAt" desc
      limit 40
    `;
    return rows.map((r) => ({
      id: r.id,
      createdAt: iso(r.createdAt) ?? new Date().toISOString(),
      updatedAt: iso(r.updatedAt) ?? new Date().toISOString(),
      expiresAt: iso(r.expiresAt) ?? new Date().toISOString(),
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      isCurrent: currentId === r.id,
    }));
  });

/** Revoke one session by id (must belong to the caller). */
export const revokeSessionById = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ sessionId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const deleted = await sql<{ id: string }>`
      delete from "session"
      where id = ${data.sessionId} and "userId" = ${context.userId}
      returning id
    `;
    if (!deleted.length) throw new Error("Session not found");
    await writeAudit(sql, {
      action: "session_revoke_one",
      userId: context.userId,
      detail: `session ${data.sessionId}`,
    });
    return { ok: true as const };
  });
