import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scrypt(secret: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(secret, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

async function derive(secret: string, salt: Buffer): Promise<Buffer> {
  return scrypt(secret.normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
}

/**
 * Optional server-only pepper (NEXA_PIN_PEPPER). When set, new hashes use the
 * `s2p:` prefix so a DB leak alone cannot be brute-forced offline. Legacy
 * `s2:` hashes still verify without the pepper so existing accounts keep working.
 */
function pinPepper(): string | undefined {
  // Lazy read so tests can set process.env before first call.
  const v = process.env.NEXA_PIN_PEPPER?.trim();
  return v || undefined;
}

function materialForHash(secret: string, usePepper: boolean): string {
  if (!usePepper) return secret;
  const pepper = pinPepper();
  if (!pepper) return secret;
  return `${pepper}\0${secret}`;
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const peppered = Boolean(pinPepper());
  const key = await derive(materialForHash(secret, peppered), salt);
  const prefix = peppered ? "s2p" : "s2";
  return `${prefix}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  const parts = hash.split(":");
  if (parts.length !== 3) return false;
  const [prefix, saltHex, keyHex] = parts;
  if (prefix !== "s2" && prefix !== "s2p") return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expected.length !== SCRYPT.keylen) return false;
  const usePepper = prefix === "s2p";
  if (usePepper && !pinPepper()) {
    // Peppered hash but pepper not configured — cannot verify.
    return false;
  }
  const actual = await derive(materialForHash(secret, usePepper), salt);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

export function newReference(prefix: string): string {
  const rand = randomBytes(8).toString("hex");
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
