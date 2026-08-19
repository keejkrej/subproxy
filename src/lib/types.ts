export const PROVIDERS = ["chatgpt", "grok"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const HEALTH_STATES = [
  "healthy",
  "expiring",
  "expired",
  "error",
  "unknown",
] as const;
export type Health = (typeof HEALTH_STATES)[number];

export type SessionSecret =
  | {
      kind: "oauth";
      accessToken: string;
      refreshToken: string;
      accountId?: string;
      tokenEndpoint?: string;
    }
  | {
      kind: "api_key";
      apiKey: string;
    };

export type SessionSummary = {
  id: string;
  provider: ProviderId;
  label: string;
  identity: string | null;
  health: Health;
  expiresAt: string | null;
  lastProbedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type ModelSummary = {
  id: string;
  name: string;
  provider: ProviderId;
  lastError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IssuedKeySummary = {
  id: string;
  name: string;
  prefix: string;
  allowlist: string[] | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type LedgerRow = {
  id: string;
  issuedKeyPrefix: string | null;
  sessionId: string | null;
  provider: ProviderId | null;
  model: string;
  status: number;
  error: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};

export type OpenAIChatMessage = {
  role: string;
  content: unknown;
  name?: string;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export type OpenAIChatRequest = {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  tools?: unknown;
  tool_choice?: unknown;
};

export type CompletionChunk = {
  text?: string;
  finishReason?: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type ProbeResult = {
  health: Health;
  identity?: string | null;
  expiresAt?: Date | null;
  error?: string | null;
  secret?: SessionSecret;
};
