import { inferProvider } from "@/lib/routing";
import { PROVIDERS, type ProviderId } from "@/lib/types";

export type CatalogEntry = {
  name: string;
  provider: ProviderId;
};

export const DEFAULT_MODELS: CatalogEntry[] = [
  { name: "chatgpt/gpt-5.6-terra", provider: "chatgpt" },
  { name: "chatgpt/gpt-5.6-luna", provider: "chatgpt" },
  { name: "chatgpt/gpt-5.6-sol", provider: "chatgpt" },
  { name: "chatgpt/gpt-5.6", provider: "chatgpt" },
  { name: "chatgpt/gpt-5.5", provider: "chatgpt" },
  { name: "grok/grok-4.6", provider: "grok" },
  { name: "grok/grok-4.5", provider: "grok" },
  { name: "grok/grok-4", provider: "grok" },
  { name: "grok/grok-code", provider: "grok" },
];

export function parseProvider(value: unknown): ProviderId | null {
  return PROVIDERS.find((provider) => provider === value) ?? null;
}

export function parseModelName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name ? name : null;
}

export const CATALOG_NAME_HINT = "Name must start with chatgpt/ or grok/, like chatgpt/gpt-5.6-terra";

/** Catalog names encode the provider: `chatgpt/...` or `grok/...`. */
export function parseCatalogModel(value: unknown): { name: string; provider: ProviderId } | null {
  const name = parseModelName(value);
  if (!name) return null;
  const match = name.match(/^(chatgpt|grok)\/(.+)$/i);
  if (!match) return null;
  const rest = match[2].trim();
  if (!rest) return null;
  const provider = match[1].toLowerCase() as ProviderId;
  if (!parseProvider(provider)) return null;
  return { name: `${provider}/${rest}`, provider };
}

export function upstreamModel(name: string, provider: ProviderId): string {
  const prefix = `${provider}/`;
  return name.toLowerCase().startsWith(prefix) ? name.slice(prefix.length) : name;
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const message = `${rec.message ?? ""} ${rec.cause?.message ?? ""}`;
  return rec.code === "23505" || rec.cause?.code === "23505" || /duplicate key|unique/i.test(message);
}

export function resolveModelRoute(
  requested: string,
  catalog: CatalogEntry[],
): { provider: ProviderId; model: string } {
  const exact = catalog.find((row) => row.name === requested);
  if (exact) {
    return { provider: exact.provider, model: upstreamModel(exact.name, exact.provider) };
  }
  const prefixed = requested.match(/^(chatgpt|grok)\/(.+)$/);
  if (prefixed) {
    return { provider: prefixed[1] as ProviderId, model: prefixed[2] };
  }
  return { provider: inferProvider(requested), model: requested };
}
