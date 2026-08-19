import type { CompletionChunk, OpenAIChatRequest, ProbeResult, SessionSecret } from "@/lib/types";
import { refreshChatGptToken } from "@/lib/oauth/chatgpt";
import { expiryFromJwt } from "@/lib/jwt";
import { toResponsesInput, toResponsesToolChoice, toResponsesTools } from "@/lib/tools";

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

const MODEL_ALIASES: Record<string, string> = {
  "gpt-5": "gpt-5.6-terra",
  "gpt-5-codex": "gpt-5.6-terra",
  "codex-mini-latest": "gpt-5.6-luna",
  gpt5: "gpt-5.6-terra",
};

function resolveChatGptModel(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}

export function buildChatGptResponsesBody(req: OpenAIChatRequest) {
  const { instructions, input } = toResponsesInput(req.messages);
  const tools = toResponsesTools(req.tools);
  const toolChoice = toResponsesToolChoice(req.tool_choice);
  return {
    model: resolveChatGptModel(req.model),
    instructions,
    input,
    store: false,
    stream: true,
    parallel_tool_calls: false,
    ...(tools ? { tools } : {}),
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
  };
}

async function postResponses(secret: SessionSecret, req: OpenAIChatRequest) {
  const response = await fetch(`${BASE_URL}/codex/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeaders(secret),
    },
    body: JSON.stringify(buildChatGptResponsesBody(req)),
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

type ToolCallState = {
  index: number;
  id: string;
  name: string;
  arguments: string;
  started: boolean;
};

function toolCallKey(event: Record<string, unknown>): string {
  if (typeof event.item_id === "string" && event.item_id) return event.item_id;
  const item = event.item && typeof event.item === "object" ? (event.item as Record<string, unknown>) : null;
  if (item && typeof item.id === "string" && item.id) return item.id;
  if (item && typeof item.call_id === "string" && item.call_id) return item.call_id;
  if (typeof event.call_id === "string" && event.call_id) return event.call_id;
  if (typeof event.output_index === "number") return `output-${event.output_index}`;
  return "";
}

function usageFromResponse(response: { usage?: { input_tokens?: number; output_tokens?: number } } | undefined) {
  const usage = response?.usage;
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.input_tokens ?? 0,
    completion_tokens: usage.output_tokens ?? 0,
    total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
  };
}

export function createChatGptChunkParser() {
  const byKey = new Map<string, ToolCallState>();
  let nextIndex = 0;
  let sawToolCall = false;

  function getOrCreate(key: string, item?: Record<string, unknown>): ToolCallState {
    let state = byKey.get(key);
    if (!state) {
      state = {
        index: nextIndex++,
        id:
          (typeof item?.call_id === "string" && item.call_id) ||
          (typeof item?.id === "string" && item.id) ||
          key,
        name: typeof item?.name === "string" ? item.name : "",
        arguments: "",
        started: false,
      };
      byKey.set(key, state);
    } else {
      if (typeof item?.call_id === "string" && item.call_id) state.id = item.call_id;
      if (typeof item?.name === "string" && item.name) state.name = item.name;
    }
    return state;
  }

  return function chunkFromEvent(event: Record<string, unknown>): CompletionChunk | null {
    const type = String(event.type ?? "");
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
      return { text: event.delta };
    }

    if (type === "response.output_item.added") {
      const item = event.item && typeof event.item === "object" ? (event.item as Record<string, unknown>) : null;
      if (item?.type !== "function_call") return null;
      const key = toolCallKey(event);
      if (!key) return null;
      const state = getOrCreate(key, item);
      sawToolCall = true;
      state.started = true;
      const args = typeof item.arguments === "string" ? item.arguments : "";
      if (args) state.arguments = args;
      return {
        toolCalls: [
          {
            index: state.index,
            id: state.id,
            type: "function",
            function: { name: state.name, arguments: args },
          },
        ],
      };
    }

    if (type === "response.function_call_arguments.delta" && typeof event.delta === "string") {
      const key = toolCallKey(event);
      if (!key) return null;
      const state = getOrCreate(key);
      sawToolCall = true;
      state.arguments += event.delta;
      const toolCall: NonNullable<CompletionChunk["toolCalls"]>[number] = {
        index: state.index,
        function: { arguments: event.delta },
      };
      if (!state.started) {
        toolCall.id = state.id;
        toolCall.type = "function";
        if (state.name) toolCall.function = { name: state.name, arguments: event.delta };
        state.started = true;
      }
      return { toolCalls: [toolCall] };
    }

    if (type === "response.output_item.done") {
      const item = event.item && typeof event.item === "object" ? (event.item as Record<string, unknown>) : null;
      if (item?.type !== "function_call") return null;
      const key = toolCallKey(event);
      if (!key) return null;
      const state = getOrCreate(key, item);
      sawToolCall = true;
      const args = typeof item.arguments === "string" ? item.arguments : "";
      if (!state.started || !state.arguments) {
        if (args && !state.arguments) state.arguments = args;
        state.started = true;
        return {
          toolCalls: [
            {
              index: state.index,
              id: state.id,
              type: "function",
              function: { name: state.name, arguments: state.arguments || args },
            },
          ],
        };
      }
      return null;
    }

    if (type === "response.completed") {
      const response = event.response as
        | {
            usage?: { input_tokens?: number; output_tokens?: number };
            output?: Record<string, unknown>[];
          }
        | undefined;
      const missed: NonNullable<CompletionChunk["toolCalls"]> = [];
      for (const item of response?.output ?? []) {
        if (item?.type !== "function_call") continue;
        const key =
          (typeof item.id === "string" && item.id) ||
          (typeof item.call_id === "string" && item.call_id) ||
          "";
        const existing = key ? byKey.get(key) : undefined;
        if (existing?.started && existing.arguments) continue;
        const state = getOrCreate(key || `harvest-${nextIndex}`, item);
        sawToolCall = true;
        state.started = true;
        const args = typeof item.arguments === "string" ? item.arguments : state.arguments;
        if (args && !state.arguments) state.arguments = args;
        missed.push({
          index: state.index,
          id: state.id,
          type: "function",
          function: { name: state.name, arguments: args },
        });
      }
      return {
        ...(missed.length ? { toolCalls: missed } : {}),
        finishReason: sawToolCall || missed.length ? "tool_calls" : "stop",
        usage: usageFromResponse(response),
      };
    }

    return null;
  };
}

export async function* completeChatGpt(
  secret: SessionSecret,
  req: OpenAIChatRequest,
): AsyncGenerator<CompletionChunk> {
  const body = await postResponses(secret, req);
  const chunkFromEvent = createChatGptChunkParser();
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
