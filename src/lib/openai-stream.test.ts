import { describe, expect, it } from "vitest";
import { encodeOpenAIChunk, encodeOpenAIDone, encodeOpenAIError, messageText, openAIResponse } from "./openai-stream";

describe("openai translation", () => {
  it("encodes a text delta as an OpenAI SSE chunk", () => {
    const chunk = encodeOpenAIChunk({
      id: "chatcmpl_test",
      model: "gpt-5",
      created: 1,
      chunk: { text: "Hi" },
    });
    expect(chunk.startsWith("data: ")).toBe(true);
    expect(chunk).toContain('"content":"Hi"');
    expect(encodeOpenAIDone()).toBe("data: [DONE]\n\n");
    expect(encodeOpenAIError("upstream failed (500)")).toContain('"message":"upstream failed (500)"');
  });

  it("builds a non-stream completion", () => {
    const body = openAIResponse({
      id: "chatcmpl_test",
      model: "grok-4",
      created: 1,
      text: "ok",
    });
    expect(body.choices[0]?.message.content).toBe("ok");
  });

  it("encodes streamed tool_calls and a non-stream tool completion", () => {
    const chunk = encodeOpenAIChunk({
      id: "chatcmpl_test",
      model: "chatgpt/gpt-5.6-terra",
      created: 1,
      chunk: {
        toolCalls: [
          {
            index: 0,
            id: "call_term_1",
            type: "function",
            function: { name: "terminal", arguments: '{"action":"exec"}' },
          },
        ],
      },
    });
    expect(chunk).toContain('"delta":{"tool_calls":[');
    expect(chunk).toContain('"finish_reason":null');

    const done = encodeOpenAIChunk({
      id: "chatcmpl_test",
      model: "chatgpt/gpt-5.6-terra",
      created: 1,
      chunk: { finishReason: "tool_calls" },
    });
    expect(done).toContain('"finish_reason":"tool_calls"');

    const body = openAIResponse({
      id: "chatcmpl_test",
      model: "chatgpt/gpt-5.6-terra",
      created: 1,
      text: "",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_term_1",
          type: "function",
          function: { name: "terminal", arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}' },
        },
      ],
    });
    expect(body.choices[0]?.finish_reason).toBe("tool_calls");
    expect(body.choices[0]?.message.content).toBeNull();
    expect(body.choices[0]?.message.tool_calls?.[0]?.function.name).toBe("terminal");
  });

  it("flattens multipart message content", () => {
    expect(messageText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
  });
});
