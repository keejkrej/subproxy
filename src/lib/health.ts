import type { Health } from "./types";

export const EXPIRING_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Grok access tokens last ~6h and rotate the refresh token on every grant. */
export const GROK_REFRESH_WINDOW_MS = 10 * 60 * 1000;

export function healthFromExpiry(expiresAt: Date | null | undefined, now = new Date()): Health {
  if (!expiresAt) return "unknown";
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) return "expired";
  if (remaining <= EXPIRING_WINDOW_MS) return "expiring";
  return "healthy";
}

export function shouldRefresh(
  expiresAt: Date | null | undefined,
  now = new Date(),
  windowMs = EXPIRING_WINDOW_MS,
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() <= windowMs;
}

export function expiryFromSeconds(expiresIn: unknown, now = Date.now()): Date | null {
  const seconds = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(now + seconds * 1000);
}
