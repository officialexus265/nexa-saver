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
  .min(2)
  .max(32)
  .refine((s) => !/\s/.test(s), { message: "Username cannot contain spaces" })
  .refine(
    (s) =>
      // Letters, numbers, underscore, and emoji (including ZWJ sequences / variation selectors)
      /^[\p{L}\p{N}_\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(s),
    {
      message: "Username may use letters, numbers, underscores, and emojis",
    },
  );

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
  anchor_email?: string | null;
  anchor_phone?: string | null;
  bank_uuid?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  bank_verified_at?: unknown;
  bank_hold_until?: unknown;
  bank_updated_at?: unknown;
  anchor_bank_uuid?: string | null;
  anchor_bank_name?: string | null;
  anchor_bank_account_number?: string | null;
  anchor_bank_account_name?: string | null;
  admin_locked_at?: unknown;
  admin_lock_reason?: string | null;
  admin_withdraw_locked_at?: unknown;
  admin_withdraw_lock_reason?: string | null;
  withdraw_lock_until?: unknown;
  withdraw_lock_started_at?: unknown;
  withdraw_lock_cooling_ends_at?: unknown;
  withdraw_lock_original_until?: unknown;
  gender?: string | null;
};

function toPublic(row: ProfileRow): PublicProfile {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    phoneVerified: Boolean(row.phone_verified_at),
    bankName: row.bank_name ?? null,
    bankAccountNumberMasked: row.bank_account_number
      ? `****${String(row.bank_account_number).slice(-4)}`
      : null,
    bankAccountName: row.bank_account_name ?? null,
    bankVerified: Boolean(row.bank_verified_at),
    bankHoldUntil: iso(row.bank_hold_until),
    hasBankDetails: Boolean(row.bank_uuid && row.bank_account_number),
    adminLocked: Boolean(row.admin_locked_at),
    adminWithdrawLocked: Boolean(row.admin_withdraw_locked_at),
    adminWithdrawLockReason: row.admin_withdraw_lock_reason
      ? String(row.admin_withdraw_lock_reason)
      : null,
    withdrawLockUntil: row.withdraw_lock_until
      ? new Date(row.withdraw_lock_until as string | Date).toISOString()
      : null,

    adminLockReason: row.admin_lock_reason ?? null,
    lockMode:
      row.lock_mode === "instant" ? "instant" : row.lock_mode === "off" ? "off" : "idle",
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
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const before = await sql<{ n: number }>`select count(*)::int as n from profiles where role = ${"admin"}`;
  const hadAdmin = asInt(before[0]?.n) > 0;
  const { ensureAdmin } = await import("./seed-admin.server");
  await ensureAdmin();
  // ensureAdmin is a no-op when an admin profile already exists (no password reset).
  return { ok: true as const, alreadyExisted: hadAdmin };
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
  referralCode: z.string().trim().max(24).optional(),
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

    let referredBy: string | null = null;
    let referralCodeUsed: string | null = null;
    const codeRaw = (data.referralCode ?? "").trim().toUpperCase();
    if (codeRaw) {
      try {
        const aff = await sql<{ user_id: string; affiliate_code: string }>`
          select user_id, affiliate_code from profiles
          where upper(affiliate_code) = ${codeRaw} and affiliate_joined_at is not null
          limit 1
        `;
        if (aff[0] && aff[0].user_id !== context.userId) {
          referredBy = aff[0].user_id;
          referralCodeUsed = aff[0].affiliate_code;
        }
      } catch {
        /* columns may not exist yet */
      }
    }

    await sql`
      insert into profiles (
        user_id, first_name, last_name, email, phone, username, date_of_birth, gender,
        pin_hash, security_question, security_answer_hash, role, login_identifier_pref,
        anchor_email, anchor_phone, referred_by_user_id, referral_code_used
      ) values (
        ${context.userId}, ${data.firstName}, ${data.lastName}, ${email}, ${phone},
        ${data.username}, ${data.dateOfBirth}, ${data.gender}, ${pinHash}, ${data.securityQuestion},
        ${answerHash}, ${"user"}, ${data.loginIdentifierPref ?? "username"},
        ${email}, ${phone}, ${referredBy}, ${referralCodeUsed}
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
    let needsAdminTotp = false;
    let adminTotpEnabled = false;
    let adminHasPasskey = false;
    let hasPasskey = false;
    let needsUserPasskey = false;
    try {
      const { isTotpElevated } = await import("./admin-totp.server");
      const { hasWebAuthn, adminNeedsSecondFactor } = await import("./webauthn.server");
      hasPasskey = await hasWebAuthn(sqlUser, context.userId);
      if (fresh.role === "admin") {
        const sf = await adminNeedsSecondFactor(sqlUser, context.userId);
        adminTotpEnabled = sf.totpEnabled;
        adminHasPasskey = sf.hasPasskey;
        if (sf.needs) {
          const sessionToken = session?.sessionToken ?? null;
          needsAdminTotp = !(await isTotpElevated(sqlUser, context.userId, sessionToken));
        }
      } else if (hasPasskey) {
        // Regular users: passkey-only second factor when enrolled
        const sessionToken = session?.sessionToken ?? null;
        needsUserPasskey = !(await isTotpElevated(sqlUser, context.userId, sessionToken));
      }
    } catch {
      /* migration not applied yet */
    }
    return {
      ok: true,
      needsProfile: false,
      emailVerified: Boolean(ev[0]?.emailVerified),
      profile: toPublic(fresh),
      pinUnlocked: pinWindowOpen(fresh.pin_verified_at),
      demoPayments: demoPaymentsEnabled(),
      needsAdminTotp,
      adminTotpEnabled,
      adminHasPasskey,
      hasPasskey,
      needsUserPasskey,
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

    // Do NOT rate-limit successful unlocks — only failed guesses (below).
    // Counting successes was locking users out after normal unlocks.

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
      // Soft global cap on wrong guesses only (abuse protection).
      await assertRateLimit(sql, {
        bucket: `pin-fail:${context.userId}`,
        limit: 30,
        windowSeconds: 60 * 60,
        message: "Too many incorrect PIN attempts. Try again later.",
      });
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
    // Clear legacy rate-limit buckets so a correct PIN always recovers access.
    await sql`delete from rate_limits where bucket in (${`pin:${context.userId}`}, ${`pin-fail:${context.userId}`})`;
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
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const { withdrawRoomTambala, holdMessage } = await import("./withdraw-limits.server");
    const room = await withdrawRoomTambala(sql, context.userId, profile);
    const holdUntil = room.holdUntilMs > 0 ? new Date(room.holdUntilMs).toISOString() : null;
    const holdMsg = room.holdUntilMs > 0 ? holdMessage(room.holdUntilMs) : null;
    const roomMeta = {
      withdrawHoldUntil: holdUntil,
      withdrawHoldMessage: holdMsg,
      dailyWithdrawCapTambala: room.capTambala,
      dailyWithdrawRemainingTambala: room.remainingTambala,
    };
    if (!pinWindowOpen(profile.pin_verified_at)) {
      return { ok: true, locked: true, ...roomMeta };
    }
    const wallets = await sql<{
      balance_tambala: number;
      received_balance_tambala: number;
      lifetime_deposited_tambala: number;
      lifetime_withdrawn_tambala: number;
    }>`select balance_tambala, coalesce(received_balance_tambala,0) as received_balance_tambala,
              lifetime_deposited_tambala, lifetime_withdrawn_tambala
       from wallets where user_id = ${context.userId}`;
    const w = wallets[0];
    return {
      ok: true,
      locked: false,
      balanceTambala: asInt(w?.balance_tambala),
      receivedBalanceTambala: asInt(w?.received_balance_tambala),
      lifetimeDepositedTambala: asInt(w?.lifetime_deposited_tambala),
      lifetimeWithdrawnTambala: asInt(w?.lifetime_withdrawn_tambala),
      ...roomMeta,
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
      kind:
        r.kind === "withdrawal"
          ? "withdrawal"
          : r.kind === "fee"
            ? "fee"
            : r.kind === "transfer_out"
              ? "transfer_out"
              : r.kind === "transfer_in"
                ? "transfer_in"
                : "deposit",
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
    const { assertMoneyInfraReady } = await import("./production-guards.server");
    assertMoneyInfraReady("Deposits");
    const sql = await getSql();

    const claim = await claimIdempotencyKey(sql, {
      key: data.idempotencyKey,
      userId: context.userId,
      action: "deposit",
    });
    if (claim.hit) return claim.response as DepositStart;

    try {
      const gross = kwachaToTambala(data.amountKwacha);
      const { getFeePolicy } = await import("./fee-policy.server");
      const policy = await getFeePolicy(sql);
      const split = splitDeposit(gross, {
        depositFeeRate: policy.depositFeeRate,
        platformProfitRate: policy.platformProfitRate,
        payoutReserveRate: policy.payoutReserveRate,
      });
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
          returnUrl: `${site}/deposit-return?ref=${encodeURIComponent(reference)}`,
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
    const owned = await sql<{
      id: number;
      status: string;
      gross_tambala: number;
      credited_tambala: number;
      platform_profit_tambala: number;
    }>`
      select id, status, gross_tambala, credited_tambala, platform_profit_tambala
      from transactions
      where reference = ${data.reference} and user_id = ${context.userId} limit 1
    `;
    if (!owned.length) throw new Error("Deposit not found");
    const row = owned[0];
    if (row.status === "success") {
      const gross = asInt(row.gross_tambala);
      const credited = asInt(row.credited_tambala);
      return {
        already: true as const,
        grossTambala: gross,
        creditedTambala: credited,
        feeTambala: gross - credited,
      };
    }
    const { paychanguConfigured, demoPaymentsEnabled, verifyPayment } = await import("./paychangu.server");
    if (!demoPaymentsEnabled()) {
      if (!paychanguConfigured()) throw new Error("Payments are not available right now");
      const result = await verifyPayment(data.reference);
      if (!result.ok) throw new Error("Payment is not confirmed yet. If money left your mobile wallet, contact support with this reference: " + data.reference);
      const verifiedTambala = kwachaToTambala(result.amount);
      if (verifiedTambala > 0 && verifiedTambala !== asInt(row.gross_tambala)) {
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
      method: z.enum(["momo", "bank"]).default("momo"),
      source: z.enum(["main", "received"]).default("main"),
      acceptBankFlatFee: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { verifySecret, newReference } = await import("./crypto");
    const { paychanguConfigured, demoPaymentsEnabled, initiateMomoPayout, initiateBankPayout } = await import("./paychangu.server");
    const { claimIdempotencyKey, storeIdempotencyResponse } = await import("./idempotency.server");
    const { finalizeWithdrawalSuccess, finalizeWithdrawalFailure } = await import("./ledger.server");
    if (!paychanguConfigured() && !demoPaymentsEnabled()) {
      throw new Error("Withdrawals are not available right now. Your balance was not touched.");
    }
    const { assertWithdrawalsAllowed } = await import("./kill-switch.server");
    assertWithdrawalsAllowed();
    const { assertMoneyInfraReady } = await import("./production-guards.server");
    assertMoneyInfraReady("Withdrawals");
    const sql = await getSql();
    const { getPayoutMethods, assertMethodAllowed } = await import("./payout-methods.server");
    const methods = await getPayoutMethods(sql);
    assertMethodAllowed(methods, data.method ?? "momo");

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
      if (profile.admin_locked_at) {
        throw new Error("This account is locked by support. Withdrawals are disabled until it is unlocked.");
      }
      if (profile.admin_withdraw_locked_at) {
        throw new Error(
          "Withdrawals are locked by the platform. Contact support via WhatsApp using the platform number. Deposits still work.",
        );
      }
      if (profile.withdraw_lock_until && new Date(profile.withdraw_lock_until as string | Date).getTime() > Date.now()) {
        const until = new Date(profile.withdraw_lock_until as string | Date).toLocaleString();
        throw new Error(
          `Your withdrawals are time-locked until ${until}. You can still deposit. Early unlock may cost a fee after the free cooling-off window.`,
        );
      }

      const pinOk = await verifySecret(profile.pin_hash, data.pin);
      await requireVerifiedEmail(context.userId);
      if (!pinOk) throw new Error("Incorrect withdrawal PIN");
      await sql`update profiles set pin_verified_at = now(), failed_pin_attempts = 0, pin_locked_until = null where user_id = ${context.userId}`;

      const amountTambala = kwachaToTambala(data.amountKwacha);
      const method = data.method ?? "momo";
      if (method === "bank") {
        const { BANK_FLAT_FEE_KWACHA, MIN_BANK_WITHDRAW_KWACHA } = await import("./constants");
        if (data.amountKwacha < MIN_BANK_WITHDRAW_KWACHA) {
          throw new Error(
            `Bank withdrawals need at least ${MIN_BANK_WITHDRAW_KWACHA} kwacha (minimum withdraw + 700 MWK bank flat fee).`,
          );
        }
      }

      if (method === "momo") {
        if (!profile.phone_verified_at) {
          throw new Error(
            "Verify your registered number first: make a successful deposit from " +
              profile.phone +
              ". Once that deposit lands, mobile withdrawals unlock.",
          );
        }
      } else {
        if (!profile.bank_uuid || !profile.bank_account_number || !profile.bank_account_name) {
          throw new Error("Add your bank payout details in Profile before withdrawing to bank.");
        }
        if (profile.bank_hold_until && new Date(String(profile.bank_hold_until)).getTime() > Date.now()) {
          throw new Error(
            "Bank withdrawals are on hold until " +
              new Date(String(profile.bank_hold_until)).toLocaleString() +
              ". This is normal after adding or changing bank details.",
          );
        }
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
      const source = data.source === "received" ? "received" : "main";
      const wallets = await tx<{
        balance_tambala: number;
        received_balance_tambala: number;
        payout_reserve_tambala: number;
      }>`
        select balance_tambala,
               coalesce(received_balance_tambala, 0) as received_balance_tambala,
               payout_reserve_tambala
        from wallets
        where user_id = ${context.userId}
        for update
      `;
      const mainBal = asInt(wallets[0]?.balance_tambala);
      const receivedBal = asInt(wallets[0]?.received_balance_tambala);
      const balance = source === "received" ? receivedBal : mainBal;
      const amountErr = validateWithdrawAmount(data.amountKwacha, balance);
      if (amountErr) throw new Error(amountErr);

      const reserveShare =
        source === "main"
          ? Math.min(
              asInt(wallets[0]?.payout_reserve_tambala),
              Math.round(amount * (0.03 / 0.94)),
            )
          : 0;

      let remaining = 0;
      if (source === "received") {
        const updated = await tx<{ received_balance_tambala: number }>`
          update wallets
          set received_balance_tambala = received_balance_tambala - ${amount},
              lifetime_withdrawn_tambala = lifetime_withdrawn_tambala + ${amount},
              updated_at = now()
          where user_id = ${context.userId} and received_balance_tambala >= ${amount}
          returning received_balance_tambala
        `;
        if (!updated.length) throw new Error("You can only withdraw what is in your received bag.");
        remaining = asInt(updated[0]?.received_balance_tambala);
      } else {
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
        remaining = asInt(updated[0]?.balance_tambala);
      }

      const bankNote =
        (data.method ?? "momo") === "bank"
          ? `Withdraw ${formatKwacha(amount)} from ${source} to bank ${profile.bank_name ?? ""} ****${String(profile.bank_account_number ?? "").slice(-4)} (700 MWK bank flat from this amount — not a NEXA fee)`
          : `Withdraw ${formatKwacha(amount)} from ${source} to registered number ${profile.phone}`;

      const inserted = await tx<{ id: number }>`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, phone, reference, note
        ) values (
          ${context.userId}, ${"withdrawal"}, ${"processing"}, ${amount}, ${amount},
          ${0}, ${reserveShare}, ${profile.phone}, ${reference},
          ${bankNote}
        )
        returning id
      `;
      return {
        txId: inserted[0]!.id,
        remaining,
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
        const method = data.method ?? "momo";
        let status = "pending";
        if (method === "bank") {
          const { BANK_FLAT_FEE_KWACHA } = await import("./constants");
          const grossKwacha = tambalaToKwacha(amount);
          if (grossKwacha <= BANK_FLAT_FEE_KWACHA) {
            throw new Error(
              `Bank withdrawals must be more than ${BANK_FLAT_FEE_KWACHA} kwacha so the bank flat fee can be covered.`,
            );
          }
          const netKwacha = grossKwacha - BANK_FLAT_FEE_KWACHA;
          // User is debited the full request; bank receives request − 700 (PayChangu bank flat, not a NEXA fee).
          const payout = await initiateBankPayout({
            bankUuid: String(profile.bank_uuid),
            accountName: String(profile.bank_account_name),
            accountNumber: String(profile.bank_account_number),
            amountKwacha: netKwacha,
            chargeId: reference,
            email: profile.email,
          });
          status = String(payout.status ?? "").toLowerCase();
          // Mark bank verified after provider accepts first successful-style response
          if (status !== "failed" && status !== "failure" && status !== "rejected") {
            await sql`
              update profiles
              set bank_verified_at = coalesce(bank_verified_at, now()), updated_at = now()
              where user_id = ${context.userId}
            `;
          }
        } else {
          const payout = await initiateMomoPayout({
            phone: profile.phone,
            amountKwacha: tambalaToKwacha(amount),
            chargeId: reference,
            email: profile.email,
            firstName: profile.first_name,
            lastName: profile.last_name,
          });
          status = String(payout.status ?? "").toLowerCase();
        }
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
      const reason = String((err as Error).message ?? "provider error").slice(0, 200);
      throw new Error(
        "Withdrawal could not be sent. Your balance was not taken. Details: " + reason,
      );
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
    const matches = await verifyPassword({ hash: currentHash, password: data.currentPassword, });
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
    const pwOk = await verifyPassword({ hash: currentHash, password: data.password, });
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

async function requireAdminSensitive(userId: string) {
  await requireAdmin(userId);
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const { requireAdminTotpElevation } = await import("./admin-totp.server");
  const sql = await getSql();
  const session = await getSessionUser();
  await requireAdminTotpElevation(sql, userId, session?.sessionToken ?? null);
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
    const { getProductionReadiness } = await import("./production-guards.server");
    const { depositsPaused, withdrawalsPaused } = await import("./kill-switch.server");
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

    let paidOut = 0;
    try {
      const treasury = await sql<{ paid: number }>`
        select coalesce(sum(gross_tambala), 0)::bigint as paid
        from treasury_payouts
        where status in (${"success"}, ${"processing"})
      `;
      paidOut = asInt(treasury[0]?.paid);
    } catch {
      paidOut = 0;
    }
    const bookProfit = asInt(money[0]?.profit);
    let unlockFees = 0;
    try {
      const feeRows = await sql<{ fees: number }>`
        select coalesce(sum(gross_tambala), 0)::bigint as fees
        from transactions
        where kind = ${"fee"} and status = ${"success"}
          and note ilike ${"%Early withdrawal unlock%"}
      `;
      unlockFees = asInt(feeRows[0]?.fees);
    } catch {
      unlockFees = 0;
    }
    let loanInterest = 0;
    try {
      const li = await sql<{ fees: number }>`
        select coalesce(sum(gross_tambala), 0)::bigint as fees
        from transactions
        where kind = ${"fee"} and status = ${"success"}
          and note = ${"Loan interest"}
      `;
      loanInterest = asInt(li[0]?.fees);
    } catch {
      loanInterest = 0;
    }
    // Withdrawable = deposit book profit + unlock fees + loan interest − treasury already paid out
    const available = Math.max(0, bookProfit + unlockFees + loanInterest - paidOut);
    return {
      userCount: asInt(users[0]?.n),
      totalDepositsTambala: asInt(money[0]?.deposits),
      totalWithdrawalsTambala: asInt(money[0]?.withdrawals),
      userBalancesTambala: asInt(wallet[0]?.bal),
      platformProfitTambala: bookProfit,
      earlyUnlockFeesTambala: unlockFees,
      loanInterestTambala: loanInterest,
      payoutReserveTambala: asInt(wallet[0]?.res),
      pendingCount: asInt(money[0]?.pending),
      demoPayments: demoPaymentsEnabled(),
      treasuryPaidOutTambala: paidOut,
      treasuryAvailableTambala: available,
      series: seriesRows.map((r) => ({
        day: String(r.day).slice(0, 10),
        deposits: asInt(r.deposits),
        withdrawals: asInt(r.withdrawals),
        profit: asInt(r.profit),
      })),
      productionReadiness: (() => {
        const base = getProductionReadiness();
        return {
          isProduction: base.isProduction,
          allCriticalOk: base.allCriticalOk,
          items: base.items,
          depositsAllowed: !depositsPaused(),
          withdrawalsAllowed: !withdrawalsPaused(),
        };
      })(),
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
      kind:
        r.kind === "withdrawal"
          ? "withdrawal"
          : r.kind === "fee"
            ? "fee"
            : r.kind === "transfer_out"
              ? "transfer_out"
              : r.kind === "transfer_in"
                ? "transfer_in"
                : "deposit",
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
    const matches = await verifyPassword({ hash: currentHash, password: data.password, });
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
  .handler(async () => {
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
    const matches = await verifyPassword({ hash: currentHash, password: data.currentPassword, });
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
    const matches = await verifyPassword({ hash: currentHash, password: data.password, });
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
export type PasswordResetAccountChoice = {
  userId: string;
  username: string;
  firstName: string;
  maskedEmail: string;
  maskedPhone: string;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1) || "*";
  return `${head}***@${domain}`;
}

function maskPhoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `***${d.slice(-4)}`;
}

async function sendPasswordResetEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  profile: { user_id: string; email: string; first_name: string },
) {
  const { issueSecurityToken } = await import("./security-tokens.server");
  const { sendMail } = await import("./mail.server");
  const { APP_NAME } = await import("./constants");
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
}

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      identifier: z.string().min(1).max(120),
      /** When multiple accounts match, client sends the chosen user id. */
      userId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { assertRateLimit } = await import("./rate-limit.server");
    const { normalizeMwPhone } = await import("./phone");
    const sql = await getSql();
    const raw = data.identifier.trim();
    await assertRateLimit(sql, {
      bucket: `pw-reset:${raw.toLowerCase().slice(0, 64)}`,
      limit: 8,
      windowSeconds: 60 * 60,
      message: "Too many reset attempts. Try again later.",
    });

    // Only email or Malawi phone — not username (usernames are easy to guess).
    const looksEmail = raw.includes("@") && raw.includes(".");
    const phone = normalizeMwPhone(raw);
    const generic = {
      ok: true as const,
      mode: "sent" as const,
      message: "If an account matches, we sent a reset link to the registered email.",
    };
    if (!looksEmail && !phone) {
      return generic;
    }

    const rows = await sql<{
      user_id: string;
      email: string;
      first_name: string;
      username: string;
      phone: string;
    }>`
      select user_id, email, first_name, username, phone from profiles
      where deleted_at is null
        and (
          (${looksEmail} and lower(email) = ${raw.toLowerCase()})
          or (${Boolean(phone)} and phone = ${phone ?? "__none__"})
        )
      order by created_at asc
      limit 20
    `;

    if (!rows.length) {
      return generic;
    }

    // Multiple matches → list accounts so the user picks which one to reset.
    if (rows.length > 1 && !data.userId) {
      const accounts: PasswordResetAccountChoice[] = rows.map((r) => ({
        userId: r.user_id,
        username: r.username,
        firstName: r.first_name,
        maskedEmail: maskEmail(r.email),
        maskedPhone: maskPhoneDigits(r.phone),
      }));
      return {
        ok: true as const,
        mode: "choose" as const,
        message: "More than one account matches. Choose which one to reset.",
        accounts,
      };
    }

    let profile = rows[0];
    if (data.userId) {
      const picked = rows.find((r) => r.user_id === data.userId);
      if (!picked) {
        return generic;
      }
      profile = picked;
    }

    try {
      await sendPasswordResetEmail(sql, profile);
    } catch (err) {
      console.error("[password-reset]", (err as Error).message);
    }
    return {
      ok: true as const,
      mode: "sent" as const,
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
      mode: z.enum(["instant", "idle", "off"]),
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


/** Admin: look up any transaction by reference (support desk). */
export const adminLookupReference = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4).max(80) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      user_id: string;
      kind: string;
      status: string;
      gross_tambala: number;
      credited_tambala: number;
      phone: string | null;
      reference: string;
      note: string | null;
      created_at: unknown;
      completed_at: unknown;
      username: string;
      email: string;
      first_name: string;
      last_name: string;
    }>`
      select t.id, t.user_id, t.kind, t.status, t.gross_tambala, t.credited_tambala, t.phone,
             t.reference, t.note, t.created_at, t.completed_at,
             p.username, p.email, p.first_name, p.last_name
      from transactions t
      join profiles p on p.user_id = t.user_id
      where t.reference = ${data.reference.trim()}
      limit 1
    `;
    if (!rows.length) return { found: false as const };
    const r = rows[0];
    let paychangu: { ok: boolean; status: string; amount: number } | null = null;
    if (r.kind === "deposit") {
      try {
        const { paychanguConfigured, verifyPayment } = await import("./paychangu.server");
        if (paychanguConfigured()) {
          const v = await verifyPayment(r.reference);
          paychangu = { ok: v.ok, status: v.status, amount: v.amount };
        }
      } catch (err) {
        paychangu = { ok: false, status: (err as Error).message, amount: 0 };
      }
    }
    return {
      found: true as const,
      tx: {
        id: asInt(r.id),
        userId: r.user_id,
        kind: r.kind,
        status: r.status,
        grossTambala: asInt(r.gross_tambala),
        creditedTambala: asInt(r.credited_tambala),
        phone: r.phone,
        reference: r.reference,
        note: r.note,
        createdAt: iso(r.created_at),
        completedAt: iso(r.completed_at),
        username: r.username,
        email: r.email,
        name: `${r.first_name} ${r.last_name}`,
      },
      paychangu,
    };
  });

/**
 * Admin: credit a pending deposit after confirming payment with PayChangu (or support evidence).
 * Safe/idempotent — creditDeposit claims pending only once.
 */
export const adminForceCreditDeposit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      reference: z.string().min(4),
      reason: z.string().min(8).max(500),
      skipPaychanguCheck: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql } = await import("@/lib/db");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const rows = await sql<{ id: number; kind: string; status: string; user_id: string; gross_tambala: number }>`
      select id, kind, status, user_id, gross_tambala from transactions
      where reference = ${data.reference.trim()} limit 1
    `;
    if (!rows.length) throw new Error("No transaction with that reference");
    const row = rows[0];
    if (row.kind !== "deposit") throw new Error("Reference is not a deposit");
    if (row.status === "success") {
      return { ok: true as const, already: true as const, message: "Already credited" };
    }
    if (row.status !== "pending") {
      throw new Error(`Cannot credit deposit in status "${row.status}"`);
    }
    if (!data.skipPaychanguCheck) {
      const { paychanguConfigured, verifyPayment } = await import("./paychangu.server");
      if (paychanguConfigured()) {
        const v = await verifyPayment(row.reference ? data.reference.trim() : data.reference);
        if (!v.ok) {
          throw new Error(
            `PayChangu does not show success for this reference (status: ${v.status}). ` +
              "Confirm in the PayChangu dashboard first, or set skip check only with written proof.",
          );
        }
      }
    }
    const { creditDeposit } = await import("./ledger.server");
    const result = await creditDeposit(data.reference.trim());
    await writeAudit(sql, {
      action: "admin_force_credit",
      userId: context.userId,
      detail: `ref=${data.reference.trim()} target=${row.user_id} reason=${data.reason.slice(0, 200)}`,
    });
    return { ok: true as const, already: result.already, ...result };
  });

/** Admin: attach a support note to a transaction (does not move money). */
export const adminAnnotateTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4), note: z.string().min(4).max(500) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const updated = await sql<{ id: number }>`
      update transactions
      set note = case
            when note is null or note = '' then ${data.note}
            else note || ${" | " + data.note}
          end
      where reference = ${data.reference.trim()}
      returning id
    `;
    if (!updated.length) throw new Error("Transaction not found");
    await writeAudit(sql, {
      action: "admin_annotate_tx",
      userId: context.userId,
      detail: `ref=${data.reference.trim()} note=${data.note.slice(0, 120)}`,
    });
    return { ok: true as const };
  });


/* ── Security survey (admin-triggered, mandatory on dashboard) ─────────── */

export type SecuritySurveyState =
  | { required: false }
  | {
      required: true;
      campaignId: string;
      email: string;
      phone: string;
      anchorEmail: string;
      anchorPhone: string;
      securityQuestion: string;
      hasBank: boolean;
      bankName: string | null;
      bankAccountMasked: string | null;
      bankAccountName: string | null;
      anchorBankName: string | null;
      anchorBankMasked: string | null;
    };

async function readSurveyFlags(sql: any): Promise<{ active: boolean; campaignId: string }> {
  const rows = await sql<{ key: string; value: string }>`
    select key, value from platform_settings
    where key in (${"security_survey_active"}, ${"security_survey_campaign_id"})
  `;
  const map = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    active: map.security_survey_active === "true",
    campaignId: String(map.security_survey_campaign_id || ""),
  };
}

export const getSecuritySurveyState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SecuritySurveyState> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const flags = await readSurveyFlags(sql);
    if (!flags.active || !flags.campaignId) return { required: false };

    const done = await sql<{ user_id: string }>`
      select user_id from security_survey_completions
      where user_id = ${context.userId} and campaign_id = ${flags.campaignId}
      limit 1
    `;
    if (done.length) return { required: false };

    const profile = await loadProfile(context.userId);
    if (!profile) return { required: false };

    const hasBank = Boolean(profile.bank_uuid && profile.bank_account_number);
    return {
      required: true,
      campaignId: flags.campaignId,
      email: profile.email,
      phone: profile.phone,
      anchorEmail: profile.anchor_email || profile.email,
      anchorPhone: profile.anchor_phone || profile.phone,
      securityQuestion: profile.security_question,
      hasBank,
      bankName: profile.bank_name || null,
      bankAccountMasked: profile.bank_account_number
        ? `****${String(profile.bank_account_number).slice(-4)}`
        : null,
      bankAccountName: profile.bank_account_name || null,
      anchorBankName: profile.anchor_bank_name || profile.bank_name || null,
      anchorBankMasked: (profile.anchor_bank_account_number || profile.bank_account_number)
        ? `****${String(profile.anchor_bank_account_number || profile.bank_account_number).slice(-4)}`
        : null,
    };
  });

export const adminSecuritySurveyStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const flags = await readSurveyFlags(sql);
    let completed = 0;
    let total = 0;
    let unchanged = 0;
    let emailReverted = 0;
    let phoneReverted = 0;
    let bothReverted = 0;
    let emailConfirmed = 0;
    let phoneConfirmed = 0;
    if (flags.campaignId) {
      const u = await sql<{ n: number }>`
        select count(*)::int as n from profiles where deleted_at is null and role = ${"user"}
      `;
      total = Number(u[0]?.n ?? 0);
      const stats = await sql<{
        completed: number;
        unchanged: number;
        email_reverted: number;
        phone_reverted: number;
        both_reverted: number;
        email_confirmed: number;
        phone_confirmed: number;
      }>`
        select
          count(*)::int as completed,
          count(*) filter (where email_confirmed and phone_confirmed and not reverted_email and not reverted_phone)::int as unchanged,
          count(*) filter (where reverted_email and not reverted_phone)::int as email_reverted,
          count(*) filter (where reverted_phone and not reverted_email)::int as phone_reverted,
          count(*) filter (where reverted_email and reverted_phone)::int as both_reverted,
          count(*) filter (where email_confirmed)::int as email_confirmed,
          count(*) filter (where phone_confirmed)::int as phone_confirmed
        from security_survey_completions
        where campaign_id = ${flags.campaignId}
      `;
      const s = stats[0];
      completed = Number(s?.completed ?? 0);
      unchanged = Number(s?.unchanged ?? 0);
      emailReverted = Number(s?.email_reverted ?? 0);
      phoneReverted = Number(s?.phone_reverted ?? 0);
      bothReverted = Number(s?.both_reverted ?? 0);
      emailConfirmed = Number(s?.email_confirmed ?? 0);
      phoneConfirmed = Number(s?.phone_confirmed ?? 0);
    }
    return {
      active: flags.active,
      campaignId: flags.campaignId || null,
      completed,
      totalUsers: total,
      pending: Math.max(0, total - completed),
      unchanged,
      emailReverted,
      phoneReverted,
      bothReverted,
      emailConfirmed,
      phoneConfirmed,
      completionRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    };
  });

export const adminStartSecuritySurvey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { randomBytes } = await import("node:crypto");
    const sql = await getSql();
    const campaignId = `surv_${randomBytes(8).toString("hex")}`;
    await sql`
      insert into platform_settings (key, value, updated_at) values
        (${"security_survey_active"}, ${"true"}, now()),
        (${"security_survey_campaign_id"}, ${campaignId}, now()),
        (${"security_survey_started_at"}, ${new Date().toISOString()}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "security_survey_start",
      detail: `campaign=${campaignId}`,
    });
    return { ok: true as const, campaignId, active: true };
  });

export const adminStopSecuritySurvey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into platform_settings (key, value, updated_at)
      values (${"security_survey_active"}, ${"false"}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "security_survey_stop",
      detail: "active=false",
    });
    return { ok: true as const, active: false };
  });

export const completeSecuritySurvey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      campaignId: z.string().min(4),
      emailIsMine: z.boolean(),
      phoneIsMine: z.boolean(),
      bankIsMine: z.boolean().optional(),
      securityAnswer: z.string().min(1).max(200),
      /** Required when emailIsMine is false */
      newPassword: z.string().min(8).max(128).optional(),
      /** Required when phoneIsMine is false */
      newPin: z.string().regex(/^\d{4}$/).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { verifySecret, hashSecret, normalizeAnswer } = await import("./crypto");
    const { hashPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    const flags = await readSurveyFlags(sql);
    if (!flags.active || flags.campaignId !== data.campaignId) {
      throw new Error("This security survey is no longer active");
    }
    const already = await sql<{ user_id: string }>`
      select user_id from security_survey_completions
      where user_id = ${context.userId} and campaign_id = ${data.campaignId}
      limit 1
    `;
    if (already.length) return { ok: true as const, already: true as const };

    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");

    const answerOk = await verifySecret(
      profile.security_answer_hash,
      normalizeAnswer(data.securityAnswer),
    );
    if (!answerOk) throw new Error("Security answer is incorrect");

    if (!data.emailIsMine && (!data.newPassword || data.newPassword.length < 8)) {
      throw new Error("Set a new password (at least 8 characters) when reclaiming your email");
    }
    if (!data.phoneIsMine && (!data.newPin || !/^\d{4}$/.test(data.newPin))) {
      throw new Error("Set a new 4-digit PIN when reclaiming your withdrawal number");
    }

    const anchorEmail = (profile as { anchor_email?: string }).anchor_email || profile.email;
    const anchorPhone = (profile as { anchor_phone?: string }).anchor_phone || profile.phone;

    await withTransaction(async (tx) => {
      let revertedEmail = false;
      let revertedPhone = false;

      if (!data.emailIsMine) {
        // Restore first registered email on profile + auth user
        await tx`
          update profiles
          set email = ${anchorEmail}, updated_at = now()
          where user_id = ${context.userId}
        `;
        await tx`
          update "user"
          set email = ${anchorEmail}, "emailVerified" = true, "updatedAt" = now()
          where id = ${context.userId}
        `;
        const passwordHash = await hashPassword(data.newPassword!);
        await tx`
          update "account"
          set password = ${passwordHash}, "updatedAt" = now()
          where "userId" = ${context.userId} and "providerId" = ${"credential"}
        `;
        // Sign out all sessions for this user
        await tx`delete from "session" where "userId" = ${context.userId}`;
        revertedEmail = true;
      }

      if (!data.phoneIsMine) {
        const pinHash = await hashSecret(data.newPin!);
        await tx`
          update profiles
          set phone = ${anchorPhone},
              phone_verified_at = now(),
              pin_hash = ${pinHash},
              pin_verified_at = null,
              failed_pin_attempts = 0,
              updated_at = now()
          where user_id = ${context.userId}
        `;
        revertedPhone = true;
      }

      let revertedBank = false;
      const bankIsMine = data.bankIsMine !== false;
      if (!bankIsMine && profile.bank_account_number) {
        await tx`
          update profiles set
            bank_uuid = coalesce(anchor_bank_uuid, bank_uuid),
            bank_name = coalesce(anchor_bank_name, bank_name),
            bank_account_number = coalesce(anchor_bank_account_number, bank_account_number),
            bank_account_name = coalesce(anchor_bank_account_name, bank_account_name),
            bank_verified_at = null,
            bank_hold_until = ${new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()},
            updated_at = now()
          where user_id = ${context.userId}
        `;
        revertedBank = true;
      }

      await tx`
        insert into security_survey_completions (
          user_id, campaign_id, email_confirmed, phone_confirmed, security_answer_ok,
          reverted_email, reverted_phone, bank_confirmed, reverted_bank, completed_at
        ) values (
          ${context.userId}, ${data.campaignId}, ${data.emailIsMine}, ${data.phoneIsMine}, ${true},
          ${revertedEmail}, ${revertedPhone}, ${bankIsMine}, ${revertedBank}, now()
        )
        on conflict (user_id) do update set
          campaign_id = excluded.campaign_id,
          email_confirmed = excluded.email_confirmed,
          phone_confirmed = excluded.phone_confirmed,
          security_answer_ok = excluded.security_answer_ok,
          reverted_email = excluded.reverted_email,
          reverted_phone = excluded.reverted_phone,
          bank_confirmed = excluded.bank_confirmed,
          reverted_bank = excluded.reverted_bank,
          completed_at = now()
      `;
    });

    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      userId: context.userId,
      actorUserId: context.userId,
      action: "security_survey_complete",
      detail: `campaign=${data.campaignId} emailOk=${data.emailIsMine} phoneOk=${data.phoneIsMine}`,
    });

    return {
      ok: true as const,
      already: false as const,
      mustReLogin: !data.emailIsMine,
      revertedEmail: !data.emailIsMine,
      revertedPhone: !data.phoneIsMine,
    };
  });



/* ── Help lines (dashboard FAB) ─────────────────────────────────────────── */

export type HelpLine = {
  id: number;
  channel: "whatsapp" | "call" | "sms" | "facebook" | "other";
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
};

export const listHelpLinesPublic = createServerFn({ method: "GET" })
  .handler(async (): Promise<HelpLine[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      channel: string;
      label: string;
      value: string;
      sort_order: number;
      active: boolean;
    }>`
      select id, channel, label, value, sort_order, active
      from help_lines
      where active = true
      order by sort_order asc, id asc
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      channel: r.channel as HelpLine["channel"],
      label: r.label,
      value: r.value,
      sortOrder: Number(r.sort_order),
      active: Boolean(r.active),
    }));
  });

export const adminListHelpLines = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<HelpLine[]> => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      channel: string;
      label: string;
      value: string;
      sort_order: number;
      active: boolean;
    }>`
      select id, channel, label, value, sort_order, active
      from help_lines
      order by sort_order asc, id asc
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      channel: r.channel as HelpLine["channel"],
      label: r.label,
      value: r.value,
      sortOrder: Number(r.sort_order),
      active: Boolean(r.active),
    }));
  });

export const adminUpsertHelpLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number().int().positive().optional(),
      channel: z.enum(["whatsapp", "call", "sms", "facebook", "other"]),
      label: z.string().min(1).max(80),
      value: z.string().min(1).max(300),
      sortOrder: z.number().int().min(0).max(999).default(0),
      active: z.boolean().default(true),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    if (data.id) {
      await sql`
        update help_lines
        set channel = ${data.channel},
            label = ${data.label},
            value = ${data.value},
            sort_order = ${data.sortOrder},
            active = ${data.active}
        where id = ${data.id}
      `;
      return { ok: true as const, id: data.id };
    }
    const rows = await sql<{ id: number }>`
      insert into help_lines (channel, label, value, sort_order, active)
      values (${data.channel}, ${data.label}, ${data.value}, ${data.sortOrder}, ${data.active})
      returning id
    `;
    return { ok: true as const, id: Number(rows[0].id) };
  });

export const adminDeleteHelpLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from help_lines where id = ${data.id}`;
    return { ok: true as const };
  });



export const listPaychanguBanks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { paychanguConfigured, listSupportedBanks } = await import("./paychangu.server");
    if (!paychanguConfigured()) return [] as Array<{ uuid: string; name: string }>;
    try {
      return await listSupportedBanks();
    } catch {
      return [];
    }
  });

/** Save or update bank payout details. Starts a 72h withdraw hold (like phone change). */
export const saveBankPayoutDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bankUuid: z.string().min(8).max(80),
      bankName: z.string().min(2).max(120),
      accountNumber: z.string().min(5).max(32),
      accountName: z.string().min(2).max(120),
      pin: pinSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret } = await import("./crypto");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const pinOk = await verifySecret(profile.pin_hash, data.pin);
    if (!pinOk) throw new Error("Incorrect PIN");

    const holdUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const isFirst =
      !profile.bank_account_number &&
      !profile.anchor_bank_account_number;

    await sql`
      update profiles set
        bank_uuid = ${data.bankUuid},
        bank_name = ${data.bankName},
        bank_account_number = ${data.accountNumber.replace(/\s/g, "")},
        bank_account_name = ${data.accountName.trim()},
        bank_verified_at = null,
        bank_hold_until = ${holdUntil.toISOString()},
        bank_updated_at = now(),
        anchor_bank_uuid = coalesce(anchor_bank_uuid, ${data.bankUuid}),
        anchor_bank_name = coalesce(anchor_bank_name, ${data.bankName}),
        anchor_bank_account_number = coalesce(anchor_bank_account_number, ${data.accountNumber.replace(/\s/g, "")}),
        anchor_bank_account_name = coalesce(anchor_bank_account_name, ${data.accountName.trim()}),
        updated_at = now()
      where user_id = ${context.userId}
    `;

    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      userId: context.userId,
      action: "bank_details_set",
      detail: `bank=${data.bankName} first=${isFirst}`,
    });

    return {
      ok: true as const,
      holdUntil: holdUntil.toISOString(),
      message:
        "Bank details saved. Bank withdrawals stay on hold for 72 hours. After that, and after a successful bank payout, the account is treated as verified.",
    };
  });



/* ── Admin ops: lock, delete, survey export, analytics ──────────────────── */

export const adminLockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string().min(1),
      reason: z.string().min(3).max(300),
      locked: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    if (data.userId === context.userId) throw new Error("You cannot lock your own admin account");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    if (data.locked) {
      await sql`
        update profiles
        set admin_locked_at = now(),
            admin_lock_reason = ${data.reason},
            updated_at = now()
        where user_id = ${data.userId} and role = ${"user"}
      `;
      // Kill sessions so stolen credentials stop working immediately
      await sql`delete from "session" where "userId" = ${data.userId}`;
    } else {
      await sql`
        update profiles
        set admin_locked_at = null,
            admin_lock_reason = null,
            updated_at = now()
        where user_id = ${data.userId}
      `;
    }
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      userId: data.userId,
      action: data.locked ? "admin_lock_user" : "admin_unlock_user",
      detail: data.reason,
    });
    return { ok: true as const, locked: data.locked };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string().min(1),
      reason: z.string().min(3).max(300),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own admin account");
    const { getSql, withTransaction } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ role: string }>`
      select role from profiles where user_id = ${data.userId} limit 1
    `;
    if (!rows.length) throw new Error("User not found");
    if (rows[0].role === "admin") throw new Error("Cannot delete an admin account this way");

    await withTransaction(async (tx) => {
      await tx`
        update profiles
        set deleted_at = now(),
            admin_locked_at = now(),
            admin_lock_reason = ${data.reason},
            email = ${`deleted-${data.userId.slice(0, 8)}@deleted.local`},
            phone = ${`deleted-${data.userId.slice(0, 10)}`},
            username = ${`deleted_${data.userId.slice(0, 8)}`},
            pin_hash = ${"deleted"},
            security_answer_hash = ${"deleted"},
            updated_at = now()
        where user_id = ${data.userId}
      `;
      await tx`delete from "session" where "userId" = ${data.userId}`;
      await tx`
        update "user"
        set email = ${`${data.userId.slice(0, 12)}@deleted.local`},
            name = ${"Deleted User"},
            "updatedAt" = now()
        where id = ${data.userId}
      `;
    });
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      userId: data.userId,
      action: "admin_delete_user",
      detail: data.reason,
    });
    return { ok: true as const };
  });

export const adminExportSurveyCsv = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ campaignId: z.string().min(4).optional() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const flags = await readSurveyFlags(sql);
    const campaignId = data.campaignId || flags.campaignId;
    if (!campaignId) throw new Error("No survey campaign to export");

    const rows = await sql<{
      user_id: string;
      username: string;
      email: string;
      phone: string;
      email_confirmed: boolean;
      phone_confirmed: boolean;
      bank_confirmed: boolean | null;
      reverted_email: boolean;
      reverted_phone: boolean;
      reverted_bank: boolean;
      completed_at: unknown;
    }>`
      select c.user_id, p.username, p.email, p.phone,
             c.email_confirmed, c.phone_confirmed, c.bank_confirmed,
             c.reverted_email, c.reverted_phone, c.reverted_bank, c.completed_at
      from security_survey_completions c
      join profiles p on p.user_id = c.user_id
      where c.campaign_id = ${campaignId}
      order by c.completed_at asc
    `;

    const header = [
      "user_id",
      "username",
      "email",
      "phone",
      "email_confirmed",
      "phone_confirmed",
      "bank_confirmed",
      "reverted_email",
      "reverted_phone",
      "reverted_bank",
      "completed_at",
      "campaign_id",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.user_id,
        r.username,
        r.email,
        r.phone,
        String(r.email_confirmed),
        String(r.phone_confirmed),
        String(r.bank_confirmed ?? ""),
        String(r.reverted_email),
        String(r.reverted_phone),
        String(r.reverted_bank),
        String(r.completed_at ?? ""),
        campaignId,
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    return {
      ok: true as const,
      campaignId,
      filename: `nexa-survey-${campaignId}.csv`,
      csv: lines.join("\n"),
      rowCount: rows.length,
    };
  });

export const recordPageVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ path: z.string().min(1).max(120) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const path = data.path.slice(0, 120);
    await sql`
      insert into page_visits (user_id, path, visited_on, hits, last_seen_at)
      values (${context.userId}, ${path}, (timezone('Africa/Blantyre', now()))::date, 1, now())
      on conflict (user_id, path, visited_on)
      do update set hits = page_visits.hits + 1, last_seen_at = now()
    `;
    return { ok: true as const };
  });

export const adminAnalytics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();

    const daily = await sql<{ day: string; visits: number; users: number }>`
      select visited_on::text as day,
             sum(hits)::int as visits,
             count(distinct user_id)::int as users
      from page_visits
      where visited_on >= (timezone('Africa/Blantyre', now()))::date - 30
      group by visited_on
      order by visited_on asc
    `;

    const monthly = await sql<{ month: string; visits: number; users: number }>`
      select to_char(visited_on, 'YYYY-MM') as month,
             sum(hits)::int as visits,
             count(distinct user_id)::int as users
      from page_visits
      where visited_on >= (timezone('Africa/Blantyre', now()))::date - 365
      group by 1
      order by 1 asc
    `;

    const topPaths = await sql<{ path: string; hits: number }>`
      select path, sum(hits)::int as hits
      from page_visits
      where visited_on >= (timezone('Africa/Blantyre', now()))::date - 30
      group by path
      order by hits desc
      limit 12
    `;

    const topTx = await sql<{ kind: string; status: string; n: number }>`
      select kind, status, count(*)::int as n
      from transactions
      where created_at >= now() - interval '30 days'
      group by kind, status
      order by n desc
      limit 12
    `;

    const today = await sql<{ visits: number; users: number }>`
      select coalesce(sum(hits),0)::int as visits,
             count(distinct user_id)::int as users
      from page_visits
      where visited_on = (timezone('Africa/Blantyre', now()))::date
    `;

    return {
      todayVisits: Number(today[0]?.visits ?? 0),
      todayUsers: Number(today[0]?.users ?? 0),
      daily: daily.map((d) => ({
        day: d.day,
        visits: Number(d.visits),
        users: Number(d.users),
      })),
      monthly: monthly.map((d) => ({
        month: d.month,
        visits: Number(d.visits),
        users: Number(d.users),
      })),
      topPaths: topPaths.map((p) => ({ path: p.path, hits: Number(p.hits) })),
      topActivity: topTx.map((r) => ({
        label: `${r.kind}/${r.status}`,
        count: Number(r.n),
      })),
    };
  });


export const adminGetPayoutMethods = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getPayoutMethods } = await import("./payout-methods.server");
    const sql = await getSql();
    return getPayoutMethods(sql);
  });

export const adminSetPayoutMethods = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      momo: z.boolean(),
      bank: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql } = await import("@/lib/db");
    const { setPayoutMethods } = await import("./payout-methods.server");
    const sql = await getSql();
    await setPayoutMethods(sql, data);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "payout_methods_set",
      detail: `momo=${data.momo} bank=${data.bank}`,
    });
    return { ok: true as const, ...data };
  });

/** Public for withdraw UI (authenticated). */
export const getPayoutMethodsPublic = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { getSql } = await import("@/lib/db");
    const { getPayoutMethods } = await import("./payout-methods.server");
    const sql = await getSql();
    return getPayoutMethods(sql);
  });


/** Admin: update email (real inbox) and/or phone. Email is marked verified. */
export const adminUpdateContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      email: z.string().email().max(120).optional(),
      phone: z.string().min(9).max(20).optional(),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (!data.email && !data.phone) throw new Error("Provide a new email and/or phone");
    const { getSql, withTransaction } = await import("@/lib/db");
    const { auth } = await import("@/lib/auth/server");
    const sql = await getSql();

    // Verify password via better-auth credential path isn't trivial; use account password hash check
    const { verifyPassword } = await import("better-auth/crypto");
    const acc = await sql<{ password: string | null }>`
      select password from "account"
      where "userId" = ${context.userId} and "providerId" = ${"credential"}
      limit 1
    `;
    if (!acc[0]?.password) throw new Error("No password credential on this account");
    const ok = await verifyPassword({ hash: acc[0].password, password: data.password });
    if (!ok) throw new Error("Incorrect password");

    let email = data.email?.trim().toLowerCase();
    let phone: string | undefined;
    if (data.phone) {
      const { normalizeMwPhone } = await import("./phone");
      const n = normalizeMwPhone(data.phone);
      if (!n) throw new Error("Enter a valid Malawi mobile number");
      phone = n;
    }

    if (email) {
      const taken = await sql`select id from "user" where email = ${email} and id <> ${context.userId} limit 1`;
      if (taken.length) throw new Error("That email is already in use");
    }
    if (phone) {
      const taken = await sql`
        select user_id from profiles
        where phone = ${phone} and user_id <> ${context.userId} and deleted_at is null
        limit 1
      `;
      if (taken.length) throw new Error("That phone is already in use");
    }

    await withTransaction(async (tx) => {
      if (email) {
        await tx`
          update "user"
          set email = ${email}, "emailVerified" = ${true}, "updatedAt" = now()
          where id = ${context.userId}
        `;
        await tx`
          update profiles set email = ${email}, updated_at = now()
          where user_id = ${context.userId}
        `;
      }
      if (phone) {
        await tx`
          update profiles
          set phone = ${phone}, phone_verified_at = now(), updated_at = now()
          where user_id = ${context.userId}
        `;
      }
    });

    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      userId: context.userId,
      action: "admin_contact_update",
      detail: [email ? `email=${email}` : null, phone ? `phone=${phone}` : null].filter(Boolean).join(" "),
    });
    return { ok: true as const, email: email ?? null, phone: phone ?? null };
  });

/** Any signed-in user: change security question with password + PIN. */
export const changeSecurityQuestionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      password: z.string().min(1),
      pin: pinSchema,
      question: z.string().min(8).max(200),
      answer: z.string().min(2).max(120),
    }),
  )
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const { getSql } = await import("@/lib/db");
    const { verifySecret, hashSecret, normalizeAnswer } = await import("./crypto");
    const { verifyPassword } = await import("better-auth/crypto");
    const sql = await getSql();

    const acc = await sql<{ password: string | null }>`
      select password from "account"
      where "userId" = ${context.userId} and "providerId" = ${"credential"}
      limit 1
    `;
    if (!acc[0]?.password) throw new Error("No password on this account");
    const pwOk = await verifyPassword({ hash: acc[0].password, password: data.password });
    if (!pwOk) throw new Error("Incorrect password");
    const pinOk = await verifySecret(profile.pin_hash, data.pin);
    if (!pinOk) throw new Error("Incorrect PIN");

    const answerHash = await hashSecret(normalizeAnswer(data.answer));
    await sql`
      update profiles
      set security_question = ${data.question.trim()},
          security_answer_hash = ${answerHash},
          updated_at = now()
      where user_id = ${context.userId}
    `;
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      userId: context.userId,
      action: "security_question_changed",
      detail: "updated",
    });
    return { ok: true as const };
  });

/**
 * Admin treasury withdraw: cash out book profit only (never saver balances).
 * Gross amount is reserved against profit; ~1.8% rail fee means net sent to admin phone.
 */
export const adminTreasuryWithdraw = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      amountKwacha: z.number().positive(),
      pin: pinSchema,
      idempotencyKey: z.string().min(8).max(128),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql, withTransaction } = await import("@/lib/db");
    const { verifySecret, newReference } = await import("./crypto");
    const { kwachaToTambala, tambalaToKwacha, formatKwacha } = await import("./money");
    const { paychanguConfigured, demoPaymentsEnabled, initiateMomoPayout } = await import("./paychangu.server");
    const { claimIdempotencyKey, storeIdempotencyResponse } = await import("./idempotency.server");
    const { MIN_WITHDRAW_KWACHA } = await import("./constants");

    if (!paychanguConfigured() && !demoPaymentsEnabled()) {
      throw new Error("Payouts are not configured");
    }
    if (data.amountKwacha < MIN_WITHDRAW_KWACHA) {
      throw new Error(`Minimum treasury withdraw is ${MIN_WITHDRAW_KWACHA} kwacha`);
    }

    const sql = await getSql();
    const claim = await claimIdempotencyKey(sql, {
      key: data.idempotencyKey,
      userId: context.userId,
      action: "treasury_withdraw",
    });
    if (claim.hit) return claim.response as { ok: true; reference: string; grossTambala: number; netTambala: number };

    const releaseKey = async () => {
      await sql`delete from idempotency_keys where key = ${data.idempotencyKey} and response_json is null`;
    };

    const profile = await loadProfile(context.userId);
    if (!profile) {
      await releaseKey();
      throw new Error("Admin profile missing");
    }
    const pinOk = await verifySecret(profile.pin_hash, data.pin);
    if (!pinOk) {
      await releaseKey();
      throw new Error("Incorrect PIN");
    }

    const gross = kwachaToTambala(data.amountKwacha);
    // 1.8% rail fee estimated on gross; net sent to phone
    const fee = Math.round(gross * 0.018);
    const net = gross - fee;
    if (net <= 0) {
      await releaseKey();
      throw new Error("Amount too small after 1.8% payout fee");
    }

    const profitRows = await sql<{ profit: number }>`
      select coalesce(sum(case when kind = 'deposit' and status = 'success' then platform_profit_tambala else 0 end), 0)::bigint as profit
      from transactions
    `;
    const paidRows = await sql<{ paid: number }>`
      select coalesce(sum(gross_tambala), 0)::bigint as paid
      from treasury_payouts
      where status in (${"success"}, ${"processing"})
    `;
    const available = asInt(profitRows[0]?.profit) - asInt(paidRows[0]?.paid);
    if (gross > available) {
      await releaseKey();
      throw new Error(
        `Only ${formatKwacha(Math.max(0, available))} of platform profit is available to withdraw. Saver balances are never used.`,
      );
    }

    const reference = newReference("TRY");
    let payoutId: number;
    try {
      const inserted = await sql<{ id: number }>`
        insert into treasury_payouts (
          admin_user_id, gross_tambala, fee_tambala, net_tambala, phone, reference, status, note
        ) values (
          ${context.userId}, ${gross}, ${fee}, ${net}, ${profile.phone}, ${reference},
          ${"processing"},
          ${`Treasury withdraw ${formatKwacha(gross)}; ~1.8% rail fee ${formatKwacha(fee)}; net ${formatKwacha(net)}`}
        )
        returning id
      `;
      payoutId = inserted[0]!.id;
    } catch (err) {
      await releaseKey();
      throw err;
    }

    try {
      if (paychanguConfigured()) {
        const payout = await initiateMomoPayout({
          phone: profile.phone,
          amountKwacha: tambalaToKwacha(net),
          chargeId: reference,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
        });
        const status = String(payout.status ?? "").toLowerCase();
        if (status === "failed" || status === "failure" || status === "rejected") {
          throw new Error(`Payout rejected (${status})`);
        }
      }
      await sql`
        update treasury_payouts
        set status = ${"success"}, completed_at = now()
        where id = ${payoutId}
      `;
      // Keep platform_treasury in sync when the table exists (migration 0020).
      try {
        await sql`
          update platform_treasury
          set balance_tambala = greatest(0, balance_tambala - ${gross}),
              lifetime_out_tambala = lifetime_out_tambala + ${gross},
              updated_at = now()
          where id = 1
        `;
      } catch {
        /* table may not exist yet on first deploy */
      }
    } catch (err) {
      await sql`
        update treasury_payouts
        set status = ${"failed"}, note = ${String((err as Error).message ?? "failed")}
        where id = ${payoutId}
      `;
      await releaseKey();
      throw new Error(
        "Treasury withdrawal could not be sent. Profit was not taken. Details: " +
          String((err as Error).message ?? "").slice(0, 180),
      );
    }

    const result = {
      ok: true as const,
      reference,
      grossTambala: gross,
      netTambala: net,
      feeTambala: fee,
    };
    await storeIdempotencyResponse(sql, data.idempotencyKey, result);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "treasury_withdraw",
      detail: `ref=${reference} gross=${gross} net=${net}`,
    });
    return result;
  });


export const getWithdrawLockStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { loadLockStatus } = await import("./withdraw-lock.server");
    const sql = await getSql();
    const bal = await sql<{ balance_tambala: number }>`
      select balance_tambala from wallets where user_id = ${context.userId} limit 1
    `;
    const { getFeePolicy } = await import("./fee-policy.server");
    const policy = await getFeePolicy(sql);
    return loadLockStatus(sql, context.userId, Number(bal[0]?.balance_tambala ?? 0), {
      baseRate: policy.earlyUnlockBaseRate,
      capRate: policy.earlyUnlockCapRate,
    });
  });

export const setWithdrawTimeLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      amount: z.number().int().min(1).max(366 * 5),
      unit: z.enum(["days", "months", "years"]),
      confirmLong: z.boolean().optional(),
      pin: pinSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (profile.role === "admin") throw new Error("Admin accounts cannot use commitment locks.");
    const { verifySecret } = await import("./crypto");
    if (!(await verifySecret(profile.pin_hash, data.pin))) throw new Error("Incorrect PIN");

    const { parseLockDuration, coolingEndsFrom, logLockEvent } = await import("./withdraw-lock.server");
    const { WITHDRAW_LOCK_LONG_YEARS } = await import("./constants");
    const { until, ms } = parseLockDuration({ amount: data.amount, unit: data.unit });
    const yearsApprox = ms / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsApprox >= WITHDRAW_LOCK_LONG_YEARS && !data.confirmLong) {
      throw new Error(
        `Locks of ${WITHDRAW_LOCK_LONG_YEARS}+ years need an extra confirmation. Tick the long-period box and try again.`,
      );
    }

    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const existing = await sql<{ withdraw_lock_until: Date | string | null }>`
      select withdraw_lock_until from profiles where user_id = ${context.userId} limit 1
    `;
    if (existing[0]?.withdraw_lock_until && new Date(existing[0].withdraw_lock_until).getTime() > Date.now()) {
      throw new Error("You already have an active withdrawal lock. Cancel or edit it from the lock panel.");
    }

    const started = new Date();
    const cooling = coolingEndsFrom(started);
    await sql`
      update profiles
      set withdraw_lock_until = ${until},
          withdraw_lock_started_at = ${started},
          withdraw_lock_cooling_ends_at = ${cooling},
          withdraw_lock_original_until = ${until},
          updated_at = now()
      where user_id = ${context.userId}
    `;
    await logLockEvent(sql, {
      userId: context.userId,
      eventType: "set",
      lockUntil: until,
      detail: `${data.amount} ${data.unit}; unlock ${until.toISOString()}`,
    });
    return {
      ok: true as const,
      until: until.toISOString(),
      coolingEndsAt: cooling.toISOString(),
    };
  });

export const cancelWithdrawTimeLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pin: pinSchema, acceptFee: z.boolean().optional() }))
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const { verifySecret } = await import("./crypto");
    if (!(await verifySecret(profile.pin_hash, data.pin))) throw new Error("Incorrect PIN");

    const { getSql, withTransaction } = await import("@/lib/db");
    const { loadLockStatus, logLockEvent } = await import("./withdraw-lock.server");
    const sql = await getSql();
    const bal = await sql<{ balance_tambala: number }>`
      select balance_tambala from wallets where user_id = ${context.userId} limit 1
    `;
    const { getFeePolicy } = await import("./fee-policy.server");
    const policy = await getFeePolicy(sql);
    const status = await loadLockStatus(sql, context.userId, Number(bal[0]?.balance_tambala ?? 0), {
      baseRate: policy.earlyUnlockBaseRate,
      capRate: policy.earlyUnlockCapRate,
    });
    if (!status.active) throw new Error("No active withdrawal lock.");

    if (status.inCoolingOff) {
      await sql`
        update profiles
        set withdraw_lock_until = null,
            withdraw_lock_started_at = null,
            withdraw_lock_cooling_ends_at = null,
            withdraw_lock_original_until = null,
            updated_at = now()
        where user_id = ${context.userId}
      `;
      await logLockEvent(sql, {
        userId: context.userId,
        eventType: "cancel_cooling",
        detail: "free cancel during cooling-off",
      });
      return { ok: true as const, feeTambala: 0, free: true as const };
    }

    const fee = status.earlyUnlockFeeTambala;
    if (fee > 0 && !data.acceptFee) {
      throw new Error(
        `Early unlock fee is ${fee / 100} kwacha (${(status.earlyUnlockFeeRate * 100).toFixed(1)}% of balance). Accept the fee to continue.`,
      );
    }
    if (fee > Number(bal[0]?.balance_tambala ?? 0)) {
      throw new Error("Balance is too low to cover the early-unlock fee.");
    }

    await withTransaction(async (tx) => {
      if (fee > 0) {
        await tx`
          update wallets
          set balance_tambala = balance_tambala - ${fee},
              updated_at = now()
          where user_id = ${context.userId} and balance_tambala >= ${fee}
        `;
        const ref = `ULK_${context.userId.slice(0, 8)}_${Date.now().toString(36)}`;
        await tx`
          insert into transactions (
            user_id, kind, status, gross_tambala, credited_tambala,
            platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
          ) values (
            ${context.userId}, ${"fee"}, ${"success"}, ${fee}, ${0},
            ${fee}, ${0}, ${ref},
            ${"Early withdrawal unlock fee"}, now()
          )
        `;
        // Book fee as platform profit / treasury
        try {
          await tx`
            insert into platform_treasury (id, balance_tambala, lifetime_in_tambala, updated_at)
            values (1, ${fee}, ${fee}, now())
            on conflict (id) do update set
              balance_tambala = platform_treasury.balance_tambala + ${fee},
              lifetime_in_tambala = platform_treasury.lifetime_in_tambala + ${fee},
              updated_at = now()
          `;
        } catch { /* optional */ }
      }
      await tx`
        update profiles
        set withdraw_lock_until = null,
            withdraw_lock_started_at = null,
            withdraw_lock_cooling_ends_at = null,
            withdraw_lock_original_until = null,
            updated_at = now()
        where user_id = ${context.userId}
      `;
    });
    await logLockEvent(sql, {
      userId: context.userId,
      eventType: "early_unlock",
      feeTambala: fee,
      detail: `fee=${fee}`,
    });
    return { ok: true as const, feeTambala: fee, free: false as const };
  });

export const extendWithdrawTimeLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      amount: z.number().int().min(1).max(366 * 5),
      unit: z.enum(["days", "months", "years"]),
      pin: pinSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const { verifySecret } = await import("./crypto");
    if (!(await verifySecret(profile.pin_hash, data.pin))) throw new Error("Incorrect PIN");

    const { getSql } = await import("@/lib/db");
    const { parseLockDuration, logLockEvent } = await import("./withdraw-lock.server");
    const sql = await getSql();
    const rows = await sql<{ withdraw_lock_until: Date | string | null }>`
      select withdraw_lock_until from profiles where user_id = ${context.userId} limit 1
    `;
    const current = rows[0]?.withdraw_lock_until
      ? new Date(rows[0].withdraw_lock_until)
      : null;
    if (!current || current.getTime() <= Date.now()) {
      throw new Error("No active lock to extend. Set a new lock instead.");
    }
    const extra = parseLockDuration({ amount: data.amount, unit: data.unit });
    const newUntil = new Date(current.getTime() + extra.ms);
    const maxMs = 5 * 366 * 24 * 60 * 60 * 1000;
    const startedRow = await sql<{ withdraw_lock_started_at: Date | string | null }>`
      select withdraw_lock_started_at from profiles where user_id = ${context.userId} limit 1
    `;
    const started = startedRow[0]?.withdraw_lock_started_at
      ? new Date(startedRow[0].withdraw_lock_started_at)
      : new Date();
    if (newUntil.getTime() - started.getTime() > maxMs) {
      throw new Error("Extended lock would exceed the 5-year maximum.");
    }
    await sql`
      update profiles
      set withdraw_lock_until = ${newUntil},
          withdraw_lock_original_until = greatest(coalesce(withdraw_lock_original_until, ${newUntil}), ${newUntil}),
          updated_at = now()
      where user_id = ${context.userId}
    `;
    await logLockEvent(sql, {
      userId: context.userId,
      eventType: "extend",
      lockUntil: newUntil,
      detail: `+${data.amount} ${data.unit}`,
    });
    return { ok: true as const, until: newUntil.toISOString() };
  });

export const adminSetWithdrawLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string().min(1),
      locked: z.boolean(),
      reason: z.string().min(3).max(300),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { logLockEvent } = await import("./withdraw-lock.server");
    const sql = await getSql();
    if (data.locked) {
      await sql`
        update profiles
        set admin_withdraw_locked_at = now(),
            admin_withdraw_lock_reason = ${data.reason},
            updated_at = now()
        where user_id = ${data.userId}
      `;
    } else {
      await sql`
        update profiles
        set admin_withdraw_locked_at = null,
            admin_withdraw_lock_reason = null,
            updated_at = now()
        where user_id = ${data.userId}
      `;
    }
    await logLockEvent(sql, {
      userId: data.userId,
      eventType: data.locked ? "admin_withdraw_lock" : "admin_withdraw_unlock",
      detail: data.reason,
      actorUserId: context.userId,
    });
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      userId: data.userId,
      action: data.locked ? "admin_withdraw_lock" : "admin_withdraw_unlock",
      detail: data.reason,
    });
    return { ok: true as const, locked: data.locked };
  });


export const getPublicFeePolicy = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getFeePolicy } = await import("./fee-policy.server");
  const sql = await getSql();
  const p = await getFeePolicy(sql);
  return {
    depositFeePercent: Math.round(p.depositFeeRate * 1000) / 10,
    depositFeeRate: p.depositFeeRate,
    earlyUnlockBasePercent: Math.round(p.earlyUnlockBaseRate * 1000) / 10,
    earlyUnlockCapPercent: Math.round(p.earlyUnlockCapRate * 1000) / 10,
    earlyUnlockBaseRate: p.earlyUnlockBaseRate,
    earlyUnlockCapRate: p.earlyUnlockCapRate,
  };
});

export const adminGetFeePolicy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getFeePolicy } = await import("./fee-policy.server");
    const sql = await getSql();
    return getFeePolicy(sql);
  });

export const adminSetFeePolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      depositFeePercent: z.number().min(0).max(20),
      earlyUnlockBasePercent: z.number().min(0).max(10),
      earlyUnlockCapPercent: z.number().min(0).max(10),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql } = await import("@/lib/db");
    const { setFeePolicy } = await import("./fee-policy.server");
    const sql = await getSql();
    const policy = await setFeePolicy(sql, {
      depositFeeRate: data.depositFeePercent / 100,
      earlyUnlockBaseRate: data.earlyUnlockBasePercent / 100,
      earlyUnlockCapRate: data.earlyUnlockCapPercent / 100,
    });
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "fee_policy_set",
      detail: `deposit=${data.depositFeePercent}% unlockBase=${data.earlyUnlockBasePercent}% unlockCap=${data.earlyUnlockCapPercent}%`,
    });
    return policy;
  });


export const listPublicLanguages = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getSql } = await import("@/lib/db");
    const { listLanguages } = await import("@/lib/i18n/i18n.server");
    const sql = await getSql();
    return listLanguages(sql);
  } catch {
    return [
      { code: "en", name: "English", enabled: true, isDefault: true },
      { code: "ny", name: "Chichewa", enabled: false, isDefault: false },
    ];
  }
});

export const getPublishedTranslations = createServerFn({ method: "POST" })
  .validator(z.object({ lang: z.string().min(2).max(12) }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { getPublishedMap } = await import("@/lib/i18n/i18n.server");
    const sql = await getSql();
    return getPublishedMap(sql, data.lang);
  });

export const adminListLanguages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { listLanguages } = await import("@/lib/i18n/i18n.server");
    const sql = await getSql();
    return listLanguages(sql);
  });

export const adminAddLanguage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().min(2).max(12), name: z.string().min(2).max(80) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { addLanguage, listLanguages } = await import("@/lib/i18n/i18n.server");
    const sql = await getSql();
    await addLanguage(sql, data.code, data.name);
    return listLanguages(sql);
  });

export const adminSetLanguageEnabled = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().min(2).max(12), enabled: z.boolean() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { setLanguageEnabled, listLanguages } = await import("@/lib/i18n/i18n.server");
    const sql = await getSql();
    await setLanguageEnabled(sql, data.code, data.enabled);
    return listLanguages(sql);
  });

export const adminGetTranslationDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ lang: z.string().min(2).max(12) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getDraftMap } = await import("@/lib/i18n/i18n.server");
    const { ALL_MESSAGE_KEYS, EN_CATALOG } = await import("@/lib/i18n/catalog-en");
    const sql = await getSql();
    const draft = await getDraftMap(sql, data.lang);
    return {
      keys: ALL_MESSAGE_KEYS as string[],
      english: EN_CATALOG as Record<string, string>,
      draft,
    };
  });

export const adminSaveTranslationDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      lang: z.string().min(2).max(12),
      entries: z.record(z.string(), z.string()),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { saveDraft } = await import("@/lib/i18n/i18n.server");
    const sql = await getSql();
    const n = await saveDraft(sql, data.lang, data.entries);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "i18n_draft_save",
      detail: `lang=${data.lang} keys=${n}`,
    });
    return { ok: true as const, saved: n };
  });

export const adminPublishTranslations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      lang: z.string().min(2).max(12),
      entries: z.record(z.string(), z.string()).optional(),
      enable: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql } = await import("@/lib/db");
    const { saveDraft, publishLanguage, setLanguageEnabled } = await import("@/lib/i18n/i18n.server");
    const sql = await getSql();
    if (data.entries) await saveDraft(sql, data.lang, data.entries);
    const n = await publishLanguage(sql, data.lang);
    // Always enable on deploy so users can select the language immediately.
    await setLanguageEnabled(sql, data.lang, data.enable !== false);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "i18n_publish",
      detail: `lang=${data.lang} keys=${n} enable=${Boolean(data.enable)}`,
    });
    return { ok: true as const, published: n };
  });


/** Public send-fee tiers (kwacha) for UI. */
export const getSendFeeTiersPublic = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSendFeeTiers } = await import("./send-fee.server");
  const sql = await getSql();
  return getSendFeeTiers(sql);
});

export const adminGetSendFeeTiers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getSendFeeTiers } = await import("./send-fee.server");
    const sql = await getSql();
    return getSendFeeTiers(sql);
  });

export const adminSetSendFeeTiers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      tiers: z
        .array(
          z.object({
            minKwacha: z.number().min(0),
            maxKwacha: z.number().nullable(),
            feeKwacha: z.number().min(0),
          }),
        )
        .min(1)
        .max(20),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { setSendFeeTiers } = await import("./send-fee.server");
    const sql = await getSql();
    const tiers = await setSendFeeTiers(sql, data.tiers);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "send_fee_tiers_set",
      detail: JSON.stringify(tiers),
    });
    return tiers;
  });

/** Look up a registered user by Malawi mobile number for P2P send. */
export const lookupSendRecipient = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ phone: z.string().min(8).max(20) }))
  .handler(async ({ context, data }) => {
    const { normalizeMwPhone } = await import("./phone");
    const phone = normalizeMwPhone(data.phone);
    if (!phone) throw new Error("Enter a valid Malawi mobile number.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      first_name: string;
      last_name: string;
      phone: string;
      deleted_at: unknown;
    }>`
      select user_id, first_name, last_name, phone, deleted_at
      from profiles
      where phone = ${phone}
      limit 1
    `;
    if (!rows.length || rows[0].deleted_at) {
      throw new Error("That number does not match any NEXA-SAVER account.");
    }
    if (rows[0].user_id === context.userId) {
      throw new Error("You cannot send money to your own account.");
    }
    return {
      userId: rows[0].user_id,
      fullName: `${rows[0].first_name} ${rows[0].last_name}`.trim(),
      phone: rows[0].phone,
    };
  });

export const startTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      amountKwacha: z.number().positive(),
      toPhone: z.string().min(8).max(20),
      pin: pinSchema,
      idempotencyKey: z.string().min(8).max(128),
      /** When true, sender also pays 700 MWK so receiver credit includes bank flat buffer. */
      coverBankFlat: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (profile.role === "admin") throw new Error("Admin accounts cannot send user transfers this way.");
    if (profile.admin_locked_at) throw new Error("This account is locked. Sending is disabled.");
    if (profile.admin_withdraw_locked_at) {
      throw new Error("Withdrawals and sending are locked by the platform. Contact support.");
    }
    if (profile.withdraw_lock_until && new Date(profile.withdraw_lock_until as string | Date).getTime() > Date.now()) {
      throw new Error("Your withdrawals are time-locked, so sending is also paused until the lock ends.");
    }

    const { assertWithdrawalsAllowed } = await import("./kill-switch.server");
    assertWithdrawalsAllowed(); // send is tied to withdrawals
    const { assertMoneyInfraReady } = await import("./production-guards.server");
    assertMoneyInfraReady("Sending");

    const { verifySecret } = await import("./crypto");
    if (!(await verifySecret(profile.pin_hash, data.pin))) throw new Error("Incorrect PIN");

    const { normalizeMwPhone } = await import("./phone");
    const toPhone = normalizeMwPhone(data.toPhone);
    if (!toPhone) throw new Error("Enter a valid Malawi mobile number.");

    const amountKwacha = Math.floor(data.amountKwacha);
    if (amountKwacha < 100) throw new Error("Minimum send is 100 kwacha.");

    const { getSql, withTransaction } = await import("@/lib/db");
    const { getSendFeeTiers, feeForSendAmount } = await import("./send-fee.server");
    const { newReference } = await import("./crypto");
    const { claimIdempotencyKey, storeIdempotencyResponse } = await import("./idempotency.server");
    const { kwachaToTambala, formatKwacha } = await import("./money");
    const sql = await getSql();

    const claim = await claimIdempotencyKey(sql, {
      key: data.idempotencyKey,
      userId: context.userId,
      action: "transfer",
    });
    if (claim.hit) return claim.response as { ok: true; reference: string; amountTambala: number; feeTambala: number };

    const tiers = await getSendFeeTiers(sql);
    const feeKwacha = feeForSendAmount(amountKwacha, tiers);
    const amountTambala = kwachaToTambala(amountKwacha);
    const feeTambala = kwachaToTambala(feeKwacha);
    const { BANK_FLAT_FEE_KWACHA } = await import("./constants");
    const coverBankFlat = Boolean(data.coverBankFlat);
    const coverTambala = coverBankFlat ? kwachaToTambala(BANK_FLAT_FEE_KWACHA) : 0;
    // Receiver credit lands in received bag (amount + optional 700 cover).
    const creditTambala = amountTambala + coverTambala;
    const totalDebit = creditTambala + feeTambala;

    const recipients = await sql<{
      user_id: string;
      first_name: string;
      last_name: string;
      phone: string;
      deleted_at: unknown;
      admin_locked_at: unknown;
    }>`
      select user_id, first_name, last_name, phone, deleted_at, admin_locked_at
      from profiles where phone = ${toPhone} limit 1
    `;
    if (!recipients.length || recipients[0].deleted_at) {
      throw new Error("That number does not match any NEXA-SAVER account.");
    }
    if (recipients[0].user_id === context.userId) {
      throw new Error("You cannot send money to your own account.");
    }
    if (recipients[0].admin_locked_at) {
      throw new Error("That account cannot receive transfers right now.");
    }
    const toUserId = recipients[0].user_id;
    const toName = `${recipients[0].first_name} ${recipients[0].last_name}`.trim();
    const reference = newReference("SND");

    await withTransaction(async (tx) => {
      const bal = await tx<{ balance_tambala: number }>`
        select balance_tambala from wallets where user_id = ${context.userId} for update
      `;
      const available = Number(bal[0]?.balance_tambala ?? 0);
      if (available < totalDebit) {
        const coverNote = coverTambala
          ? ` + bank-flat cover ${formatKwacha(coverTambala)}`
          : "";
        throw new Error(
          `Insufficient balance. You need ${formatKwacha(totalDebit)} (send ${formatKwacha(amountTambala)}${coverNote} + fee ${formatKwacha(feeTambala)}).`,
        );
      }
      await tx`
        update wallets
        set balance_tambala = balance_tambala - ${totalDebit},
            lifetime_withdrawn_tambala = lifetime_withdrawn_tambala + ${creditTambala},
            updated_at = now()
        where user_id = ${context.userId}
      `;
      // Credit lands in received bag — not main vault.
      await tx`
        insert into wallets (user_id, balance_tambala, received_balance_tambala, lifetime_deposited_tambala, lifetime_withdrawn_tambala)
        values (${toUserId}, 0, ${creditTambala}, ${creditTambala}, 0)
        on conflict (user_id) do update set
          received_balance_tambala = wallets.received_balance_tambala + ${creditTambala},
          lifetime_deposited_tambala = wallets.lifetime_deposited_tambala + ${creditTambala},
          updated_at = now()
      `;

      const coverNoteOut = coverBankFlat
        ? ` (includes ${formatKwacha(coverTambala)} bank-flat cover)`
        : "";
      const outRows = await tx<{ id: number }>`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, phone, reference, note, completed_at
        ) values (
          ${context.userId}, ${"transfer_out"}, ${"success"}, ${creditTambala}, ${0},
          ${0}, ${0}, ${toPhone}, ${reference},
          ${`Sent ${formatKwacha(amountTambala)} to ${toName} (${toPhone})${coverNoteOut}`}, now()
        ) returning id
      `;
      const inRows = await tx<{ id: number }>`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, phone, reference, note, completed_at
        ) values (
          ${toUserId}, ${"transfer_in"}, ${"success"}, ${creditTambala}, ${creditTambala},
          ${0}, ${0}, ${profile.phone}, ${reference},
          ${`Received ${formatKwacha(creditTambala)} from ${profile.first_name} ${profile.last_name} (received bag${coverBankFlat ? "; includes bank-flat cover" : ""})`}, now()
        ) returning id
      `;
      let feeTxId: number | null = null;
      if (feeTambala > 0) {
        const feeRows = await tx<{ id: number }>`
          insert into transactions (
            user_id, kind, status, gross_tambala, credited_tambala,
            platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
          ) values (
            ${context.userId}, ${"fee"}, ${"success"}, ${feeTambala}, ${0},
            ${feeTambala}, ${0}, ${reference + "_FEE"},
            ${`Send fee for ${reference}`}, now()
          ) returning id
        `;
        feeTxId = feeRows[0]?.id ?? null;
        try {
          await tx`
            insert into platform_treasury (id, balance_tambala, lifetime_in_tambala, updated_at)
            values (1, ${feeTambala}, ${feeTambala}, now())
            on conflict (id) do update set
              balance_tambala = platform_treasury.balance_tambala + ${feeTambala},
              lifetime_in_tambala = platform_treasury.lifetime_in_tambala + ${feeTambala},
              updated_at = now()
          `;
        } catch {
          /* optional */
        }
      }

      await tx`
        insert into transfers (
          reference, from_user_id, to_user_id, amount_tambala, fee_tambala,
          from_phone, to_phone, to_display_name, status,
          out_tx_id, in_tx_id, fee_tx_id, cover_bank_flat, credit_tambala
        ) values (
          ${reference}, ${context.userId}, ${toUserId}, ${amountTambala}, ${feeTambala},
          ${profile.phone}, ${toPhone}, ${toName}, ${"completed"},
          ${outRows[0]?.id ?? null}, ${inRows[0]?.id ?? null}, ${feeTxId},
          ${coverBankFlat}, ${creditTambala}
        )
      `;
    });

    const result = {
      ok: true as const,
      reference,
      amountTambala,
      feeTambala,
      creditTambala,
      coverBankFlat,
      toName,
      toPhone,
    };
    await storeIdempotencyResponse(sql, data.idempotencyKey, result);
    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      userId: context.userId,
      action: "transfer_send",
      detail: `ref=${reference} to=${toPhone} amount=${amountTambala} credit=${creditTambala} cover=${coverBankFlat} fee=${feeTambala}`,
    });
    return result;
  });

export const requestTransferReversal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4).max(64), note: z.string().max(400).optional() }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      from_user_id: string;
      status: string;
    }>`
      select id, from_user_id, status from transfers where reference = ${data.reference} limit 1
    `;
    if (!rows.length) throw new Error("Transfer not found.");
    if (rows[0].from_user_id !== context.userId) {
      throw new Error("Only the sender can request a reversal.");
    }
    if (rows[0].status !== "completed" && rows[0].status !== "reversal_requested") {
      throw new Error(`This transfer cannot be reversed (status: ${rows[0].status}).`);
    }
    await sql`
      update transfers set status = ${"reversal_requested"}, updated_at = now()
      where id = ${rows[0].id} and status = ${"completed"}
    `;
    await sql`
      insert into transfer_reversal_requests (transfer_id, requested_by, status, user_note)
      values (${rows[0].id}, ${context.userId}, ${"pending"}, ${data.note ?? null})
    `;
    return {
      ok: true as const,
      message:
        "Reversal request received. For immediate help, call the platform support number. An admin will need your transaction ID.",
    };
  });

export const adminListTransferReversals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      const rows = await sql<{
        req_id: number;
        req_status: string;
        user_note: string | null;
        created_at: unknown;
        reference: string;
        amount_tambala: number;
        fee_tambala: number;
        from_phone: string | null;
        to_phone: string;
        to_display_name: string | null;
        transfer_status: string;
        frozen_until: unknown;
        from_username: string;
        to_username: string;
      }>`
        select r.id as req_id, r.status as req_status, r.user_note, r.created_at,
               t.reference, t.amount_tambala, t.fee_tambala, t.from_phone, t.to_phone,
               t.to_display_name, t.status as transfer_status, t.frozen_until,
               pf.username as from_username, pt.username as to_username
        from transfer_reversal_requests r
        join transfers t on t.id = r.transfer_id
        join profiles pf on pf.user_id = t.from_user_id
        join profiles pt on pt.user_id = t.to_user_id
        order by r.created_at desc
        limit 80
      `;
      return rows.map((r) => ({
        requestId: Number(r.req_id),
        requestStatus: r.req_status,
        userNote: r.user_note,
        createdAt: new Date(r.created_at as string | Date).toISOString(),
        reference: r.reference,
        amountTambala: Number(r.amount_tambala),
        feeTambala: Number(r.fee_tambala),
        fromPhone: r.from_phone,
        toPhone: r.to_phone,
        toDisplayName: r.to_display_name,
        transferStatus: r.transfer_status,
        frozenUntil: r.frozen_until ? new Date(r.frozen_until as string | Date).toISOString() : null,
        fromUsername: r.from_username,
        toUsername: r.to_username,
      }));
    } catch {
      return [];
    }
  });

export const adminLookupTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4).max(64) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      reference: string;
      amount_tambala: number;
      fee_tambala: number;
      status: string;
      from_phone: string | null;
      to_phone: string;
      to_display_name: string | null;
      frozen_until: unknown;
      from_user_id: string;
      to_user_id: string;
      from_username: string;
      to_username: string;
      to_email: string;
    }>`
      select t.*, pf.username as from_username, pt.username as to_username, pt.email as to_email
      from transfers t
      join profiles pf on pf.user_id = t.from_user_id
      join profiles pt on pt.user_id = t.to_user_id
      where t.reference = ${data.reference}
      limit 1
    `;
    if (!rows.length) throw new Error("No transfer with that transaction ID.");
    const r = rows[0];
    return {
      id: Number(r.id),
      reference: r.reference,
      amountTambala: Number(r.amount_tambala),
      feeTambala: Number(r.fee_tambala),
      status: r.status,
      fromPhone: r.from_phone,
      toPhone: r.to_phone,
      toDisplayName: r.to_display_name,
      frozenUntil: r.frozen_until ? new Date(r.frozen_until as string | Date).toISOString() : null,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      fromUsername: r.from_username,
      toUsername: r.to_username,
      toEmail: r.to_email,
    };
  });

export const adminFreezeTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4).max(64), days: z.number().int().min(1).max(14).optional() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql, withTransaction } = await import("@/lib/db");
    const { maskPhone } = await import("./send-fee.server");
    const sql = await getSql();
    const days = data.days ?? 2;
    const rows = await sql<{
      id: number;
      to_user_id: string;
      from_user_id: string;
      amount_tambala: number;
      status: string;
      from_phone: string | null;
      to_email: string;
      to_first: string;
      from_username: string;
    }>`
      select t.id, t.to_user_id, t.from_user_id, t.amount_tambala, t.status, t.from_phone,
             pt.email as to_email, pt.first_name as to_first, pf.username as from_username
      from transfers t
      join profiles pt on pt.user_id = t.to_user_id
      join profiles pf on pf.user_id = t.from_user_id
      where t.reference = ${data.reference}
      limit 1
    `;
    if (!rows.length) throw new Error("Transfer not found.");
    const tr = rows[0];
    if (tr.status === "reversed") throw new Error("Already reversed.");
    if (tr.status === "released") throw new Error("Already released to the recipient.");

    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await withTransaction(async (tx) => {
      // Hold the amount on recipient so they cannot withdraw the disputed sum (soft freeze: status only + email)
      await tx`
        update transfers
        set status = ${"frozen"},
            frozen_at = now(),
            frozen_until = ${until},
            updated_at = now()
        where id = ${tr.id}
      `;
      await tx`
        update transfer_reversal_requests
        set status = ${"frozen"}, handled_by = ${context.userId}, updated_at = now()
        where transfer_id = ${tr.id} and status in (${"pending"}, ${"frozen"})
      `;
    });

    try {
      const { sendMail } = await import("./mail.server");
      const { maskPhone } = await import("./send-fee.server");
      await sendMail({
        to: tr.to_email,
        subject: "NEXA-SAVER — transfer under review",
        text:
          `Hello ${tr.to_first},\n\n` +
          `You received money that may have been sent by mistake from ${maskPhone(tr.from_phone || "")} (${tr.from_username}). ` +
          `That transfer is frozen for ${days} days while we review.\n\n` +
          `If you claim the money was meant for you, contact support using the platform number. ` +
          `The platform may arrange a call (e.g. Zoom) between both parties to reach a final conclusion.\n\nNEXA-SAVER`,
      });
    } catch {
      /* email best-effort */
    }

        const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "transfer_freeze",
      detail: `ref=${data.reference} until=${until.toISOString()}`,
    });
    return { ok: true as const, frozenUntil: until.toISOString() };
  });

export const adminResolveTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      reference: z.string().min(4).max(64),
      action: z.enum(["reverse", "release"]),
      note: z.string().max(400).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql, withTransaction } = await import("@/lib/db");
    const { formatKwacha } = await import("./money");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      from_user_id: string;
      to_user_id: string;
      amount_tambala: number;
      status: string;
      reference: string;
    }>`
      select id, from_user_id, to_user_id, amount_tambala, status, reference
      from transfers where reference = ${data.reference} limit 1
    `;
    if (!rows.length) throw new Error("Transfer not found.");
    const tr = rows[0];
    const amount = Number(tr.amount_tambala);

    if (data.action === "release") {
      await sql`
        update transfers set status = ${"released"}, released_at = now(), updated_at = now()
        where id = ${tr.id}
      `;
      await sql`
        update transfer_reversal_requests
        set status = ${"released"}, handled_by = ${context.userId}, admin_note = ${data.note ?? null}, updated_at = now()
        where transfer_id = ${tr.id}
      `;
      return { ok: true as const, action: "release" as const };
    }

    // reverse: move amount back from recipient to sender (fee stays with platform)
    await withTransaction(async (tx) => {
      const toBal = await tx<{ balance_tambala: number }>`
        select balance_tambala from wallets where user_id = ${tr.to_user_id} for update
      `;
      if (Number(toBal[0]?.balance_tambala ?? 0) < amount) {
        throw new Error("Recipient no longer has enough balance to reverse the full amount.");
      }
      await tx`
        update wallets set balance_tambala = balance_tambala - ${amount}, updated_at = now()
        where user_id = ${tr.to_user_id}
      `;
      await tx`
        update wallets set balance_tambala = balance_tambala + ${amount}, updated_at = now()
        where user_id = ${tr.from_user_id}
      `;
      const revRef = `${tr.reference}_REV`;
      await tx`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
        ) values (
          ${tr.to_user_id}, ${"transfer_out"}, ${"success"}, ${amount}, ${0},
          ${0}, ${0}, ${revRef}, ${`Reversal of ${tr.reference}`}, now()
        )
      `;
      await tx`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
        ) values (
          ${tr.from_user_id}, ${"transfer_in"}, ${"success"}, ${amount}, ${amount},
          ${0}, ${0}, ${revRef}, ${`Reversal credit for ${tr.reference}`}, now()
        )
      `;
      await tx`
        update transfers set status = ${"reversed"}, reversed_at = now(), updated_at = now()
        where id = ${tr.id}
      `;
      await tx`
        update transfer_reversal_requests
        set status = ${"reversed"}, handled_by = ${context.userId}, admin_note = ${data.note ?? null}, updated_at = now()
        where transfer_id = ${tr.id}
      `;
    });

    const { writeAudit } = await import("./audit.server");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "transfer_reverse",
      detail: `ref=${data.reference} amount=${amount}`,
    });
    return { ok: true as const, action: "reverse" as const };
  });


export const getLoanPolicyPublic = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getLoanInterestRate, getLoanLtvRate } = await import("./loan.server");
  const sql = await getSql();
  return {
    interestMonthly: await getLoanInterestRate(sql),
    ltvRate: await getLoanLtvRate(sql),
  };
});

export const adminGetLoanPolicy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getLoanInterestRate, getLoanLtvRate } = await import("./loan.server");
    const sql = await getSql();
    return {
      interestMonthly: await getLoanInterestRate(sql),
      ltvRate: await getLoanLtvRate(sql),
    };
  });

export const adminSetLoanPolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      interestPercent: z.number().min(0).max(50),
      ltvPercent: z.number().min(1).max(100),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { setLoanPolicy, getLoanInterestRate, getLoanLtvRate } = await import("./loan.server");
    const sql = await getSql();
    await setLoanPolicy(sql, {
      interestMonthly: data.interestPercent / 100,
      ltvRate: data.ltvPercent / 100,
    });
    return {
      interestMonthly: await getLoanInterestRate(sql),
      ltvRate: await getLoanLtvRate(sql),
    };
  });

export const getMyLoans = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { processLoansForUser } = await import("./loan.server");
    const sql = await getSql();
    try {
      await processLoansForUser(sql, context.userId);
    } catch {
      /* table may not exist yet */
    }
    try {
      const rows = await sql<{
        id: number;
        reference: string;
        principal_tambala: number;
        balance_due_tambala: number;
        interest_rate_monthly: number;
        collateral_tambala: number;
        repayment_mode: string;
        status: string;
        started_at: unknown;
        next_period_at: unknown;
        periods_elapsed: number;
      }>`
        select id, reference, principal_tambala, balance_due_tambala, interest_rate_monthly,
               collateral_tambala, repayment_mode, status, started_at, next_period_at, periods_elapsed
        from loans where user_id = ${context.userId}
        order by created_at desc
        limit 20
      `;
      return rows.map((r) => ({
        id: Number(r.id),
        reference: r.reference,
        principalTambala: Number(r.principal_tambala),
        balanceDueTambala: Number(r.balance_due_tambala),
        interestRateMonthly: Number(r.interest_rate_monthly),
        collateralTambala: Number(r.collateral_tambala),
        repaymentMode: r.repayment_mode as "auto" | "manual",
        status: r.status,
        startedAt: new Date(r.started_at as string | Date).toISOString(),
        nextPeriodAt: new Date(r.next_period_at as string | Date).toISOString(),
        periodsElapsed: Number(r.periods_elapsed),
      }));
    } catch {
      return [];
    }
  });

export const getLoanEligibility = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const { getSql } = await import("@/lib/db");
    const { getLoanInterestRate, getLoanLtvRate } = await import("./loan.server");
    const sql = await getSql();
    const interest = await getLoanInterestRate(sql);
    const ltv = await getLoanLtvRate(sql);

    if (profile.admin_locked_at) {
      return { eligible: false as const, reason: "Account is locked by the platform. Loans are not available.", maxTambala: 0, interest, ltv };
    }
    if (profile.admin_withdraw_locked_at) {
      return { eligible: false as const, reason: "Withdrawals are locked by the platform. Loans need a self time-lock only.", maxTambala: 0, interest, ltv };
    }
    const lockUntil = profile.withdraw_lock_until
      ? new Date(profile.withdraw_lock_until as string | Date).getTime()
      : 0;
    if (!lockUntil || lockUntil <= Date.now()) {
      return {
        eligible: false as const,
        reason: "Loans are only available while you have a voluntary withdrawal time-lock active.",
        maxTambala: 0,
        interest,
        ltv,
      };
    }
    const active = await sql<{ n: number }>`
      select count(*)::int as n from loans where user_id = ${context.userId} and status = ${"active"}
    `.catch(() => [{ n: 0 }]);
    if (Number(active[0]?.n ?? 0) > 0) {
      return { eligible: false as const, reason: "You already have an active loan. Repay or close it first.", maxTambala: 0, interest, ltv };
    }
    const bal = await sql<{ balance_tambala: number }>`
      select balance_tambala from wallets where user_id = ${context.userId} limit 1
    `;
    const collateral = Number(bal[0]?.balance_tambala ?? 0);
    const maxTambala = Math.floor(collateral * ltv);
    return {
      eligible: maxTambala >= 10000, // min 100 kwacha in tambala
      reason: maxTambala < 10000 ? "Locked balance is too low for a loan." : null,
      maxTambala,
      collateralTambala: collateral,
      interest,
      ltv,
      lockUntil: new Date(lockUntil).toISOString(),
    };
  });

/**
 * Disburse loan: principal paid out like a withdrawal (or demo), collateral stays in vault.
 * First period due = principal * (1 + rate), due after one month.
 */
export const applyLoan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      amountKwacha: z.number().positive(),
      repaymentMode: z.enum(["auto", "manual"]),
      pin: pinSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (profile.role === "admin") throw new Error("Admin accounts cannot take user loans.");
    if (profile.admin_locked_at) throw new Error("Platform-locked accounts cannot take loans.");
    if (profile.admin_withdraw_locked_at) {
      throw new Error("Platform withdraw-lock blocks loans. Only a self time-lock qualifies.");
    }
    const lockUntil = profile.withdraw_lock_until
      ? new Date(profile.withdraw_lock_until as string | Date).getTime()
      : 0;
    if (!lockUntil || lockUntil <= Date.now()) {
      throw new Error("Set a voluntary withdrawal lock first. Loans are only against a self time-lock.");
    }

    const { verifySecret } = await import("./crypto");
    if (!(await verifySecret(profile.pin_hash, data.pin))) throw new Error("Incorrect PIN");

    const { getSql, withTransaction } = await import("@/lib/db");
    const { getLoanInterestRate, getLoanLtvRate, addOneMonth, logLoanEvent } = await import("./loan.server");
    const { newReference } = await import("./crypto");
    const { kwachaToTambala, formatKwacha } = await import("./money");
    const sql = await getSql();

    const interest = await getLoanInterestRate(sql);
    const ltv = await getLoanLtvRate(sql);
    const amountTambala = kwachaToTambala(Math.floor(data.amountKwacha));
    if (amountTambala < 10000) throw new Error("Minimum loan is 100 kwacha.");

    const bal = await sql<{ balance_tambala: number }>`
      select balance_tambala from wallets where user_id = ${context.userId} limit 1
    `;
    const collateral = Number(bal[0]?.balance_tambala ?? 0);
    const maxTambala = Math.floor(collateral * ltv);
    if (amountTambala > maxTambala) {
      throw new Error(
        `Maximum loan is ${formatKwacha(maxTambala)} (${(ltv * 100).toFixed(0)}% of your locked balance ${formatKwacha(collateral)}).`,
      );
    }

    const active = await sql<{ n: number }>`
      select count(*)::int as n from loans where user_id = ${context.userId} and status = ${"active"}
    `;
    if (Number(active[0]?.n ?? 0) > 0) throw new Error("You already have an active loan.");

    // First month due = principal + interest
    const firstDue = Math.ceil(amountTambala * (1 + interest));
    const started = new Date();
    const nextPeriod = addOneMonth(started);
    const reference = newReference("LOAN");

    // Disburse: payout to MoMo if possible; demo marks success without rail
    const demo = process.env.NEXA_DEMO_PAYMENTS === "true" || process.env.NODE_ENV === "development";
    let disburseTxId: number | null = null;

    await withTransaction(async (tx) => {
      // Collateral stays; create payout-shaped withdrawal for principal
      const txRows = await tx<{ id: number }>`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, phone, reference, note, completed_at
        ) values (
          ${context.userId}, ${"withdrawal"}, ${demo ? "success" : "pending"}, ${amountTambala}, ${0},
          ${0}, ${0}, ${profile.phone}, ${reference},
          ${"Loan disbursement"}, ${demo ? new Date() : null}
        ) returning id
      `;
      disburseTxId = txRows[0]?.id ?? null;

      await tx`
        insert into loans (
          reference, user_id, principal_tambala, balance_due_tambala,
          interest_rate_monthly, ltv_rate, collateral_tambala, repayment_mode,
          status, started_at, next_period_at, periods_elapsed, disbursement_tx_id
        ) values (
          ${reference}, ${context.userId}, ${amountTambala}, ${firstDue},
          ${interest}, ${ltv}, ${collateral}, ${data.repaymentMode},
          ${"active"}, ${started}, ${nextPeriod}, ${0}, ${disburseTxId}
        )
      `;
    });

    if (!demo) {
      try {
        const { initiateMomoPayout, demoPaymentsEnabled } = await import("./paychangu.server");
        if (demoPaymentsEnabled()) {
          await sql`
            update transactions set status = ${"success"}, completed_at = now() where reference = ${reference}
          `;
        } else {
          await initiateMomoPayout({
            phone: profile.phone,
            amountKwacha: Math.round(amountTambala / 100),
            chargeId: reference,
            email: profile.email,
            firstName: profile.first_name,
            lastName: profile.last_name,
          });
          await sql`
            update transactions set status = ${"success"}, completed_at = now() where reference = ${reference}
          `;
        }
      } catch (err) {
        await sql`update loans set status = ${"cancelled"}, updated_at = now() where reference = ${reference}`;
        await sql`
          update transactions set status = ${"failed"}, note = ${"Loan disbursement failed"} where reference = ${reference}
        `;
        throw new Error(
          "Could not disburse the loan to your mobile money. Loan cancelled. " +
            String((err as Error).message ?? "").slice(0, 120),
        );
      }
    }

    const loanId = await sql<{ id: number }>`select id from loans where reference = ${reference} limit 1`;
    if (loanId[0]) {
      await logLoanEvent(
        sql,
        Number(loanId[0].id),
        "opened",
        `Principal ${amountTambala} due first period ${firstDue} mode ${data.repaymentMode}`,
        firstDue,
      );
    }

    return {
      ok: true as const,
      reference,
      principalTambala: amountTambala,
      firstDueTambala: firstDue,
      nextPeriodAt: nextPeriod.toISOString(),
      interest,
      repaymentMode: data.repaymentMode,
    };
  });

export const repayLoan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ reference: z.string().min(4), pin: pinSchema }))
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const { verifySecret } = await import("./crypto");
    if (!(await verifySecret(profile.pin_hash, data.pin))) throw new Error("Incorrect PIN");

    const { getSql, withTransaction } = await import("@/lib/db");
    const { logLoanEvent } = await import("./loan.server");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      balance_due_tambala: number;
      principal_tambala: number;
      status: string;
      user_id: string;
    }>`
      select id, balance_due_tambala, principal_tambala, status, user_id from loans where reference = ${data.reference} limit 1
    `;
    if (!rows.length || rows[0].user_id !== context.userId) throw new Error("Loan not found.");
    if (rows[0].status !== "active") throw new Error("This loan is not active.");
    const due = Number(rows[0].balance_due_tambala);
    const principal = Number(rows[0].principal_tambala);

    await withTransaction(async (tx) => {
      const bal = await tx<{ balance_tambala: number }>`
        select balance_tambala from wallets where user_id = ${context.userId} for update
      `;
      if (Number(bal[0]?.balance_tambala ?? 0) < due) {
        throw new Error("Insufficient vault balance to repay the full amount due.");
      }
      await tx`
        update wallets set balance_tambala = balance_tambala - ${due}, updated_at = now()
        where user_id = ${context.userId}
      `;
      await tx`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
        ) values (
          ${context.userId}, ${"fee"}, ${"success"}, ${due}, ${0},
          ${0}, ${0}, ${data.reference + "_PAY"},
          ${"Loan repayment (manual)"}, now()
        )
      `;
      await tx`
        update loans set status = ${"paid"}, balance_due_tambala = ${0}, closed_at = now(), updated_at = now()
        where id = ${rows[0].id}
      `;
    });
    const { recordLoanInterestEarned } = await import("./loan.server");
    await recordLoanInterestEarned(sql, context.userId, data.reference, principal, due, due);
    await logLoanEvent(sql, Number(rows[0].id), "paid_manual", `Repaid ${due}`, 0);
    return { ok: true as const, paidTambala: due };
  });


export const adminListLoans = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().max(80).optional() }).optional())
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const q = (data?.q ?? "").trim().toLowerCase();
    try {
      const rows = await sql<{
        id: number;
        reference: string;
        principal_tambala: number;
        balance_due_tambala: number;
        interest_rate_monthly: number;
        collateral_tambala: number;
        repayment_mode: string;
        status: string;
        started_at: unknown;
        next_period_at: unknown;
        periods_elapsed: number;
        closed_at: unknown;
        username: string;
        phone: string;
        first_name: string;
        last_name: string;
      }>`
        select l.id, l.reference, l.principal_tambala, l.balance_due_tambala, l.interest_rate_monthly,
               l.collateral_tambala, l.repayment_mode, l.status, l.started_at, l.next_period_at,
               l.periods_elapsed, l.closed_at,
               p.username, p.phone, p.first_name, p.last_name
        from loans l
        join profiles p on p.user_id = l.user_id
        order by l.created_at desc
        limit 200
      `;
      let list = rows.map((r) => ({
        id: Number(r.id),
        reference: r.reference,
        principalTambala: Number(r.principal_tambala),
        balanceDueTambala: Number(r.balance_due_tambala),
        interestRateMonthly: Number(r.interest_rate_monthly),
        collateralTambala: Number(r.collateral_tambala),
        repaymentMode: r.repayment_mode,
        status: r.status,
        startedAt: new Date(r.started_at as string | Date).toISOString(),
        nextPeriodAt: new Date(r.next_period_at as string | Date).toISOString(),
        periodsElapsed: Number(r.periods_elapsed),
        closedAt: r.closed_at ? new Date(r.closed_at as string | Date).toISOString() : null,
        username: r.username,
        phone: r.phone,
        fullName: `${r.first_name} ${r.last_name}`.trim(),
      }));
      if (q) {
        list = list.filter(
          (r) =>
            r.reference.toLowerCase().includes(q) ||
            r.username.toLowerCase().includes(q) ||
            r.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
            r.fullName.toLowerCase().includes(q) ||
            r.status.toLowerCase().includes(q),
        );
      }
      return list;
    } catch {
      return [];
    }
  });


export const getReferralPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { isReferralProgramEnabled, getReferralRates, getOgSettings } = await import("./referral.server");
  const sql = await getSql();
  const enabled = await isReferralProgramEnabled(sql);
  const rates = await getReferralRates(sql);
  const og = await getOgSettings(sql);
  return { enabled, ...rates, og };
});

export const getAffiliateStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { isReferralProgramEnabled, getReferralRates, getOgSettings } = await import("./referral.server");
    const sql = await getSql();
    const enabled = await isReferralProgramEnabled(sql);
    const rates = await getReferralRates(sql);
    const og = await getOgSettings(sql);
    const prof = await sql<{
      affiliate_code: string | null;
      affiliate_joined_at: unknown;
    }>`
      select affiliate_code, affiliate_joined_at from profiles where user_id = ${context.userId} limit 1
    `.catch(() => []);
    const isAffiliate = Boolean(prof[0]?.affiliate_joined_at && prof[0]?.affiliate_code);
    let wallet = { balanceTambala: 0, lifetimeEarnedTambala: 0, lifetimeWithdrawnTambala: 0 };
    let earnings: Array<{ commissionTambala: number; grossDepositTambala: number; createdAt: string; depositReference: string }> = [];
    if (isAffiliate) {
      const w = await sql<{ balance_tambala: number; lifetime_earned_tambala: number; lifetime_withdrawn_tambala: number }>`
        select balance_tambala, lifetime_earned_tambala, lifetime_withdrawn_tambala
        from affiliate_wallets where user_id = ${context.userId} limit 1
      `.catch(() => []);
      if (w[0]) {
        wallet = {
          balanceTambala: Number(w[0].balance_tambala),
          lifetimeEarnedTambala: Number(w[0].lifetime_earned_tambala),
          lifetimeWithdrawnTambala: Number(w[0].lifetime_withdrawn_tambala),
        };
      }
      const e = await sql<{ commission_tambala: number; gross_deposit_tambala: number; created_at: unknown; deposit_reference: string }>`
        select commission_tambala, gross_deposit_tambala, created_at, deposit_reference
        from affiliate_earnings where affiliate_user_id = ${context.userId}
        order by created_at desc limit 30
      `.catch(() => []);
      earnings = e.map((r) => ({
        commissionTambala: Number(r.commission_tambala),
        grossDepositTambala: Number(r.gross_deposit_tambala),
        createdAt: new Date(r.created_at as string | Date).toISOString(),
        depositReference: r.deposit_reference,
      }));
    }
    return {
      programEnabled: enabled,
      isAffiliate,
      code: prof[0]?.affiliate_code ?? null,
      joinedAt: prof[0]?.affiliate_joined_at
        ? new Date(prof[0].affiliate_joined_at as string | Date).toISOString()
        : null,
      rates,
      og,
      wallet,
      earnings,
    };
  });

export const becomeAffiliate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ acceptTerms: z.literal(true) }))
  .handler(async ({ context, data }) => {
    void data;
    const { getSql } = await import("@/lib/db");
    const { isReferralProgramEnabled, generateAffiliateCode } = await import("./referral.server");
    const sql = await getSql();
    if (!(await isReferralProgramEnabled(sql))) {
      throw new Error("The referral program is paused. Try again when the platform turns it back on.");
    }
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (profile.role === "admin") throw new Error("Admin accounts cannot join the affiliate program.");
    const existing = await sql<{ affiliate_code: string | null; affiliate_joined_at: unknown }>`
      select affiliate_code, affiliate_joined_at from profiles where user_id = ${context.userId} limit 1
    `;
    if (existing[0]?.affiliate_joined_at && existing[0]?.affiliate_code) {
      return { code: existing[0].affiliate_code, already: true as const };
    }
    let code = generateAffiliateCode(profile.username);
    for (let i = 0; i < 5; i++) {
      const clash = await sql<{ n: number }>`
        select count(*)::int as n from profiles where upper(affiliate_code) = ${code}
      `;
      if (Number(clash[0]?.n ?? 0) === 0) break;
      code = generateAffiliateCode(profile.username);
    }
    await sql`
      update profiles
      set affiliate_code = ${code}, affiliate_joined_at = now(), updated_at = now()
      where user_id = ${context.userId}
    `;
    await sql`
      insert into affiliate_wallets (user_id) values (${context.userId})
      on conflict (user_id) do nothing
    `;
    return { code, already: false as const };
  });

export const withdrawAffiliateEarnings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pin: pinSchema }))
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const { verifySecret } = await import("./crypto");
    if (!(await verifySecret(profile.pin_hash, data.pin))) throw new Error("Incorrect PIN");

    const { getSql, withTransaction } = await import("@/lib/db");
    const { getReferralRates } = await import("./referral.server");
    const { kwachaToTambala, formatKwacha } = await import("./money");
    const sql = await getSql();
    const rates = await getReferralRates(sql);
    const minTambala = kwachaToTambala(rates.withdrawMinKwacha);

    const result = await withTransaction(async (tx) => {
      const w = await tx<{ balance_tambala: number }>`
        select balance_tambala from affiliate_wallets where user_id = ${context.userId} for update
      `;
      const bal = Number(w[0]?.balance_tambala ?? 0);
      if (bal < minTambala) {
        throw new Error(`Minimum referral withdrawal is ${rates.withdrawMinKwacha} kwacha.`);
      }
      const fee = Math.floor(bal * rates.withdrawFeeRate);
      const net = bal - fee;
      if (net <= 0) throw new Error("Nothing left after the withdrawal fee.");

      await tx`
        update affiliate_wallets
        set balance_tambala = 0,
            lifetime_withdrawn_tambala = lifetime_withdrawn_tambala + ${bal},
            updated_at = now()
        where user_id = ${context.userId}
      `;
      await tx`
        update wallets
        set balance_tambala = balance_tambala + ${net}, updated_at = now()
        where user_id = ${context.userId}
      `;
      const ref = `AFFW_${context.userId.slice(0, 8)}_${Date.now().toString(36)}`;
      await tx`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
        ) values (
          ${context.userId}, ${"deposit"}, ${"success"}, ${net}, ${net},
          ${0}, ${0}, ${ref},
          ${"Referral earnings withdrawal (net after fee)"}, now()
        )
      `;
      if (fee > 0) {
        await tx`
          insert into transactions (
            user_id, kind, status, gross_tambala, credited_tambala,
            platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
          ) values (
            ${context.userId}, ${"fee"}, ${"success"}, ${fee}, ${0},
            ${fee}, ${0}, ${ref + "_FEE"},
            ${"Referral withdrawal fee"}, now()
          )
        `;
        try {
          await tx`
            insert into platform_treasury (id, balance_tambala, lifetime_in_tambala, updated_at)
            values (1, ${fee}, ${fee}, now())
            on conflict (id) do update set
              balance_tambala = platform_treasury.balance_tambala + ${fee},
              lifetime_in_tambala = platform_treasury.lifetime_in_tambala + ${fee},
              updated_at = now()
          `;
        } catch {
          /* optional */
        }
      }
      return { net, fee, gross: bal, ref };
    });

    return {
      ok: true as const,
      netTambala: result.net,
      feeTambala: result.fee,
      grossTambala: result.gross,
      reference: result.ref,
      message: `${formatKwacha(result.net)} added to your vault (${formatKwacha(result.fee)} platform fee).`,
    };
  });

export const adminGetReferralSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { isReferralProgramEnabled, getReferralRates, getOgSettings } = await import("./referral.server");
    const sql = await getSql();
    return {
      enabled: await isReferralProgramEnabled(sql),
      rates: await getReferralRates(sql),
      og: await getOgSettings(sql),
    };
  });

export const adminSetReferralSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      enabled: z.boolean(),
      commissionPercent: z.number().min(0).max(20).optional(),
      withdrawMinKwacha: z.number().min(0).optional(),
      withdrawFeePercent: z.number().min(0).max(50).optional(),
      ogShareTitle: z.string().max(120).optional(),
      ogShareDescription: z.string().max(300).optional(),
      ogShareImage: z.string().max(200).optional(),
      ogReferralTitle: z.string().max(120).optional(),
      ogReferralDescription: z.string().max(300).optional(),
      ogReferralImage: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const set = async (key: string, value: string) => {
      await sql`
        insert into platform_settings (key, value, updated_at)
        values (${key}, ${value}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
    };
    await set("referral_program_enabled", data.enabled ? "true" : "false");
    if (data.commissionPercent != null) await set("referral_commission_rate", String(data.commissionPercent / 100));
    if (data.withdrawMinKwacha != null) await set("referral_withdraw_min_kwacha", String(data.withdrawMinKwacha));
    if (data.withdrawFeePercent != null) await set("referral_withdraw_fee_rate", String(data.withdrawFeePercent / 100));
    if (data.ogShareTitle != null) await set("og_share_title", data.ogShareTitle);
    if (data.ogShareDescription != null) await set("og_share_description", data.ogShareDescription);
    if (data.ogShareImage != null) await set("og_share_image", data.ogShareImage.startsWith("/") ? data.ogShareImage : `/${data.ogShareImage}`);
    if (data.ogReferralTitle != null) await set("og_referral_title", data.ogReferralTitle);
    if (data.ogReferralDescription != null) await set("og_referral_description", data.ogReferralDescription);
    if (data.ogReferralImage != null)
      await set("og_referral_image", data.ogReferralImage.startsWith("/") ? data.ogReferralImage : `/${data.ogReferralImage}`);
    return { ok: true as const };
  });


export const getSignupIntroVideo = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSignupIntroYoutubeId } = await import("./referral.server");
  const sql = await getSql();
  const videoId = await getSignupIntroYoutubeId(sql);
  return { videoId };
});

export const adminGetSignupIntroVideo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      const rows = await sql<{ value: string }>`
        select value from platform_settings where key = ${"signup_intro_youtube"} limit 1
      `;
      return { urlOrId: rows[0]?.value ?? "" };
    } catch {
      return { urlOrId: "" };
    }
  });

export const adminSetSignupIntroVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ urlOrId: z.string().max(300) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { parseYoutubeVideoId } = await import("./referral.server");
    const sql = await getSql();
    const trimmed = data.urlOrId.trim();
    if (trimmed && !parseYoutubeVideoId(trimmed)) {
      throw new Error("Enter a valid YouTube link or video id.");
    }
    await sql`
      insert into platform_settings (key, value, updated_at)
      values (${"signup_intro_youtube"}, ${trimmed}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
    return { ok: true as const, videoId: parseYoutubeVideoId(trimmed) };
  });


export const adminUploadOgImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      /** raw base64 without data: prefix — client should compress first */
      base64: z.string().min(80).max(3_500_000),
      mime: z.string().min(3).max(64),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mime = data.mime.split(";")[0].trim().toLowerCase();
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(mime)) {
      throw new Error("Use JPEG, PNG, WebP, or GIF.");
    }
    const normalizedMime = mime === "image/jpg" ? "image/jpeg" : mime;
    if (data.base64.length * 0.75 > 2.2 * 1024 * 1024) {
      throw new Error("Image is still too large after read. Try a smaller file (under 1 MB).");
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();

    // One platform OG image for site + share + referral (no competing assets).
    const set = async (key: string, value: string) => {
      await sql`
        insert into platform_settings (key, value, updated_at)
        values (${key}, ${value}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
    };
    await set("og_platform_image_data", data.base64);
    await set("og_platform_image_type", normalizedMime);
    // Keep legacy keys in sync so old paths still work
    await set("og_share_image_data", data.base64);
    await set("og_share_image_type", normalizedMime);
    await set("og_referral_image_data", data.base64);
    await set("og_referral_image_type", normalizedMime);
    await set("og_share_image", "/api/og-image/share");
    await set("og_referral_image", "/api/og-image/referral");

    try {
      const { writeAudit } = await import("./audit.server");
      await writeAudit(sql, {
        actorUserId: context.userId,
        action: "og_image_upload",
        detail: `mime=${normalizedMime} bytes≈${Math.round(data.base64.length * 0.75)}`,
      });
    } catch {
      /* audit optional */
    }

    return {
      ok: true as const,
      path: "/api/og-image/share",
      paths: { share: "/api/og-image/share", referral: "/api/og-image/referral" },
    };
  });


export const moveReceivedToMain = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ amountKwacha: z.number().positive().optional() }))
  .handler(async ({ context, data }) => {
    const { getSql, withTransaction } = await import("@/lib/db");
    const { kwachaToTambala, formatKwacha } = await import("./money");
    const { newReference } = await import("./crypto");
    await withTransaction(async (tx) => {
      const rows = await tx<{ balance_tambala: number; received_balance_tambala: number }>`
        select balance_tambala, coalesce(received_balance_tambala, 0) as received_balance_tambala
        from wallets where user_id = ${context.userId} for update
      `;
      const received = Number(rows[0]?.received_balance_tambala ?? 0);
      if (received <= 0) throw new Error("Your received bag is empty.");
      const want = data.amountKwacha != null ? kwachaToTambala(Math.floor(data.amountKwacha)) : received;
      const move = Math.min(want, received);
      if (move <= 0) throw new Error("Nothing to move.");
      await tx`
        update wallets
        set received_balance_tambala = received_balance_tambala - ${move},
            balance_tambala = balance_tambala + ${move},
            updated_at = now()
        where user_id = ${context.userId}
      `;
      const ref = newReference("RCV");
      await tx`
        insert into transactions (
          user_id, kind, status, gross_tambala, credited_tambala,
          platform_profit_tambala, payout_reserve_tambala, reference, note, completed_at
        ) values (
          ${context.userId}, ${"transfer_in"}, ${"success"}, ${move}, ${move},
          ${0}, ${0}, ${ref},
          ${`Moved ${formatKwacha(move)} from received bag to main vault`}, now()
        )
      `;
    });
    return { ok: true as const };
  });


export const getPublicSiteFooter = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const g = async (key: string, fb: string) => {
    try {
      const rows = await sql<{ value: string }>`select value from platform_settings where key = ${key} limit 1`;
      return rows[0]?.value?.trim() || fb;
    } catch {
      return fb;
    }
  };
  return {
    companyName: await g("footer_company_name", "NEXUS265"),
    companyUrl: await g("footer_company_url", "https://www.facebook.com/"),
  };
});

export const adminGetSiteFooter = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return getPublicSiteFooter();
  });

export const adminSetSiteFooter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      companyName: z.string().min(1).max(80),
      companyUrl: z.string().url().max(300),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const set = async (key: string, value: string) => {
      await sql`
        insert into platform_settings (key, value, updated_at)
        values (${key}, ${value}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
    };
    await set("footer_company_name", data.companyName.trim());
    await set("footer_company_url", data.companyUrl.trim());
    return { ok: true as const };
  });


// —— Phase B: Admin TOTP 2FA ——

export const adminTotpStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getAdminTotpStatus, isTotpElevated } = await import("./admin-totp.server");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const sql = await getSql();
    const st = await getAdminTotpStatus(sql, context.userId);
    const session = await getSessionUser();
    const elevated = st.enabled
      ? await isTotpElevated(sql, context.userId, session?.sessionToken ?? null)
      : true;
    return { ...st, elevated };
  });

export const adminBeginTotpSetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { beginTotpSetup } = await import("./admin-totp.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    const label = profile?.email || profile?.username || "admin";
    const res = await beginTotpSetup(sql, context.userId, label);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "admin_totp_setup_begin",
      detail: "pending secret issued",
    });
    return res;
  });

export const adminConfirmTotpSetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().min(6).max(16) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { confirmTotpSetup, markTotpVerified } = await import("./admin-totp.server");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    try {
      const res = await confirmTotpSetup(sql, context.userId, data.code);
      const session = await getSessionUser();
      if (session?.sessionToken) {
        await markTotpVerified(sql, context.userId, session.sessionToken);
      }
      await writeAudit(sql, {
        actorUserId: context.userId,
        action: "admin_totp_enabled",
        detail: "2FA enrolled",
      });
      return res;
    } catch (err) {
      await writeAudit(sql, {
        actorUserId: context.userId,
        action: "admin_totp_setup_failed",
        detail: String((err as Error).message).slice(0, 120),
      });
      throw err;
    }
  });

export const adminVerifyTotp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().min(6).max(24) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { verifyAndElevate } = await import("./admin-totp.server");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const session = await getSessionUser();
    if (!session?.sessionToken) throw new Error("No session token — sign in again.");
    try {
      await verifyAndElevate(sql, context.userId, session.sessionToken, data.code);
      await writeAudit(sql, {
        actorUserId: context.userId,
        action: "admin_totp_ok",
        detail: "session elevated",
      });
      return { ok: true as const };
    } catch (err) {
      await writeAudit(sql, {
        actorUserId: context.userId,
        action: "admin_totp_failed",
        detail: String((err as Error).message).slice(0, 120),
      });
      throw err;
    }
  });

export const adminDisableTotp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().min(6).max(24) }))
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql } = await import("@/lib/db");
    const { disableTotp } = await import("./admin-totp.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    await disableTotp(sql, context.userId, data.code);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "admin_totp_disabled",
      detail: "2FA turned off",
    });
    return { ok: true as const };
  });


// —— Admin WebAuthn / passkeys ——

export const adminListPasskeys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { listWebAuthnCredentials } = await import("./webauthn.server");
    return listWebAuthnCredentials(await getSql(), context.userId);
  });

export const adminWebAuthnRegisterOptions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getRegistrationOptions } = await import("./webauthn.server");
    const profile = await loadProfile(context.userId);
    const name = profile?.email || profile?.username || "admin";
    return getRegistrationOptions(await getSql(), context.userId, name);
  });

export const adminWebAuthnRegisterVerify = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ response: z.any(), nickname: z.string().max(80).optional() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { verifyRegistration } = await import("./webauthn.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const res = await verifyRegistration(sql, context.userId, data.response, data.nickname);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "admin_webauthn_register",
      detail: `id=${res.id}`,
    });
    return res;
  });

export const adminWebAuthnAuthOptions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { getAuthenticationOptions } = await import("./webauthn.server");
    return getAuthenticationOptions(await getSql(), context.userId);
  });

export const adminWebAuthnAuthVerify = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ response: z.any() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getSql } = await import("@/lib/db");
    const { verifyAuthentication } = await import("./webauthn.server");
    const { markTotpVerified } = await import("./admin-totp.server");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    await verifyAuthentication(sql, context.userId, data.response);
    const session = await getSessionUser();
    if (!session?.sessionToken) throw new Error("No session — sign in again.");
    await markTotpVerified(sql, context.userId, session.sessionToken);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "admin_webauthn_ok",
      detail: "session elevated via passkey",
    });
    return { ok: true as const };
  });

export const adminDeletePasskey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(4) }))
  .handler(async ({ context, data }) => {
    await requireAdminSensitive(context.userId);
    const { getSql } = await import("@/lib/db");
    const { deleteWebAuthnCredential } = await import("./webauthn.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    await deleteWebAuthnCredential(sql, context.userId, data.id);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "admin_webauthn_delete",
      detail: `id=${data.id}`,
    });
    return { ok: true as const };
  });


// —— User passkeys (WebAuthn only — no TOTP for savers) ——

export const userListPasskeys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { listWebAuthnCredentials } = await import("./webauthn.server");
    return listWebAuthnCredentials(await getSql(), context.userId);
  });

export const userWebAuthnRegisterOptions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { getRegistrationOptions } = await import("./webauthn.server");
    const profile = await loadProfile(context.userId);
    const name = profile?.email || profile?.username || profile?.phone || "user";
    return getRegistrationOptions(await getSql(), context.userId, name);
  });

export const userWebAuthnRegisterVerify = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ response: z.any(), nickname: z.string().max(80).optional() }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifyRegistration } = await import("./webauthn.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const res = await verifyRegistration(sql, context.userId, data.response, data.nickname || "My passkey");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "user_webauthn_register",
      detail: `id=${res.id}`,
    });
    return res;
  });

export const userWebAuthnAuthOptions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { getAuthenticationOptions } = await import("./webauthn.server");
    return getAuthenticationOptions(await getSql(), context.userId);
  });

export const userWebAuthnAuthVerify = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ response: z.any() }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifyAuthentication } = await import("./webauthn.server");
    const { markTotpVerified } = await import("./admin-totp.server");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    await verifyAuthentication(sql, context.userId, data.response);
    const session = await getSessionUser();
    if (!session?.sessionToken) throw new Error("No session — sign in again.");
    await markTotpVerified(sql, context.userId, session.sessionToken);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "user_webauthn_ok",
      detail: "session elevated via passkey",
    });
    return { ok: true as const };
  });

export const userDeletePasskey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(4), pin: z.string().min(4).max(12) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { deleteWebAuthnCredential, hasWebAuthn } = await import("./webauthn.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    // Require PIN to remove a key
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Profile missing");
    const { verifySecret } = await import("./crypto");
    const ok = await verifySecret(profile.pin_hash, data.pin);
    if (!ok) throw new Error("Incorrect PIN");
    await deleteWebAuthnCredential(sql, context.userId, data.id);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "user_webauthn_delete",
      detail: `id=${data.id}`,
    });
    return { ok: true as const, stillHasPasskey: await hasWebAuthn(sql, context.userId) };
  });


/** Email a 6-digit code so a user on a new device can remove passkeys and get back in. */
export const userRequestPasskeyRecovery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { hasWebAuthn } = await import("./webauthn.server");
    const { assertRateLimit } = await import("./rate-limit.server");
    const { sendMail } = await import("./mail.server");
    const { createHash, randomInt } = await import("node:crypto");
    const sql = await getSql();
    if (!(await hasWebAuthn(sql, context.userId))) {
      throw new Error("No security key is registered on this account.");
    }
    await assertRateLimit(sql, {
      bucket: `passkey-recovery:${context.userId}`,
      limit: 5,
      windowSeconds: 60 * 60,
      message: "Too many recovery emails. Try again later.",
    });
    const profile = await loadProfile(context.userId);
    if (!profile?.email) throw new Error("No email on this account to send a recovery code.");
    const code = String(randomInt(100000, 999999));
    const hash = createHash("sha256").update(`${context.userId}:${code}`).digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await sql`
      insert into admin_webauthn_challenges (user_id, challenge, purpose, expires_at)
      values (${context.userId}, ${hash}, ${"recovery"}, ${expires})
      on conflict (user_id) do update set
        challenge = excluded.challenge,
        purpose = excluded.purpose,
        expires_at = excluded.expires_at
    `;
    const { APP_NAME } = await import("./constants");
    await sendMail({
      to: profile.email,
      subject: `${APP_NAME}: security key recovery code`,
      text: [
        `Hi ${profile.first_name || "there"},`,
        "",
        `Your recovery code is: ${code}`,
        "",
        "It expires in 15 minutes. Use it only if you are removing security keys because you cannot use your usual device.",
        "If you did not request this, change your password and contact support.",
        "",
        `— ${APP_NAME}`,
      ].join("\n"),
    });
    const masked = profile.email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "***" + c);
    return { ok: true as const, emailMasked: masked };
  });

/** Confirm recovery code: delete all passkeys for this user and elevate session. */
export const userConfirmPasskeyRecovery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().min(4).max(12) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createHash } = await import("node:crypto");
    const { markTotpVerified } = await import("./admin-totp.server");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { writeAudit } = await import("./audit.server");
    const sql = await getSql();
    const code = data.code.replace(/\s/g, "");
    const hash = createHash("sha256").update(`${context.userId}:${code}`).digest("hex");
    const rows = await sql<{ challenge: string; expires_at: Date | string; purpose: string }>`
      select challenge, expires_at, purpose from admin_webauthn_challenges
      where user_id = ${context.userId} and purpose = ${"recovery"} limit 1
    `;
    if (!rows.length || rows[0].challenge !== hash) {
      throw new Error("Invalid or expired recovery code.");
    }
    if (new Date(rows[0].expires_at).getTime() < Date.now()) {
      throw new Error("Recovery code expired. Request a new one.");
    }
    await sql`delete from admin_webauthn_challenges where user_id = ${context.userId}`;
    await sql`delete from admin_webauthn_credentials where user_id = ${context.userId}`;
    const session = await getSessionUser();
    if (session?.sessionToken) {
      await markTotpVerified(sql, context.userId, session.sessionToken);
    }
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "user_webauthn_recovery",
      detail: "all passkeys removed via email code",
    });
    return { ok: true as const };
  });
