import { desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { issuedKeys, ledger, pendingReauth, sessions } from "@/db/schema";
import { decryptJson, encryptJson } from "./crypto";
import { healthFromExpiry } from "./health";
import { hashIssuedKey, issuedKeysEqual } from "./issued-key";
import { inferProvider } from "./routing";
import type {
  Health,
  IssuedKeySummary,
  LedgerRow,
  ProviderId,
  SessionSecret,
  SessionSummary,
} from "./types";

export async function listSessions(): Promise<SessionSummary[]> {
  const rows = await (await db()).select().from(sessions).orderBy(sessions.createdAt);
  return rows.map(toSummary);
}

export async function getSession(id: string) {
  const [row] = await (await db()).select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!row) return null;
  return {
    ...toSummary(row),
    secret: decryptJson<SessionSecret>(row.ciphertext),
  };
}

export async function upsertSession(input: {
  id?: string;
  provider: ProviderId;
  label: string;
  identity?: string | null;
  secret: SessionSecret;
  health?: Health;
  expiresAt?: Date | null;
  lastError?: string | null;
}): Promise<SessionSummary> {
  const ciphertext = encryptJson(input.secret);
  const now = new Date();
  if (input.id) {
    const [row] = await (await db())
      .update(sessions)
      .set({
        label: input.label,
        identity: input.identity ?? null,
        ciphertext,
        health: input.health ?? "unknown",
        expiresAt: input.expiresAt ?? null,
        lastError: input.lastError ?? null,
        updatedAt: now,
      })
      .where(eq(sessions.id, input.id))
      .returning();
    return toSummary(row);
  }
  const [row] = await (await db())
    .insert(sessions)
    .values({
      provider: input.provider,
      label: input.label,
      identity: input.identity ?? null,
      ciphertext,
      health: input.health ?? "unknown",
      expiresAt: input.expiresAt ?? null,
      lastError: input.lastError ?? null,
    })
    .returning();
  return toSummary(row);
}

export async function updateSessionHealth(
  id: string,
  patch: {
    health: Health;
    identity?: string | null;
    expiresAt?: Date | null;
    lastError?: string | null;
    secret?: SessionSecret;
  },
) {
  await (await db())
    .update(sessions)
    .set({
      health: patch.health,
      identity: patch.identity,
      expiresAt: patch.expiresAt,
      lastError: patch.lastError ?? null,
      lastProbedAt: new Date(),
      updatedAt: new Date(),
      ...(patch.secret ? { ciphertext: encryptJson(patch.secret) } : {}),
    })
    .where(eq(sessions.id, id));
}

export async function deleteSession(id: string) {
  await (await db()).delete(sessions).where(eq(sessions.id, id));
}

export async function findSessionForModel(model: string) {
  const rows = await (await db()).select().from(sessions);
  const healthy = rows.filter((row) => row.health === "healthy" || row.health === "expiring");
  const pool = healthy.length ? healthy : rows;
  const prefixed = model.match(/^(chatgpt|grok|cursor)\/(.+)$/);
  if (prefixed) {
    const row = pool.find((item) => item.provider === prefixed[1]);
    return row
      ? { row: toSummary(row), secret: decryptJson<SessionSecret>(row.ciphertext), model: prefixed[2] }
      : null;
  }
  const provider = inferProvider(model);
  const row = pool.find((item) => item.provider === provider);
  return row
    ? { row: toSummary(row), secret: decryptJson<SessionSecret>(row.ciphertext), model }
    : null;
}

export async function lookupIssuedKey(secret: string) {
  const hash = hashIssuedKey(secret);
  const [row] = await (await db()).select().from(issuedKeys).where(eq(issuedKeys.hash, hash)).limit(1);
  if (!row || row.revokedAt) return null;
  if (!issuedKeysEqual(row.hash, hash)) return null;
  return row;
}

export async function listIssuedKeys(): Promise<IssuedKeySummary[]> {
  const rows = await (await db()).select().from(issuedKeys).orderBy(desc(issuedKeys.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    allowlist: row.allowlist,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function insertIssuedKey(input: {
  name: string;
  prefix: string;
  hash: string;
  allowlist: string[] | null;
}) {
  const [row] = await (await db()).insert(issuedKeys).values(input).returning();
  return row;
}

export async function revokeIssuedKey(id: string) {
  await (await db()).update(issuedKeys).set({ revokedAt: new Date() }).where(eq(issuedKeys.id, id));
}

export async function touchIssuedKey(id: string) {
  await (await db()).update(issuedKeys).set({ lastUsedAt: new Date() }).where(eq(issuedKeys.id, id));
}

export async function writeLedger(input: {
  issuedKeyId?: string | null;
  sessionId?: string | null;
  provider?: ProviderId | null;
  model: string;
  status: number;
  error?: string | null;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}) {
  await (await db()).insert(ledger).values({
    issuedKeyId: input.issuedKeyId ?? null,
    sessionId: input.sessionId ?? null,
    provider: input.provider ?? null,
    model: input.model,
    status: input.status,
    error: input.error ?? null,
    latencyMs: input.latencyMs ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
  });
}

export async function listLedger(limit = 100): Promise<LedgerRow[]> {
  const rows = await (await db())
    .select({
      id: ledger.id,
      issuedKeyId: ledger.issuedKeyId,
      sessionId: ledger.sessionId,
      provider: ledger.provider,
      model: ledger.model,
      status: ledger.status,
      error: ledger.error,
      latencyMs: ledger.latencyMs,
      inputTokens: ledger.inputTokens,
      outputTokens: ledger.outputTokens,
      createdAt: ledger.createdAt,
      prefix: issuedKeys.prefix,
    })
    .from(ledger)
    .leftJoin(issuedKeys, eq(ledger.issuedKeyId, issuedKeys.id))
    .orderBy(desc(ledger.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    issuedKeyPrefix: row.prefix ?? null,
    sessionId: row.sessionId,
    provider: (row.provider as ProviderId | null) ?? null,
    model: row.model,
    status: row.status,
    error: row.error,
    latencyMs: row.latencyMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createPendingReauth(input: {
  provider: ProviderId;
  sessionId?: string | null;
  payload: unknown;
  expiresAt: Date;
}) {
  const [row] = await (await db())
    .insert(pendingReauth)
    .values({
      provider: input.provider,
      sessionId: input.sessionId ?? null,
      payload: encryptJson(input.payload),
      expiresAt: input.expiresAt,
    })
    .returning();
  return row;
}

export async function getPendingReauth(id: string) {
  const [row] = await (await db()).select().from(pendingReauth).where(eq(pendingReauth.id, id)).limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await (await db()).delete(pendingReauth).where(eq(pendingReauth.id, id));
    return null;
  }
  return {
    ...row,
    payload: decryptJson<Record<string, unknown>>(row.payload),
  };
}

export async function deletePendingReauth(id: string) {
  await (await db()).delete(pendingReauth).where(eq(pendingReauth.id, id));
}

export async function activeIssuedKeyCount() {
  const rows = await (await db()).select({ id: issuedKeys.id }).from(issuedKeys).where(isNull(issuedKeys.revokedAt));
  return rows.length;
}

function toSummary(row: typeof sessions.$inferSelect): SessionSummary {
  const expiresAt = row.expiresAt;
  const health =
    row.health === "error" || row.health === "unknown"
      ? (row.health as Health)
      : healthFromExpiry(expiresAt);
  return {
    id: row.id,
    provider: row.provider as ProviderId,
    label: row.label,
    identity: row.identity,
    health,
    expiresAt: expiresAt?.toISOString() ?? null,
    lastProbedAt: row.lastProbedAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}


