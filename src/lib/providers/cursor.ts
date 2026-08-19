import { createCursorDecoder, cursorAvailableModels, streamCursorChat } from "@/lib/cursor-wire";
import { refreshCursorToken } from "@/lib/oauth/cursor";
import { messageText } from "@/lib/openai-stream";
import type { CompletionChunk, OpenAIChatRequest, ProbeResult, SessionSecret } from "@/lib/types";

function oauthSecret(secret: SessionSecret) {
  if (secret.kind !== "oauth") throw new Error("Cursor session is missing OAuth tokens");
  return secret;
}

export async function refreshCursorSecret(secret: SessionSecret): Promise<{
  secret: SessionSecret;
  expiresAt: Date | null;
  identity?: string | null;
}> {
  const oauth = oauthSecret(secret);
  const tokens = await refreshCursorToken(oauth.refreshToken);
  return {
    secret: {
      kind: "oauth",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accountId: tokens.identity ?? oauth.accountId,
    },
    expiresAt: tokens.expiresAt,
    identity: tokens.identity ?? oauth.accountId ?? null,
  };
}

export async function probeCursor(secret: SessionSecret): Promise<ProbeResult> {
  try {
    const refreshed = await refreshCursorSecret(secret);
    const models = await cursorAvailableModels(oauthSecret(refreshed.secret).accessToken);
    return {
      health: "healthy",
      identity: refreshed.identity ?? (models.length ? `${models.length} models` : "cursor"),
      expiresAt: refreshed.expiresAt,
    };
  } catch (error) {
    return {
      health: "error",
      error: error instanceof Error ? error.message : "Cursor probe failed",
    };
  }
}

export async function* completeCursor(
  secret: SessionSecret,
  req: OpenAIChatRequest,
): AsyncGenerator<CompletionChunk> {
  const oauth = oauthSecret(secret);
  const stream = await streamCursorChat({
    token: oauth.accessToken,
    model: req.model || "composer-2.5",
    messages: req.messages.map((message) => ({
      role: message.role,
      content: messageText(message.content),
    })),
  });
  const decoder = createCursorDecoder();
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      for (const part of decoder.feed(value)) {
        if (part.error) throw new Error(part.error);
        if (part.text) yield { text: part.text };
      }
    }
  } finally {
    reader.releaseLock();
  }
  yield { finishReason: "stop" };
}

export const CURSOR_MODELS = ["auto", "composer-2.5", "composer-2"];
