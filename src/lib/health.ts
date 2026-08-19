import type { Health } from "./types";

const EXPIRING_WINDOW_MS = 2 * 60 * 60 * 1000;

export function healthFromExpiry(expiresAt: Date | null | undefined, now = new Date()): Health {
  if (!expiresAt) return "unknown";
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) return "expired";
  if (remaining <= EXPIRING_WINDOW_MS) return "expiring";
  return "healthy";
}

export function shouldRefresh(expiresAt: Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() <= EXPIRING_WINDOW_MS;
}

export function expiryFromSeconds(expiresIn: unknown, now = Date.now()): Date | null {
  const seconds = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(now + seconds * 1000);
}
