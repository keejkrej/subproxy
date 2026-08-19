import { describe, expect, it } from "vitest";
import { encodeOpenAIChunk, openAIResponse } from "./openai-stream";
import { createChatGptChunkParser } from "./providers/chatgpt";
import { chunkFromGrokEvent } from "./providers/grok";
import { buildChatGptResponsesBody } from "./providers/chatgpt";
import { buildGrokChatBody } from "./providers/grok";
import { aggregateChunks, toResponsesInput, toResponsesTools } from "./tools";
import type { OpenAIChatRequest } from "./types";

const TERMINAL_TOOL = {
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
};

const ACCEPTANCE_MESSAGES: OpenAIChatRequest["messages"] = [
  { role: "system", content: "You must use the terminal function. Never invent command output." },
  { role: "user", content: "Use terminal to run: echo UNIQUE_TOKEN_42" },
];

function acceptanceRequest(model: string): OpenAIChatRequest {
  return {
    model,
    stream: false,
    tool_choice: "auto",
    messages: ACCEPTANCE_MESSAGES,
    tools: [TERMINAL_TOOL],
  };
}

describe("OpenAI function tools to Codex Responses", () => {
  it("flattens Chat Completions function tools and keeps tool_choice", () => {
    const body = buildChatGptResponsesBody(acceptanceRequest("gpt-5.6-terra"));
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "terminal",
        description: "Execute a shell command in the user workspace.",
        parameters: TERMINAL_TOOL.function.parameters,
      },
    ]);
    expect(body.tool_choice).toBe("auto");
    expect(body.instructions).toContain("You must use the terminal function");
    expect(body.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Use terminal to run: echo UNIQUE_TOKEN_42" }],
      },
    ]);
  });

  it("preserves assistant tool_calls and role:tool results instead of flattening them to text", () => {
    const { instructions, input } = toResponsesInput([
      { role: "system", content: "You must use the terminal function." },
      { role: "user", content: "run echo UNIQUE_TOKEN_42" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_term_1",
            type: "function",
            function: { name: "terminal", arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_term_1", content: "UNIQUE_TOKEN_42" },
    ]);
    expect(instructions).toBe("You must use the terminal function.");
    expect(input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "run echo UNIQUE_TOKEN_42" }],
      },
      {
        type: "function_call",
        id: "call_term_1",
        call_id: "call_term_1",
        name: "terminal",
        arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}',
      },
      {
        type: "function_call_output",
        call_id: "call_term_1",
        output: "UNIQUE_TOKEN_42",
      },
    ]);
  });

  it("already-flat Responses tools pass through", () => {
    expect(
      toResponsesTools([
        { type: "function", name: "terminal", description: "run", parameters: { type: "object", properties: {} } },
      ]),
    ).toEqual([
      { type: "function", name: "terminal", description: "run", parameters: { type: "object", properties: {} } },
    ]);
  });
});

describe("Grok Chat Completions passthrough", () => {
  it("forwards tools, tool_choice, and tool-result messages", () => {
    const body = buildGrokChatBody({
      model: "grok-4.6",
      tool_choice: "auto",
      tools: [TERMINAL_TOOL],
      messages: [
        { role: "system", content: "You must use the terminal function." },
        { role: "user", content: "Use terminal to run: echo UNIQUE_TOKEN_42" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_term_1",
              type: "function",
              function: { name: "terminal", arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_term_1", content: "UNIQUE_TOKEN_42\n" },
      ],
    });
    expect(body.tools).toEqual([TERMINAL_TOOL]);
    expect(body.tool_choice).toBe("auto");
    expect(body.messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_term_1",
          type: "function",
          function: { name: "terminal", arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}' },
        },
      ],
    });
    expect(body.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "call_term_1",
      content: "UNIQUE_TOKEN_42\n",
    });
  });
});

describe("upstream tool-call events to OpenAI Chat Completions", () => {
  it("maps Codex function-call SSE into streamed tool_calls and a non-stream terminal call", () => {
    const parse = createChatGptChunkParser();
    const chunks = [
      parse({
        type: "response.output_item.added",
        output_index: 0,
        item: { id: "fc_1", type: "function_call", call_id: "call_term_1", name: "terminal", arguments: "" },
      }),
      parse({
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        output_index: 0,
        delta: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}',
      }),
      parse({
        type: "response.output_item.done",
        output_index: 0,
        item: {
          id: "fc_1",
          type: "function_call",
          call_id: "call_term_1",
          name: "terminal",
          arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}',
        },
      }),
      parse({
        type: "response.completed",
        response: {
          usage: { input_tokens: 12, output_tokens: 8 },
          output: [
            {
              type: "function_call",
              call_id: "call_term_1",
              name: "terminal",
              arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}',
            },
          ],
        },
      }),
    ].filter((chunk) => chunk != null);

    const streamed = encodeOpenAIChunk({
      id: "chatcmpl_test",
      model: "chatgpt/gpt-5.6-terra",
      created: 1,
      chunk: chunks[0]!,
    });
    expect(streamed).toContain('"tool_calls"');
    expect(streamed).toContain('"name":"terminal"');
    expect(streamed).toContain('"id":"call_term_1"');

    const argChunk = encodeOpenAIChunk({
      id: "chatcmpl_test",
      model: "chatgpt/gpt-5.6-terra",
      created: 1,
      chunk: chunks[1]!,
    });
    expect(argChunk).toContain("UNIQUE_TOKEN_42");
    expect(argChunk).not.toContain("UNIQUE_TOKEN_42\\n");

    const aggregated = aggregateChunks(chunks);
    expect(aggregated.finishReason).toBe("tool_calls");
    expect(aggregated.text).toBe("");
    expect(aggregated.toolCalls[0]?.function.name).toBe("terminal");
    expect(aggregated.toolCalls[0]?.function.arguments).toContain("UNIQUE_TOKEN_42");
    expect(aggregated.toolCalls[0]?.function.arguments).toContain('"action":"exec"');
    expect(aggregated.toolCalls[0]?.function.arguments).not.toContain("UNIQUE_TOKEN_42\n");

    const body = openAIResponse({
      id: "chatcmpl_test",
      model: "chatgpt/gpt-5.6-terra",
      created: 1,
      text: aggregated.text,
      usage: aggregated.usage,
      finishReason: aggregated.finishReason,
      toolCalls: aggregated.toolCalls,
    });
    expect(body.choices[0]?.finish_reason).toBe("tool_calls");
    expect(body.choices[0]?.message.tool_calls?.[0]?.function.name).toBe("terminal");
    expect(body.choices[0]?.message.content).toBeNull();
  });

  it("harvests a function_call from response.completed when deltas were dropped", () => {
    const parse = createChatGptChunkParser();
    const chunks = [
      parse({
        type: "response.completed",
        response: {
          output: [
            {
              type: "function_call",
              id: "fc_1",
              call_id: "call_term_1",
              name: "terminal",
              arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}',
            },
          ],
        },
      }),
    ].filter((chunk) => chunk != null);
    const aggregated = aggregateChunks(chunks);
    expect(aggregated.finishReason).toBe("tool_calls");
    expect(aggregated.toolCalls[0]?.function.arguments).toContain("UNIQUE_TOKEN_42");
  });

  it("relays Grok delta.tool_calls and finish_reason tool_calls", () => {
    const start = chunkFromGrokEvent({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_term_1",
                type: "function",
                function: { name: "terminal", arguments: "" },
              },
            ],
          },
        },
      ],
    });
    const args = chunkFromGrokEvent({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}' } }],
          },
        },
      ],
    });
    const done = chunkFromGrokEvent({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    const aggregated = aggregateChunks([start!, args!, done!]);
    expect(aggregated.finishReason).toBe("tool_calls");
    expect(aggregated.toolCalls[0]).toEqual({
      id: "call_term_1",
      type: "function",
      function: { name: "terminal", arguments: '{"action":"exec","command":"echo UNIQUE_TOKEN_42"}' },
    });

    const sse = encodeOpenAIChunk({
      id: "chatcmpl_test",
      model: "supergrok/grok-4.6",
      created: 1,
      chunk: start!,
    });
    expect(sse).toContain('"index":0');
    expect(sse).toContain('"function":{"name":"terminal","arguments":""}');
  });

  it("keeps ordinary text streaming and second-turn text completions", () => {
    const parse = createChatGptChunkParser();
    const chunks = [
      parse({ type: "response.output_text.delta", delta: "The command printed " }),
      parse({ type: "response.output_text.delta", delta: "UNIQUE_TOKEN_42." }),
      parse({ type: "response.completed", response: { usage: { input_tokens: 20, output_tokens: 6 } } }),
    ].filter((chunk) => chunk != null);
    const aggregated = aggregateChunks(chunks);
    expect(aggregated.finishReason).toBe("stop");
    expect(aggregated.text).toBe("The command printed UNIQUE_TOKEN_42.");
    expect(aggregated.toolCalls).toEqual([]);

    const grokText = chunkFromGrokEvent({
      choices: [{ delta: { content: "done" }, finish_reason: "stop" }],
    });
    expect(grokText).toEqual({ text: "done", toolCalls: undefined, finishReason: "stop", usage: undefined });
  });
});
