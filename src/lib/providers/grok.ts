import { grokBaseUrl } from "@/lib/env";
import { grokPrincipalFromToken, refreshGrokToken } from "@/lib/oauth/grok";
import { normalizeToolCallDeltas, toGrokMessages } from "@/lib/tools";
import type { CompletionChunk, OpenAIChatRequest, ProbeResult, SessionSecret } from "@/lib/types";

function oauthSecret(secret: SessionSecret) {
  if (secret.kind !== "oauth") throw new Error("Grok session is missing OAuth tokens");
  return secret;
}

function headers(secret: SessionSecret): HeadersInit {
  const oauth = oauthSecret(secret);
  return {
    Authorization: `Bearer ${oauth.accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "X-XAI-Token-Auth": "xai-grok-cli",
    "x-grok-client-identifier": "grok-shell",
    "x-grok-client-version": process.env.GROK_CLIENT_VERSION ?? "0.2.103",
    "User-Agent": "xai-grok-cli",
  };
}

async function grokFetch(secret: SessionSecret, path: string, init?: RequestInit) {
  const bases = [grokBaseUrl(), "https://api.x.ai/v1"].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  let lastError = "Grok request failed";
  for (const base of bases) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers(secret), ...(init?.headers ?? {}) },
    });
    if (response.ok) return response;
    const text = await response.text().catch(() => "");
    lastError = `Grok request failed (${response.status})${text ? `: ${text.slice(0, 400)}` : ""}`;
    if (response.status !== 402 && response.status !== 426) {
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}

export function buildGrokChatBody(req: OpenAIChatRequest) {
  return {
    model: req.model,
    stream: true,
    messages: toGrokMessages(req.messages),
    ...(req.tools != null ? { tools: req.tools } : {}),
    ...(req.tool_choice != null ? { tool_choice: req.tool_choice } : {}),
  };
}

export function chunkFromGrokEvent(json: {
  choices?: {
    delta?: { content?: string | null; tool_calls?: unknown };
    message?: { content?: string | null; tool_calls?: unknown };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}): CompletionChunk | null {
  const choice = json.choices?.[0];
  const text = choice?.delta?.content ?? (typeof choice?.message?.content === "string" ? choice.message.content : undefined);
  const toolCalls =
    normalizeToolCallDeltas(choice?.delta?.tool_calls) ?? normalizeToolCallDeltas(choice?.message?.tool_calls);
  const finishReason = choice?.finish_reason ?? undefined;
  if (!text && !toolCalls?.length && !finishReason && !json.usage) return null;
  return {
    text: text ?? undefined,
    toolCalls,
    finishReason,
    usage: json.usage,
  };
}

export async function* completeGrok(
  secret: SessionSecret,
  req: OpenAIChatRequest,
): AsyncGenerator<CompletionChunk> {
  const response = await grokFetch(secret, "/chat/completions", {
    method: "POST",
    body: JSON.stringify(buildGrokChatBody(req)),
  });
  if (!response.body) throw new Error("Grok returned an empty body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawFinish = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") {
          if (data === "[DONE]" && !sawFinish) yield { finishReason: "stop" };
          continue;
        }
        try {
          const chunk = chunkFromGrokEvent(JSON.parse(data));
          if (!chunk) continue;
          if (chunk.finishReason) sawFinish = true;
          yield chunk;
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function probeGrok(secret: SessionSecret): Promise<ProbeResult> {
  try {
    const response = await grokFetch(secret, "/models", { method: "GET", headers: { Accept: "application/json" } });
    await response.json().catch(() => null);
    return { health: "healthy" };
  } catch (error) {
    return {
      health: "error",
      error: error instanceof Error ? error.message : "Grok probe failed",
    };
  }
}

export async function refreshGrokSecret(secret: SessionSecret): Promise<{
  secret: SessionSecret;
  expiresAt: Date | null;
}> {
  const oauth = oauthSecret(secret);
  const refreshed = await refreshGrokToken(
    oauth.refreshToken,
    oauth.tokenEndpoint,
    grokPrincipalFromToken(oauth.accessToken),
  );
  return {
    secret: {
      kind: "oauth",
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenEndpoint: refreshed.tokenEndpoint ?? oauth.tokenEndpoint,
    },
    expiresAt: refreshed.expiresAt,
  };
}

export const GROK_MODELS = ["grok-4.6", "grok-4.5", "grok-4", "grok-code"];
