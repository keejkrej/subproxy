import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ISSUED_KEY_PREFIX = "sk-sub-";

export function hashIssuedKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateIssuedKey(): { secret: string; hash: string; prefix: string } {
  const secret = `${ISSUED_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return {
    secret,
    hash: hashIssuedKey(secret),
    prefix: secret.slice(0, 14),
  };
}

export function issuedKeysEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
