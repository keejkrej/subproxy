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

  it("flattens multipart message content", () => {
    expect(messageText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
  });
});
