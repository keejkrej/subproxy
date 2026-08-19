CREATE TABLE IF NOT EXISTS sessions (
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
);

CREATE TABLE IF NOT EXISTS issued_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL,
  hash text NOT NULL UNIQUE,
  allowlist jsonb,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger (
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
);

CREATE INDEX IF NOT EXISTS ledger_created_at_idx ON ledger (created_at);

CREATE TABLE IF NOT EXISTS pending_reauth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  session_id uuid,
  payload text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
