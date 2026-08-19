import { shouldRefresh } from "@/lib/health";
import { expiryFromJwt } from "@/lib/jwt";
import type { CompletionChunk, OpenAIChatRequest, ProbeResult, ProviderId, SessionSecret } from "@/lib/types";
import { completeChatGpt, probeChatGpt, refreshChatGptSecret, CHATGPT_MODELS } from "./chatgpt";
import { completeCursor, probeCursor, refreshCursorSecret, CURSOR_MODELS } from "./cursor";
import { completeGrok, probeGrok, refreshGrokSecret, GROK_MODELS } from "./grok";

export async function complete(
  provider: ProviderId,
  secret: SessionSecret,
  req: OpenAIChatRequest,
): Promise<AsyncGenerator<CompletionChunk>> {
  if (provider === "chatgpt") return completeChatGpt(secret, req);
  if (provider === "grok") return completeGrok(secret, req);
  return completeCursor(secret, req);
}

export async function probe(provider: ProviderId, secret: SessionSecret): Promise<ProbeResult> {
  if (provider === "chatgpt") return probeChatGpt(secret);
  if (provider === "grok") return probeGrok(secret);
  return probeCursor(secret);
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
  if (!shouldRefresh(effectiveExpiry)) {
    return { secret, expiresAt: effectiveExpiry, refreshed: false };
  }
  if (provider === "chatgpt") {
    const next = await refreshChatGptSecret(secret);
    return { ...next, refreshed: true };
  }
  if (provider === "grok") {
    const next = await refreshGrokSecret(secret);
    return { ...next, refreshed: true };
  }
  if (provider === "cursor") {
    const next = await refreshCursorSecret(secret);
    return { ...next, refreshed: false };
  }
  return { secret, expiresAt: effectiveExpiry, refreshed: false };
}

export function catalogFor(provider: ProviderId): string[] {
  if (provider === "chatgpt") return CHATGPT_MODELS.map((model) => `chatgpt/${model}`);
  if (provider === "grok") return GROK_MODELS.map((model) => `grok/${model}`);
  return CURSOR_MODELS.map((model) => `cursor/${model}`);
}
