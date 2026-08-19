import type { CompletionChunk, OpenAIToolCall } from "./types";

export function completionId(): string {
  return `chatcmpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function encodeOpenAIChunk(input: {
  id: string;
  model: string;
  created: number;
  chunk: CompletionChunk;
}): string {
  const delta: Record<string, unknown> = {};
  if (input.chunk.text) delta.content = input.chunk.text;
  if (input.chunk.toolCalls?.length) delta.tool_calls = input.chunk.toolCalls;

  const body = {
    id: input.id,
    object: "chat.completion.chunk",
    created: input.created,
    model: input.model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: input.chunk.finishReason ?? null,
      },
    ],
    ...(input.chunk.usage ? { usage: input.chunk.usage } : {}),
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

export function encodeOpenAIDone(): string {
  return "data: [DONE]\n\n";
}

export function encodeOpenAIError(message: string): string {
  return `data: ${JSON.stringify({ error: { message, type: "api_error" } })}\n\n`;
}

export function openAIResponse(input: {
  id: string;
  model: string;
  created: number;
  text: string;
  usage?: CompletionChunk["usage"];
  finishReason?: string;
  toolCalls?: OpenAIToolCall[];
}) {
  const hasTools = Boolean(input.toolCalls?.length);
  return {
    id: input.id,
    object: "chat.completion",
    created: input.created,
    model: input.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: hasTools ? input.text || null : input.text,
          ...(hasTools ? { tool_calls: input.toolCalls } : {}),
        },
        finish_reason: input.finishReason ?? (hasTools ? "tool_calls" : "stop"),
      },
    ],
    usage: input.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        if (part && typeof part === "object" && "content" in part) {
          return String((part as { content?: unknown }).content ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text?: unknown }).text ?? "");
  }
  return content == null ? "" : JSON.stringify(content);
}
