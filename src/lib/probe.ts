import { getSession, listSessions, updateSessionHealth } from "./vault";
import { probe, refreshIfNeeded } from "./providers";
import type { ProviderId } from "./types";

export async function probeSession(id: string) {
  const session = await getSession(id);
  if (!session) throw new Error("Session not found");
  try {
    const refreshed = await refreshIfNeeded(
      session.provider,
      session.secret,
      session.expiresAt ? new Date(session.expiresAt) : null,
    );
    const result = await probe(session.provider, refreshed.secret);
    await updateSessionHealth(id, {
      health: result.health,
      identity: result.identity ?? session.identity,
      expiresAt: result.expiresAt ?? refreshed.expiresAt,
      lastError: result.error ?? null,
      secret: result.secret ?? refreshed.secret,
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

export async function probeAll() {
  const rows = await listSessions();
  const results = [];
  for (const row of rows) {
    results.push({ id: row.id, provider: row.provider as ProviderId, ...(await probeSession(row.id)) });
  }
  return results;
}
