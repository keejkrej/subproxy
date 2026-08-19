import { describe, expect, it } from "vitest";
import { parseCatalogModel, parseModelName, parseProvider, resolveModelRoute, upstreamModel } from "./catalog";
import { inferProvider } from "./routing";

describe("model routing", () => {
  it("routes prefixed and common model names", () => {
    expect(inferProvider("chatgpt/gpt-5")).toBe("chatgpt");
    expect(inferProvider("gpt-5-codex")).toBe("chatgpt");
    expect(inferProvider("supergrok/grok-4.6")).toBe("supergrok");
    expect(inferProvider("grok-4.6")).toBe("chatgpt");
    expect(inferProvider("grok/grok-4.6")).toBe("chatgpt");
    expect(inferProvider("gpt-5.6-terra")).toBe("chatgpt");
  });
});

describe("neon model catalog", () => {
  const catalog = [
    { name: "gpt-5.6-terra", provider: "chatgpt" as const },
    { name: "supergrok/grok-4.6", provider: "supergrok" as const },
    { name: "my-special-model", provider: "supergrok" as const },
  ];

  it("uses the catalog provider even when the name looks like another vendor", () => {
    expect(resolveModelRoute("my-special-model", catalog)).toEqual({
      provider: "supergrok",
      model: "my-special-model",
    });
    expect(resolveModelRoute("supergrok/grok-4.6", catalog)).toEqual({
      provider: "supergrok",
      model: "grok-4.6",
    });
    expect(resolveModelRoute("gpt-5.6-terra", catalog)).toEqual({
      provider: "chatgpt",
      model: "gpt-5.6-terra",
    });
  });

  it("falls back to prefix and name inference when the catalog has no match", () => {
    expect(resolveModelRoute("chatgpt/gpt-5.5", catalog)).toEqual({ provider: "chatgpt", model: "gpt-5.5" });
    expect(resolveModelRoute("supergrok/grok-4.5", catalog)).toEqual({
      provider: "supergrok",
      model: "grok-4.5",
    });
  });

  it("does not treat grok/ as SuperGrok", () => {
    expect(resolveModelRoute("grok/grok-4.5", catalog)).toEqual({
      provider: "chatgpt",
      model: "grok/grok-4.5",
    });
  });

  it("strips a matching provider prefix for the upstream model id", () => {
    expect(upstreamModel("chatgpt/gpt-5.6-terra", "chatgpt")).toBe("gpt-5.6-terra");
    expect(upstreamModel("gpt-5.6-terra", "chatgpt")).toBe("gpt-5.6-terra");
    expect(upstreamModel("supergrok/grok-4.6", "supergrok")).toBe("grok-4.6");
    expect(upstreamModel("grok/grok-4.6", "supergrok")).toBe("grok/grok-4.6");
  });

  it("rejects blank names and unknown providers", () => {
    expect(parseModelName("  ")).toBeNull();
    expect(parseModelName(" grok-4.6 ")).toBe("grok-4.6");
    expect(parseProvider("claude")).toBeNull();
    expect(parseProvider("grok")).toBeNull();
    expect(parseProvider("supergrok")).toBe("supergrok");
  });

  it("requires a chatgpt/ or supergrok/ prefix on catalog names", () => {
    expect(parseCatalogModel("chatgpt/gpt-5.6-terra")).toEqual({
      name: "chatgpt/gpt-5.6-terra",
      provider: "chatgpt",
    });
    expect(parseCatalogModel("  SuperGrok/grok-4.6  ")).toEqual({
      name: "supergrok/grok-4.6",
      provider: "supergrok",
    });
    expect(parseCatalogModel("grok/grok-4.6")).toBeNull();
    expect(parseCatalogModel("gpt-5.6-terra")).toBeNull();
    expect(parseCatalogModel("chatgpt/")).toBeNull();
    expect(parseCatalogModel("cursor/composer-2.5")).toBeNull();
  });
});
