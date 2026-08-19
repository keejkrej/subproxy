import { describe, expect, it } from "vitest";
import { parseModelName, parseProvider, resolveModelRoute, upstreamModel } from "./catalog";
import { inferProvider } from "./routing";

describe("model routing", () => {
  it("routes prefixed and common model names", () => {
    expect(inferProvider("chatgpt/gpt-5")).toBe("chatgpt");
    expect(inferProvider("gpt-5-codex")).toBe("chatgpt");
    expect(inferProvider("grok-4.6")).toBe("grok");
    expect(inferProvider("gpt-5.6-terra")).toBe("chatgpt");
  });
});

describe("neon model catalog", () => {
  const catalog = [
    { name: "gpt-5.6-terra", provider: "chatgpt" as const },
    { name: "grok/grok-4.6", provider: "grok" as const },
    { name: "my-special-model", provider: "grok" as const },
  ];

  it("uses the catalog provider even when the name looks like another vendor", () => {
    expect(resolveModelRoute("my-special-model", catalog)).toEqual({
      provider: "grok",
      model: "my-special-model",
    });
    expect(resolveModelRoute("grok/grok-4.6", catalog)).toEqual({ provider: "grok", model: "grok-4.6" });
    expect(resolveModelRoute("gpt-5.6-terra", catalog)).toEqual({
      provider: "chatgpt",
      model: "gpt-5.6-terra",
    });
  });

  it("falls back to prefix and name inference when the catalog has no match", () => {
    expect(resolveModelRoute("chatgpt/gpt-5.5", catalog)).toEqual({ provider: "chatgpt", model: "gpt-5.5" });
    expect(resolveModelRoute("grok-4.5", catalog)).toEqual({ provider: "grok", model: "grok-4.5" });
  });

  it("strips a matching provider prefix for the upstream model id", () => {
    expect(upstreamModel("chatgpt/gpt-5.6-terra", "chatgpt")).toBe("gpt-5.6-terra");
    expect(upstreamModel("gpt-5.6-terra", "chatgpt")).toBe("gpt-5.6-terra");
    expect(upstreamModel("grok/grok-4.6", "chatgpt")).toBe("grok/grok-4.6");
  });

  it("rejects blank names and unknown providers", () => {
    expect(parseModelName("  ")).toBeNull();
    expect(parseModelName(" grok-4.6 ")).toBe("grok-4.6");
    expect(parseProvider("claude")).toBeNull();
    expect(parseProvider("grok")).toBe("grok");
  });
});
