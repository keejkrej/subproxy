# subproxy

Next.js control panel + OpenAI-compatible gateway for ChatGPT OAuth and SuperGrok OAuth. Hosted on Vercel.

## Setup

1. Create a Neon Postgres database.
2. Create a Clerk **development** application. Disable sign-ups. Copy `pk_test_` / `sk_test_` keys.
3. Copy `.env.example` to `.env.local` and fill:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_ALLOWED_EMAIL=you@example.com
DATABASE_URL=
VAULT_KEY=
```

`VAULT_KEY` can be any passphrase. Generate 32 random bytes if you prefer:

```
openssl rand -hex 32
```

4. `npm install && npm run dev`

Tables are created automatically on first request.

## Use

- Sign in with Clerk.
- Connect ChatGPT / Grok via device-code Re-auth.
- Mint an Issued Key on the Keys screen.
- Point clients at the gateway:

```
OPENAI_BASE_URL=https://<your-app>.vercel.app/v1
OPENAI_API_KEY=sk-sub-...
```

Model names: `chatgpt/gpt-5`, `grok/grok-4.6` (or unprefixed `gpt-5` / `grok-4.6`).

Completions call each provider’s HTTP API with the stored OAuth token. No local CLI is spawned.

## Deploy

Vercel project env: same vars as `.env.local`. Use Clerk development keys in Production too. Cron hits `/api/cron/probe` every 5 minutes; set `CRON_SECRET` so that route requires `Authorization: Bearer <secret>`.
