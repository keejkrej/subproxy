import { GROK_REFRESH_WINDOW_MS, shouldRefresh } from "@/lib/health";
import { expiryFromJwt } from "@/lib/jwt";
import type { CompletionChunk, OpenAIChatRequest, ProbeResult, ProviderId, SessionSecret } from "@/lib/types";
import { completeChatGpt, probeChatGpt, refreshChatGptSecret, CHATGPT_MODELS } from "./chatgpt";
import { completeGrok, probeGrok, refreshGrokSecret, GROK_MODELS } from "./grok";

export async function complete(
  provider: ProviderId,
  secret: SessionSecret,
  req: OpenAIChatRequest,
): Promise<AsyncGenerator<CompletionChunk>> {
  if (provider === "chatgpt") return completeChatGpt(secret, req);
  return completeGrok(secret, req);
}

export async function probe(provider: ProviderId, secret: SessionSecret): Promise<ProbeResult> {
  if (provider === "chatgpt") return probeChatGpt(secret);
  return probeGrok(secret);
}

export async function refreshIfNeeded(
  provider: ProviderId,
  secret: SessionSecret,
  expiresAt: Date | null,
): Promise<{ secret: SessionSecret; expiresAt: Date | null; refreshed: boolean }> {
  if (secret.kind !== "oauth") {
    return { secret, expiresAt, refreshed: false };
  }
  const effectiveExpiry = expiresAt ?? expiryFromJwt(secret.accessToken);
  const windowMs = provider === "supergrok" ? GROK_REFRESH_WINDOW_MS : undefined;
  if (!shouldRefresh(effectiveExpiry, new Date(), windowMs)) {
    return { secret, expiresAt: effectiveExpiry, refreshed: false };
  }
  if (provider === "chatgpt") {
    const next = await refreshChatGptSecret(secret);
    return { ...next, refreshed: true };
  }
  const next = await refreshGrokSecret(secret);
  return { ...next, refreshed: true };
}

export function catalogFor(provider: ProviderId): string[] {
  if (provider === "chatgpt") return CHATGPT_MODELS.map((model) => `chatgpt/${model}`);
  return GROK_MODELS.map((model) => `supergrok/${model}`);
}
