import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  identity: text("identity"),
  ciphertext: text("ciphertext").notNull(),
  health: text("health").notNull().default("unknown"),
  lastError: text("last_error"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastProbedAt: timestamp("last_probed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const issuedKeys = pgTable("issued_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  hash: text("hash").notNull().unique(),
  allowlist: jsonb("allowlist").$type<string[] | null>(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ledger = pgTable(
  "ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issuedKeyId: uuid("issued_key_id"),
    sessionId: uuid("session_id"),
    provider: text("provider"),
    model: text("model").notNull(),
    status: integer("status").notNull(),
    error: text("error"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ledger_created_at_idx").on(table.createdAt)],
);

export const pendingReauth = pgTable("pending_reauth", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  sessionId: uuid("session_id"),
  payload: text("payload").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
