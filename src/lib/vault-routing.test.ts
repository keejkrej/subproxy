import { describe, expect, it } from "vitest";
import { inferProvider } from "./routing";

describe("model routing", () => {
  it("routes prefixed and common model names", () => {
    expect(inferProvider("chatgpt/gpt-5")).toBe("chatgpt");
    expect(inferProvider("gpt-5-codex")).toBe("chatgpt");
    expect(inferProvider("grok-4.6")).toBe("grok");
    expect(inferProvider("cursor/composer-2.5")).toBe("cursor");
    expect(inferProvider("composer-2")).toBe("cursor");
  });
});
