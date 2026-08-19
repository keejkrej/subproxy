export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function expiryFromJwt(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
  return new Date(payload.exp * 1000);
}

export function chatgptAccountIdFromToken(accessToken: string): string | undefined {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return undefined;
  const auth = payload["https://api.openai.com/auth"];
  if (auth && typeof auth === "object") {
    const account = (auth as Record<string, unknown>).chatgpt_account_id;
    if (typeof account === "string" && account) return account;
  }
  for (const key of ["chatgpt_account_id", "account_id", "https://api.openai.com/profile.chatgpt_account_id"]) {
    const value = payload[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}
