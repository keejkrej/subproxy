import { messageText } from "./openai-stream";
import type { CompletionChunk, OpenAIChatMessage, OpenAIToolCall, OpenAIToolCallDelta } from "./types";

export function stringifyToolArguments(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function asToolCalls(value: unknown): OpenAIToolCall[] {
  if (!Array.isArray(value)) return [];
  const out: OpenAIToolCall[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const fn =
      rec.function && typeof rec.function === "object"
        ? (rec.function as Record<string, unknown>)
        : rec;
    const name = typeof fn.name === "string" ? fn.name : typeof rec.name === "string" ? rec.name : "";
    if (!name) continue;
    const id =
      typeof rec.id === "string" && rec.id
        ? rec.id
        : typeof rec.call_id === "string" && rec.call_id
          ? rec.call_id
          : `call_${out.length}`;
    out.push({
      id,
      type: "function",
      function: {
        name,
        arguments: stringifyToolArguments(fn.arguments ?? rec.arguments),
      },
    });
  }
  return out;
}

export function normalizeToolCallDeltas(value: unknown): OpenAIToolCallDelta[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.map((raw, index) => {
    const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const fn =
      rec.function && typeof rec.function === "object" ? (rec.function as Record<string, unknown>) : {};
    const delta: OpenAIToolCallDelta = {
      index: typeof rec.index === "number" ? rec.index : index,
      type: "function",
    };
    if (typeof rec.id === "string" && rec.id) delta.id = rec.id;
    else if (typeof rec.call_id === "string" && rec.call_id) delta.id = rec.call_id;
    const name = typeof fn.name === "string" ? fn.name : typeof rec.name === "string" ? rec.name : undefined;
    const args = fn.arguments ?? rec.arguments;
    if (name || args != null) {
      delta.function = {
        ...(name ? { name } : {}),
        ...(args != null ? { arguments: stringifyToolArguments(args) } : {}),
      };
    }
    return delta;
  });
}

export function toResponsesTools(tools: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool) => {
    if (!tool || typeof tool !== "object") return { type: "function", name: "unknown", parameters: { type: "object", properties: {} } };
    const rec = tool as Record<string, unknown>;
    const fn = rec.function && typeof rec.function === "object" ? (rec.function as Record<string, unknown>) : null;
    if (fn && typeof fn.name === "string") {
      return {
        type: "function",
        name: fn.name,
        ...(typeof fn.description === "string" ? { description: fn.description } : {}),
        parameters: fn.parameters ?? { type: "object", properties: {} },
      };
    }
    if (typeof rec.name === "string") {
      return {
        type: rec.type ?? "function",
        name: rec.name,
        ...(typeof rec.description === "string" ? { description: rec.description } : {}),
        ...(rec.parameters != null ? { parameters: rec.parameters } : {}),
      };
    }
    return rec;
  });
}

export function toResponsesToolChoice(choice: unknown): unknown {
  if (choice == null) return undefined;
  if (typeof choice === "string") return choice;
  if (typeof choice === "object") {
    const rec = choice as Record<string, unknown>;
    const fn = rec.function && typeof rec.function === "object" ? (rec.function as Record<string, unknown>) : null;
    if (rec.type === "function" && fn && typeof fn.name === "string") {
      return { type: "function", name: fn.name };
    }
  }
  return choice;
}

export function toResponsesInput(messages: OpenAIChatMessage[]): {
  instructions: string;
  input: Record<string, unknown>[];
} {
  const instructions: string[] = [];
  const input: Record<string, unknown>[] = [];

  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      const text = messageText(message.content);
      if (text) instructions.push(text);
      continue;
    }

    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id ?? "",
        output: messageText(message.content),
      });
      continue;
    }

    if (message.role === "assistant") {
      const text = messageText(message.content);
      if (text) {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        });
      }
      for (const call of asToolCalls(message.tool_calls)) {
        input.push({
          type: "function_call",
          id: call.id,
          call_id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
      continue;
    }

    input.push({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: messageText(message.content) }],
    });
  }

  return {
    instructions: instructions.length ? instructions.join("\n\n") : "You are a helpful assistant.",
    input,
  };
}

export function toGrokMessages(messages: OpenAIChatMessage[]): Record<string, unknown>[] {
  return messages.map((message) => {
    const content = messageText(message.content);
    const out: Record<string, unknown> = { role: message.role };
    if (message.name) out.name = message.name;
    if (message.role === "tool") {
      out.content = content;
      if (message.tool_call_id) out.tool_call_id = message.tool_call_id;
      return out;
    }
    const calls = asToolCalls(message.tool_calls);
    if (calls.length) {
      out.content = content || null;
      out.tool_calls = calls;
      return out;
    }
    out.content = content;
    return out;
  });
}

export function mergeToolCallDeltas(target: OpenAIToolCall[], deltas: OpenAIToolCallDelta[]): OpenAIToolCall[] {
  for (const delta of deltas) {
    const index = typeof delta.index === "number" ? delta.index : target.length;
    const current = target[index] ?? {
      id: "",
      type: "function" as const,
      function: { name: "", arguments: "" },
    };
    if (delta.id) current.id = delta.id;
    if (delta.function?.name) current.function.name = delta.function.name;
    if (typeof delta.function?.arguments === "string") {
      current.function.arguments += delta.function.arguments;
    }
    target[index] = current;
  }
  return target;
}

export function finishReasonFor(chunkFinish: string | null | undefined, toolCalls: OpenAIToolCall[]): string {
  if (toolCalls.length && (!chunkFinish || chunkFinish === "stop")) return "tool_calls";
  return chunkFinish ?? "stop";
}

export function aggregateChunks(chunks: CompletionChunk[]): {
  text: string;
  toolCalls: OpenAIToolCall[];
  finishReason: string;
  usage: CompletionChunk["usage"];
} {
  let text = "";
  let usage: CompletionChunk["usage"];
  let finishReason: string | undefined;
  const toolCalls: OpenAIToolCall[] = [];
  for (const chunk of chunks) {
    if (chunk.text) text += chunk.text;
    if (chunk.usage) usage = chunk.usage;
    if (chunk.finishReason) finishReason = chunk.finishReason;
    if (chunk.toolCalls?.length) mergeToolCallDeltas(toolCalls, chunk.toolCalls);
  }
  return {
    text,
    toolCalls,
    finishReason: finishReasonFor(finishReason, toolCalls),
    usage,
  };
}
