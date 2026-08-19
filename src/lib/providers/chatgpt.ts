import type { CompletionChunk, OpenAIChatRequest, ProbeResult, SessionSecret } from "@/lib/types";
import { refreshChatGptToken } from "@/lib/oauth/chatgpt";
import { expiryFromJwt } from "@/lib/jwt";
import { messageText } from "@/lib/openai-stream";

const BASE_URL = "https://chatgpt.com/backend-api";

function oauthSecret(secret: SessionSecret) {
  if (secret.kind !== "oauth") throw new Error("ChatGPT session is missing OAuth tokens");
  return secret;
}

function authHeaders(secret: SessionSecret) {
  const oauth = oauthSecret(secret);
  if (!oauth.accountId) throw new Error("ChatGPT session is missing account id");
  return {
    Authorization: `Bearer ${oauth.accessToken}`,
    "chatgpt-account-id": oauth.accountId,
    "OpenAI-Beta": "responses=experimental",
    originator: "codex_cli_rs",
    session_id: crypto.randomUUID(),
  };
}

function toInput(req: OpenAIChatRequest) {
  return req.messages.map((message) => ({
    type: "message",
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "user" : "user",
    content: [
      {
        type: message.role === "assistant" ? "output_text" : "input_text",
        text:
          message.role === "system"
            ? `System:\n${messageText(message.content)}`
            : messageText(message.content),
      },
    ],
  }));
}

const MODEL_ALIASES: Record<string, string> = {
  "gpt-5": "gpt-5.6-terra",
  "gpt-5-codex": "gpt-5.6-terra",
  "codex-mini-latest": "gpt-5.6-luna",
  gpt5: "gpt-5.6-terra",
};

function resolveChatGptModel(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}

async function postResponses(secret: SessionSecret, req: OpenAIChatRequest) {
  const body = {
    model: resolveChatGptModel(req.model),
    instructions: "You are a helpful assistant.",
    input: toInput(req),
    store: false,
    stream: true,
    parallel_tool_calls: false,
  };
  const response = await fetch(`${BASE_URL}/codex/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeaders(secret),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ChatGPT request failed (${response.status})${text ? `: ${text.slice(0, 400)}` : ""}`);
  }
  if (!response.body) throw new Error("ChatGPT returned an empty body");
  return response.body;
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
        if (!data || data === "[DONE]") continue;
        try {
          yield JSON.parse(data) as Record<string, unknown>;
        } catch {
          // ignore malformed SSE
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function chunkFromEvent(event: Record<string, unknown>): CompletionChunk | null {
  const type = String(event.type ?? "");
  if (type === "response.output_text.delta" && typeof event.delta === "string") {
    return { text: event.delta };
  }
  if (type === "response.completed") {
    const response = event.response as { usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
    const usage = response?.usage;
    return {
      finishReason: "stop",
      usage: usage
        ? {
            prompt_tokens: usage.input_tokens ?? 0,
            completion_tokens: usage.output_tokens ?? 0,
            total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }
  return null;
}

export async function* completeChatGpt(
  secret: SessionSecret,
  req: OpenAIChatRequest,
): AsyncGenerator<CompletionChunk> {
  const body = await postResponses(secret, req);
  for await (const event of readSse(body)) {
    const chunk = chunkFromEvent(event);
    if (chunk) yield chunk;
  }
}

export async function probeChatGpt(secret: SessionSecret): Promise<ProbeResult> {
  const oauth = oauthSecret(secret);
  try {
    if (!oauth.accountId) throw new Error("ChatGPT session is missing account id");
    const expiresAt = expiryFromJwt(oauth.accessToken);
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new Error("ChatGPT access token expired");
    }
    return {
      health: "healthy",
      identity: oauth.accountId,
    };
  } catch (error) {
    return {
      health: "error",
      error: error instanceof Error ? error.message : "ChatGPT probe failed",
    };
  }
}

export async function refreshChatGptSecret(secret: SessionSecret): Promise<{
  secret: SessionSecret;
  expiresAt: Date | null;
}> {
  const oauth = oauthSecret(secret);
  const refreshed = await refreshChatGptToken(oauth.refreshToken);
  return {
    secret: {
      kind: "oauth",
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accountId: refreshed.accountId ?? oauth.accountId,
    },
    expiresAt: refreshed.expiresAt,
  };
}

export const CHATGPT_MODELS = ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6", "gpt-5.5"];
