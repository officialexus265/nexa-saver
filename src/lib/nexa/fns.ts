import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  ADMIN_EMAIL,
  LOGIN_PREF_LABEL,
  PIN_MAX_ATTEMPTS,
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
  created_at: unknown;
};

function toPublic(row: ProfileRow): PublicProfile {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    username: row.username,
    dateOfBirth: String(row.date_of_birth).slice(0, 10),
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
  const rows = await sql<ProfileRow>`select * from profiles where user_id = ${userId} limit 1`;
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
    const sql = await getSql();
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
    const sql = await getSql();
    const raw = data.identifier.trim();
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
    const sql = await getSql();

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
        user_id, first_name, last_name, email, phone, username, date_of_birth,
        pin_hash, security_question, security_answer_hash, role, login_identifier_pref
      ) values (
        ${context.userId}, ${data.firstName}, ${data.lastName}, ${email}, ${phone},
        ${data.username}, ${data.dateOfBirth}, ${pinHash}, ${data.securityQuestion},
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
    return {
      ok: true,
      needsProfile: false,
      profile: toPublic(fresh),
      pinUnlocked: pinWindowOpen(fresh.pin_verified_at),
      demoPayments: demoPaymentsEnabled(),
    };
  });

export const heartbeat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await touchSession(context.userId);
    return { ok: true as const };
  });

export const verifyPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pin: pinSchema }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret } = await import("./crypto");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");

    const lockedMs = profile.pin_locked_until
      ? profile.pin_locked_until instanceof Date
        ? profile.pin_locked_until.getTime()
        : Date.parse(String(profile.pin_locked_until))
      : 0;
    if (lockedMs && lockedMs > Date.now()) {
      throw new Error("PIN is locked. Try again in a few minutes or reset it with your security question.");
    }

    const ok = await verifySecret(profile.pin_hash, data.pin);
    if (!ok) {
      const attempts = asInt(profile.failed_pin_attempts) + 1;
      if (attempts >= PIN_MAX_ATTEMPTS) {
        await sql`
          update profiles
          set failed_pin_attempts = ${attempts},
              pin_locked_until = now() + interval '5 minutes',
              updated_at = now()
          where user_id = ${context.userId}
        `;
        throw new Error("Too many incorrect PINs. Locked for 5 minutes.");
      }
      await sql`
        update profiles
        set failed_pin_attempts = ${attempts}, updated_at = now()
        where user_id = ${context.userId}
      `;
      throw new Error(`Incorrect PIN. ${PIN_MAX_ATTEMPTS - attempts} attempts left.`);
    }

    await sql`
      update profiles
      set failed_pin_attempts = 0, pin_locked_until = null, pin_verified_at = now(), updated_at = now()
      where user_id = ${context.userId}
    `;
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
    return {
      ok: true,
      locked: false,
      balanceTambala: asInt(w?.balance_tambala),
      lifetimeDepositedTambala: asInt(w?.lifetime_deposited_tambala),
      lifetimeWithdrawnTambala: asInt(w?.lifetime_withdrawn_tambala),
    };
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PublicTx[]> => {
    await requirePinWindow(context.userId);
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
      status: r.status === "success" ? "success" : r.status === "failed" ? "failed" : "pending",
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
    }),
  )
  .handler(async ({ context, data }): Promise<DepositStart> => {
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const amountErr = validateDepositAmount(data.amountKwacha);
    if (amountErr) throw new Error(amountErr);
    const phone = normalizeMwPhone(data.phone);
    if (!phone) throw new Error("Enter a valid Malawi number to deposit from");

    const { getSql } = await import("@/lib/db");
    const { newReference } = await import("./crypto");
    const { paychanguConfigured, demoPaymentsEnabled, initiateHostedCheckout } = await import("./paychangu.server");
    if (!paychanguConfigured() && !demoPaymentsEnabled()) {
      throw new Error("Deposits are not available right now. Please try again later.");
    }
    const sql = await getSql();
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

    if (demoPaymentsEnabled()) {
      return { ok: true, mode: "demo", reference, phone, amountTambala: split.gross };
    }

    const { checkoutUrl } = await initiateHostedCheckout({
      amountKwacha: tambalaToKwacha(split.gross),
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      txRef: reference,
      callbackUrl: `${data.origin}/api/paychangu/webhook`,
      returnUrl: `${data.origin}/deposit/return?ref=${encodeURIComponent(reference)}`,
      description: `NEXA-SAVER deposit of ${formatKwacha(split.gross)}`,
    });
    return { ok: true, mode: "live", checkoutUrl, reference };
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
    const owned = await sql<{ id: number; status: string }>`
      select id, status from transactions where reference = ${data.reference} and user_id = ${context.userId} limit 1
    `;
    if (!owned.length) throw new Error("Deposit not found");
    const { paychanguConfigured, demoPaymentsEnabled, verifyPayment } = await import("./paychangu.server");
    if (!demoPaymentsEnabled()) {
      if (!paychanguConfigured()) throw new Error("Payments are not available right now");
      const result = await verifyPayment(data.reference);
      if (!result.ok) throw new Error("Payment is not confirmed yet");
    }
    const { creditDeposit } = await import("./ledger.server");
    return creditDeposit(data.reference);
  });

export const startWithdraw = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ amountKwacha: z.number().positive(), pin: pinSchema }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret, newReference } = await import("./crypto");
    const { paychanguConfigured, demoPaymentsEnabled, initiateMomoPayout } = await import("./paychangu.server");
    if (!paychanguConfigured() && !demoPaymentsEnabled()) {
      throw new Error("Withdrawals are not available right now. Your balance was not touched.");
    }
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");

    const pinOk = await verifySecret(profile.pin_hash, data.pin);
    if (!pinOk) throw new Error("Incorrect withdrawal PIN");
    await sql`update profiles set pin_verified_at = now(), failed_pin_attempts = 0, pin_locked_until = null where user_id = ${context.userId}`;

    const wallets = await sql<{ balance_tambala: number; payout_reserve_tambala: number }>`
      select balance_tambala, payout_reserve_tambala from wallets where user_id = ${context.userId}
    `;
    const balance = asInt(wallets[0]?.balance_tambala);
    const amountErr = validateWithdrawAmount(data.amountKwacha, balance);
    if (amountErr) throw new Error(amountErr);
    const amount = kwachaToTambala(data.amountKwacha);
    const reserveShare = Math.min(asInt(wallets[0]?.payout_reserve_tambala), Math.round(amount * (0.03 / 0.94)));
    const reference = newReference("WTH");

    const updated = await sql<{ balance_tambala: number }>`
      update wallets
      set balance_tambala = balance_tambala - ${amount},
          lifetime_withdrawn_tambala = lifetime_withdrawn_tambala + ${amount},
          payout_reserve_tambala = greatest(payout_reserve_tambala - ${reserveShare}, 0),
          updated_at = now()
      where user_id = ${context.userId} and balance_tambala >= ${amount}
      returning balance_tambala
    `;
    if (!updated.length) throw new Error("You can only withdraw the amount shown in your account");

    const inserted = await sql<{ id: number }>`
      insert into transactions (
        user_id, kind, status, gross_tambala, credited_tambala,
        platform_profit_tambala, payout_reserve_tambala, phone, reference, note
      ) values (
        ${context.userId}, ${"withdrawal"}, ${"pending"}, ${amount}, ${amount},
        ${0}, ${reserveShare}, ${profile.phone}, ${reference},
        ${`Withdraw ${formatKwacha(amount)} to registered number ${profile.phone}`}
      )
      returning id
    `;
    const txId = inserted[0]?.id;

    try {
      if (paychanguConfigured()) {
        await initiateMomoPayout({
          phone: profile.phone,
          amountKwacha: tambalaToKwacha(amount),
          chargeId: reference,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
        });
      }
      await sql`update transactions set status = ${"success"}, completed_at = now() where id = ${txId}`;
      await sql`
        insert into platform_ledger (transaction_id, entry_type, amount_tambala)
        values
          (${txId}, ${"withdrawal"}, ${amount}),
          (${txId}, ${"payout_fee_used"}, ${reserveShare})
      `;
    } catch (err) {
      await sql`
        update wallets
        set balance_tambala = balance_tambala + ${amount},
            lifetime_withdrawn_tambala = greatest(lifetime_withdrawn_tambala - ${amount}, 0),
            payout_reserve_tambala = payout_reserve_tambala + ${reserveShare},
            updated_at = now()
        where user_id = ${context.userId}
      `;
      await sql`update transactions set status = ${"failed"}, note = ${String((err as Error).message)} where id = ${txId}`;
      throw new Error("Withdrawal could not be sent. Your balance was not taken.");
    }

    return {
      ok: true as const,
      reference,
      amountTambala: amount,
      phone: profile.phone,
      remainingTambala: asInt(updated[0]?.balance_tambala),
    };
  });

export const resetPinWithQuestion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ answer: z.string().min(1), newPin: pinSchema }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret, hashSecret, normalizeAnswer } = await import("./crypto");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const ok = await verifySecret(profile.security_answer_hash, normalizeAnswer(data.answer));
    if (!ok) throw new Error("That answer does not match");
    const pinHash = await hashSecret(data.newPin);
    await sql`
      update profiles
      set pin_hash = ${pinHash},
          failed_pin_attempts = 0,
          pin_locked_until = null,
          pin_verified_at = now(),
          updated_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true as const, question: profile.security_question };
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
    return { ok: true as const };
  });

export const changePinFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ currentPin: pinSchema, newPin: pinSchema }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret, hashSecret } = await import("./crypto");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    const ok = await verifySecret(profile.pin_hash, data.currentPin);
    if (!ok) throw new Error("Current PIN is incorrect");
    const pinHash = await hashSecret(data.newPin);
    await sql`
      update profiles set pin_hash = ${pinHash}, pin_verified_at = now(), failed_pin_attempts = 0, updated_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pin: pinSchema, confirm: z.literal("DELETE") }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { verifySecret } = await import("./crypto");
    const sql = await getSql();
    const profile = await loadProfile(context.userId);
    if (!profile) throw new Error("Complete your profile first");
    if (profile.role === "admin") throw new Error("The platform admin account cannot be deleted");
    const ok = await verifySecret(profile.pin_hash, data.pin);
    if (!ok) throw new Error("Incorrect PIN");
    await sql`delete from profiles where user_id = ${context.userId}`;
    await sql`delete from "session" where "userId" = ${context.userId}`;
    await sql`delete from "account" where "userId" = ${context.userId}`;
    await sql`delete from "user" where "id" = ${context.userId}`;
    return { ok: true as const };
  });

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
        coalesce(sum(case when status = 'pending' then 1 else 0 end), 0)::int as pending
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
      status: r.status === "success" ? "success" : r.status === "failed" ? "failed" : "pending",
      grossTambala: asInt(r.gross_tambala),
      creditedTambala: asInt(r.credited_tambala),
      phone: r.phone,
      reference: r.reference,
      note: r.note,
      createdAt: iso(r.created_at) ?? new Date().toISOString(),
      username: r.username,
    }));
  });
