import { cursorIdentityFromToken, expiryFromJwt } from "@/lib/jwt";

const API_BASE = (process.env.CURSOR_API_BASE_URL ?? "https://api2.cursor.sh").replace(/\/$/, "");
const WEBSITE = (process.env.CURSOR_WEBSITE_URL ?? "https://cursor.com").replace(/\/$/, "");

export type CursorPkceStart = {
  uuid: string;
  verifier: string;
  challenge: string;
  verificationUrl: string;
  expiresAt: string;
};

export type CursorTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  identity: string | null;
};

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function cursorLoginUrl(challenge: string, uuid: string, website = WEBSITE): string {
  return `${website}/loginDeepControl?challenge=${encodeURIComponent(challenge)}&uuid=${encodeURIComponent(uuid)}&mode=login&redirectTarget=cli`;
}

export async function startCursorPkceAuth(): Promise<CursorPkceStart> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64url(verifierBytes);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const uuid = crypto.randomUUID();
  return {
    uuid,
    verifier,
    challenge,
    verificationUrl: cursorLoginUrl(challenge, uuid),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

export async function pollCursorPkceAuth(input: {
  uuid: string;
  verifier: string;
}): Promise<CursorTokens | "pending"> {
  const response = await fetch(
    `${API_BASE}/auth/poll?uuid=${encodeURIComponent(input.uuid)}&verifier=${encodeURIComponent(input.verifier)}`,
  );
  if (response.status === 404) return "pending";
  if (!response.ok) {
    throw new Error(`Cursor poll failed (${response.status})`);
  }
  const body = (await response.json()) as { accessToken?: string; refreshToken?: string };
  if (!body.accessToken || !body.refreshToken) return "pending";
  return tokensFromPair(body.accessToken, body.refreshToken);
}

export async function refreshCursorToken(refreshToken: string): Promise<CursorTokens> {
  const response = await fetch(`${API_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    throw new Error(`Cursor refresh failed (${response.status})`);
  }
  const body = (await response.json()) as { accessToken?: string; refreshToken?: string };
  if (!body.accessToken || !body.refreshToken) {
    throw new Error("Cursor refresh response missing tokens");
  }
  return tokensFromPair(body.accessToken, body.refreshToken);
}

function tokensFromPair(accessToken: string, refreshToken: string): CursorTokens {
  return {
    accessToken,
    refreshToken,
    expiresAt: expiryFromJwt(accessToken),
    identity: cursorIdentityFromToken(accessToken) ?? null,
  };
}
