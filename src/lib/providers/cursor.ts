import { createCursorDecoder, cursorAvailableModels, streamCursorChat } from "@/lib/cursor-wire";
import { cursorIdentityFromToken, expiryFromJwt } from "@/lib/jwt";
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
  const expiresAt = expiryFromJwt(oauth.accessToken);
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new Error("Cursor session token expired; reconnect Cursor");
  }
  return {
    secret,
    expiresAt,
    identity: cursorIdentityFromToken(oauth.accessToken) ?? oauth.accountId ?? null,
  };
}

export async function probeCursor(secret: SessionSecret): Promise<ProbeResult> {
  const oauth = oauthSecret(secret);
  try {
    const models = await cursorAvailableModels(oauth.accessToken);
    return {
      health: "healthy",
      identity:
        cursorIdentityFromToken(oauth.accessToken) ??
        oauth.accountId ??
        (models.length ? `${models.length} models` : "cursor"),
      expiresAt: expiryFromJwt(oauth.accessToken),
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
