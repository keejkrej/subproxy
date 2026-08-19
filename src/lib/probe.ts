import { complete, probe, refreshIfNeeded } from "./providers";
import {
  findSessionForModel,
  getModel,
  getSession,
  listSessions,
  updateModelTest,
  updateSessionHealth,
  writeLedger,
} from "./vault";
import type { ProviderId } from "./types";

export async function probeSession(id: string) {
  const session = await getSession(id);
  if (!session) throw new Error("Session not found");
  try {
    let refreshed = {
      secret: session.secret,
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : null,
      refreshed: false,
    };
    let refreshError: string | null = null;
    try {
      refreshed = await refreshIfNeeded(
        session.provider,
        session.secret,
        session.expiresAt ? new Date(session.expiresAt) : null,
      );
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "refresh failed";
    }
    const result = await probe(session.provider, refreshed.secret);
    const failed = result.health === "error" || result.health === "expired";
    await updateSessionHealth(id, {
      health: result.health,
      identity: result.identity ?? session.identity,
      expiresAt: result.expiresAt ?? refreshed.expiresAt,
      lastError: failed ? (result.error ?? refreshError) : null,
      secret: result.secret ?? (refreshed.refreshed ? refreshed.secret : undefined),
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe failed";
    await updateSessionHealth(id, {
      health: "error",
      lastError: message,
    });
    return { health: "error" as const, error: message };
  }
}

export async function testCatalogModel(id: string) {
  const model = await getModel(id);
  if (!model) throw new Error("Model not found");
  const started = Date.now();
  const resolved = await findSessionForModel(model.name);
  if (!resolved) {
    const error = `No Session can serve model ${model.name}`;
    await updateModelTest(id, error);
    return { ok: false as const, error, latencyMs: Date.now() - started };
  }
  try {
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
      // Probe with the stored secret; the completion will surface auth errors.
    }
    const chunks = await complete(resolved.row.provider, secret, {
      model: resolved.model,
      messages: [{ role: "user", content: "Reply with ok." }],
    });
    let text = "";
    let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    for await (const chunk of chunks) {
      if (chunk.text) text += chunk.text;
      if (chunk.usage) usage = chunk.usage;
    }
    await writeLedger({
      sessionId: resolved.row.id,
      provider: resolved.row.provider,
      model: model.name,
      status: 200,
      latencyMs: Date.now() - started,
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
    });
    await updateModelTest(id, null);
    return { ok: true as const, text, latencyMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : "model test failed";
    await writeLedger({
      sessionId: resolved.row.id,
      provider: resolved.row.provider,
      model: model.name,
      status: 502,
      error: message,
      latencyMs: Date.now() - started,
    });
    await updateModelTest(id, message);
    return { ok: false as const, error: message, latencyMs: Date.now() - started };
  }
}

export async function probeAll() {
  const rows = await listSessions();
  const results = [];
  for (const row of rows) {
    results.push({ id: row.id, provider: row.provider as ProviderId, ...(await probeSession(row.id)) });
  }
  return results;
}
