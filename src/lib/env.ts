function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export function vaultKey(): string {
  return required("VAULT_KEY");
}

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET;
}

export function clerkAllowedEmails(): string[] {
  return (process.env.CLERK_ALLOWED_EMAIL ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function appUrl(): string {
  return (
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000")
  );
}

export function grokBaseUrl(): string {
  return (
    process.env.GROK_BASE_URL ?? "https://cli-chat-proxy.grok.com/v1"
  ).replace(/\/$/, "");
}


