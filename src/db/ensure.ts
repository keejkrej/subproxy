import { neon } from "@neondatabase/serverless";
import { DEFAULT_MODELS } from "@/lib/catalog";
import { databaseUrl } from "@/lib/env";

let ready: Promise<void> | undefined;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = neon(databaseUrl());
      await sql`CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL,
        label text NOT NULL,
        identity text,
        ciphertext text NOT NULL,
        health text NOT NULL DEFAULT 'unknown',
        last_error text,
        expires_at timestamptz,
        last_probed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS issued_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        prefix text NOT NULL,
        hash text NOT NULL UNIQUE,
        allowlist jsonb,
        revoked_at timestamptz,
        last_used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        issued_key_id uuid,
        session_id uuid,
        provider text,
        model text NOT NULL,
        status integer NOT NULL,
        error text,
        latency_ms integer,
        input_tokens integer,
        output_tokens integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS ledger_created_at_idx ON ledger (created_at)`;
      await sql`CREATE TABLE IF NOT EXISTS pending_reauth (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL,
        session_id uuid,
        payload text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      const existingModels = await sql`SELECT to_regclass('public.models') AS name`;
      const modelsExisted = Boolean(existingModels[0]?.name);
      await sql`CREATE TABLE IF NOT EXISTS models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        provider text NOT NULL,
        last_error text,
        last_tested_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      if (!modelsExisted) {
        for (const model of DEFAULT_MODELS) {
          await sql`INSERT INTO models (name, provider) VALUES (${model.name}, ${model.provider})`;
        }
      }
      await sql`DELETE FROM pending_reauth WHERE provider = 'cursor'`;
      await sql`DELETE FROM sessions WHERE provider = 'cursor'`;
      await sql`DELETE FROM models WHERE provider = 'cursor'`;
    })();
  }
  return ready;
}
