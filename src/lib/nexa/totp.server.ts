/**
 * TOTP (RFC 6238) + backup codes for admin 2FA — no extra npm dependency.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
  scrypt as scryptCb,
} from "node:crypto";
import { promisify } from "node:util";
import { env } from "@/lib/env.server";

const scrypt = promisify(scryptCb);

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  return base32Encode(buf);
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const cleaned = str.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of cleaned) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const str = String(code % 10 ** digits);
  return str.padStart(digits, "0");
}

export function generateTotpCode(secretBase32: string, atMs = Date.now(), step = 30): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / step);
  return hotp(secret, counter);
}

export function verifyTotpCode(
  secretBase32: string,
  token: string,
  window = 1,
  step = 30,
): boolean {
  const cleaned = String(token).replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, counter + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function otpauthUri(secretBase32: string, accountName: string, issuer = "NEXA-SAVER Admin"): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Encrypt secret at rest using key derived from BETTER_AUTH_SECRET. */
export async function sealSecret(plainBase32: string): Promise<string> {
  const key = await deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plainBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export async function openSecret(sealed: string): Promise<string> {
  const parts = sealed.split(":");
  if (parts[0] !== "v1" || parts.length !== 4) {
    // Legacy / plain base32 during migration
    if (/^[A-Z2-7]+$/i.test(sealed)) return sealed.toUpperCase();
    throw new Error("Invalid TOTP secret storage format");
  }
  const key = await deriveKey();
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const data = Buffer.from(parts[3]!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

async function deriveKey(): Promise<Buffer> {
  const secret = env("BETTER_AUTH_SECRET") || "nexa-dev-totp-key-not-for-prod";
  return (await scrypt(secret, "nexa-admin-totp-v1", 32)) as Buffer;
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex").slice(0, 10).toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  const salt = randomBytes(16);
  const hash = (await scrypt(normalized, salt, 32)) as Buffer;
  return `b1:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export async function verifyBackupCode(code: string, storedHash: string): Promise<boolean> {
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  const parts = storedHash.split(":");
  if (parts[0] !== "b1" || parts.length !== 3) return false;
  const salt = Buffer.from(parts[1]!, "base64url");
  const expected = Buffer.from(parts[2]!, "base64url");
  const hash = (await scrypt(normalized, salt, 32)) as Buffer;
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export function qrImageUrl(otpauth: string): string {
  // Client can render otpauth with any QR lib; provide a simple chart API fallback URL for admin.
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
}
