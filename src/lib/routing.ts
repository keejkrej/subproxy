import type { ProviderId } from "./types";

export function inferProvider(model: string): ProviderId {
  const value = model.toLowerCase();
  if (value.startsWith("chatgpt/")) return "chatgpt";
  if (value.startsWith("grok/")) return "grok";
  if (value.startsWith("cursor/")) return "cursor";
  if (value.startsWith("gpt-") || value.startsWith("codex") || value.startsWith("o3") || value.startsWith("o4")) {
    return "chatgpt";
  }
  if (value.startsWith("grok") || value.includes("grok")) return "grok";
  if (value.startsWith("cursor") || value.startsWith("composer") || value === "auto") return "cursor";
  return "chatgpt";
}
