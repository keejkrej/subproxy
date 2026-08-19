import { findSessionForModel, lookupIssuedKey, touchIssuedKey, updateSessionHealth, writeLedger } from "./vault";
import { complete, refreshIfNeeded } from "./providers";
import {
  completionId,
  encodeOpenAIChunk,
  encodeOpenAIDone,
  openAIResponse,
  sseResponse,
} from "./openai-stream";
import type { OpenAIChatRequest } from "./types";
import { extractBearer } from "./issued-key";

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function authenticateIssuedKey(header: string | null) {
  const secret = extractBearer(header);
  if (!secret) throw new GatewayError("Missing Authorization bearer token", 401);
  const key = await lookupIssuedKey(secret);
  if (!key) throw new GatewayError("Invalid Issued Key", 401);
  if (key.revokedAt) throw new GatewayError("Issued Key has been revoked", 401);
  await touchIssuedKey(key.id);
  return key;
}

export async function handleChatCompletions(req: Request): Promise<Response> {
  const started = Date.now();
  let issuedKeyId: string | undefined;
  let sessionId: string | undefined;
  let model = "unknown";
  try {
    const key = await authenticateIssuedKey(req.headers.get("authorization"));
    issuedKeyId = key.id;
    const body = (await req.json()) as OpenAIChatRequest;
    if (!body?.model || !Array.isArray(body.messages)) {
      throw new GatewayError("Request must include model and messages", 400);
    }
    model = body.model;
    if (Array.isArray(key.allowlist) && key.allowlist.length && !key.allowlist.includes(body.model)) {
      throw new GatewayError(`Model ${body.model} is not allowed for this key`, 403);
    }
    const resolved = await findSessionForModel(body.model);
    if (!resolved) {
      throw new GatewayError(`No Session can serve model ${body.model}`, 404);
    }
    sessionId = resolved.row.id;
    let secret = resolved.secret;
    try {
      const refreshed = await refreshIfNeeded(
        resolved.row.provider,
        resolved.secret,
        resolved.row.expiresAt ? new Date(resolved.row.expiresAt) : null,
      );
      secret = refreshed.secret;
      if (refreshed.refreshed) {
        await updateSessionHealth(resolved.row.id, {
          health: resolved.row.health,
          expiresAt: refreshed.expiresAt,
          secret: refreshed.secret,
        });
      }
    } catch {
      // Use the stored secret; the provider call will surface auth errors.
    }
    const request: OpenAIChatRequest = { ...body, model: resolved.model };
    const chunks = await complete(resolved.row.provider, secret, request);
    const id = completionId();
    const created = Math.floor(Date.now() / 1000);

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
          try {
            for await (const chunk of chunks) {
              if (chunk.usage) usage = chunk.usage;
              controller.enqueue(
                encoder.encode(
                  encodeOpenAIChunk({
                    id,
                    model: body.model,
                    created,
                    chunk,
                  }),
                ),
              );
            }
            controller.enqueue(encoder.encode(encodeOpenAIDone()));
            await safeLedger({
              issuedKeyId,
              sessionId,
              provider: resolved.row.provider,
              model: body.model,
              status: 200,
              latencyMs: Date.now() - started,
              inputTokens: usage?.prompt_tokens ?? null,
              outputTokens: usage?.completion_tokens ?? null,
            });
          } catch (error) {
            await safeLedger({
              issuedKeyId,
              sessionId,
              provider: resolved.row.provider,
              model: body.model,
              status: 502,
              error: error instanceof Error ? error.message : "upstream error",
              latencyMs: Date.now() - started,
            });
            controller.error(error);
            return;
          }
          controller.close();
        },
      });
      return sseResponse(stream);
    }

    let text = "";
    let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    let finishReason = "stop";
    for await (const chunk of chunks) {
      if (chunk.text) text += chunk.text;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }
    await safeLedger({
      issuedKeyId,
      sessionId,
      provider: resolved.row.provider,
      model: body.model,
      status: 200,
      latencyMs: Date.now() - started,
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
    });
    return Response.json(openAIResponse({ id, model: body.model, created, text, usage, finishReason }));
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : 500;
    await safeLedger({
      issuedKeyId,
      sessionId,
      provider: undefined,
      model,
      status,
      error: error instanceof Error ? error.message : "internal error",
      latencyMs: Date.now() - started,
    });
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "internal error", type: "api_error" } },
      { status },
    );
  }
}

async function safeLedger(input: Parameters<typeof writeLedger>[0]) {
  try {
    await writeLedger(input);
  } catch {
    // Ledger is best-effort; never fail the client response because of it.
  }
}
