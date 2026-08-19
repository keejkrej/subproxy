import type { ProviderId } from "./types";

export function inferProvider(model: string): ProviderId {
  const value = model.toLowerCase();
  if (value.startsWith("chatgpt/")) return "chatgpt";
  if (value.startsWith("supergrok/")) return "supergrok";
  if (value.startsWith("gpt-") || value.startsWith("codex") || value.startsWith("o3") || value.startsWith("o4")) {
    return "chatgpt";
  }
  return "chatgpt";
}
