import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Token hashing for single-use setup codes.
 *
 * A setup token grants ownership of an organization, so it is stored as a
 * scrypt digest. Even full read access to the database does not then yield a
 * code that can be replayed, and the comparison is constant-time.
 */

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export function generateSetupToken(): string {
  // 24 bytes of entropy, grouped for legibility when read aloud or copied.
  return randomBytes(24).toString("base64url").replace(/[-_]/g, (c) => (c === "-" ? "A" : "B"));
}

export function hashToken(token: string, salt = randomBytes(SALT_LENGTH)): string {
  const digest = scryptSync(normalise(token), salt, KEY_LENGTH);
  return `${salt.toString("base64url")}.${digest.toString("base64url")}`;
}

export function verifyToken(token: string, stored: string): boolean {
  const [saltPart, digestPart] = stored.split(".");
  if (!saltPart || !digestPart) return false;
  try {
    const expected = Buffer.from(digestPart, "base64url");
    const actual = scryptSync(normalise(token), Buffer.from(saltPart, "base64url"), KEY_LENGTH);
    // Length check first: timingSafeEqual throws on a mismatch.
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Codes are grouped for copying but compared without it, so a mistyped space
 * does not lock somebody out of their own organization.
 */
function normalise(token: string): string {
  return token.replace(/[\s-]/g, "").trim();
}
