import { afterEach, describe, expect, it, vi } from "vitest";
import { completeChatGpt } from "./chatgpt";
import { completeGrok } from "./grok";
import type { OpenAIChatRequest } from "@/lib/types";

const TERMINAL_REQUEST: OpenAIChatRequest = {
  model: "gpt-5.6-terra",
  stream: false,
  tool_choice: "auto",
  messages: [
    { role: "system", content: "You must use the terminal function. Never invent command output." },
    { role: "user", content: "Use terminal to run: echo UNIQUE_TOKEN_42" },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "terminal",
        description: "Execute a shell command in the user workspace.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["exec"] },
            command: { type: "string" },
          },
          required: ["action", "command"],
        },
      },
    },
  ],
};

function sseResponse(lines: string[]) {
  return new Response(lines.join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider tool forwarding", () => {
  it("POSTs Responses tools for ChatGPT and yields an OpenAI terminal tool call", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toContain("/codex/responses");
      const body = JSON.parse(String(init?.body));
      expect(body.tools[0].name).toBe("terminal");
      expect(body.tool_choice).toBe("auto");
      expect(body.input.some((item: { type?: string }) => item.type === "message")).toBe(true);
      return sseResponse([
        'data: {"type":"response.output_item.added","item":{"id":"fc_1","type":"function_call","call_id":"call_term_1","name":"terminal","arguments":""}}\n\n',
        'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\\"action\\":\\"exec\\",\\"command\\":\\"echo UNIQUE_TOKEN_42\\"}"}\n\n',
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const chunks = [];
    for await (const chunk of completeChatGpt(
      { kind: "oauth", accessToken: "tok", refreshToken: "rt", accountId: "acct" },
      TERMINAL_REQUEST,
    )) {
      chunks.push(chunk);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(chunks.some((chunk) => chunk.toolCalls?.[0]?.function?.name === "terminal")).toBe(true);
    expect(chunks.some((chunk) => chunk.finishReason === "tool_calls")).toBe(true);
    expect(chunks.some((chunk) => chunk.text?.includes("UNIQUE_TOKEN_42"))).toBe(false);
  });

  it("POSTs Chat Completions tools for Grok and relays delta.tool_calls", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toContain("/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.tools[0].function.name).toBe("terminal");
      expect(body.tool_choice).toBe("auto");
      expect(body.messages[1].content).toContain("UNIQUE_TOKEN_42");
      return sseResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_term_1","type":"function","function":{"name":"terminal","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"action\\":\\"exec\\",\\"command\\":\\"echo UNIQUE_TOKEN_42\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const chunks = [];
    for await (const chunk of completeGrok(
      { kind: "oauth", accessToken: "tok", refreshToken: "rt" },
      { ...TERMINAL_REQUEST, model: "grok-4.6" },
    )) {
      chunks.push(chunk);
    }
    expect(chunks.at(-1)?.finishReason).toBe("tool_calls");
    expect(chunks.some((chunk) => chunk.toolCalls?.[0]?.id === "call_term_1")).toBe(true);
  });
});
