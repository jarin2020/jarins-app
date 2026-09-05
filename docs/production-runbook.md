# Production release runbook

Production has two independently deployed halves: the Supabase schema and the
Cloudflare Workers. A release is complete only when both are current.

## One-time operator setup

1. Authenticate the Supabase CLI and link this repository to the production
   project.
2. Authenticate Wrangler with the Cloudflare account that owns `jarins.com`.
3. Add `INTEGRATION_TOKEN_ENCRYPTION_KEY` and the provider OAuth client values
   listed in [architecture.md](architecture.md) as Worker secrets. Never place
   them in Git or `apps/web` source.
4. Register every callback URL from [architecture.md](architecture.md) in the
   matching Google, Microsoft, or Dropbox developer console.

## Preflight

Run `pnpm db:check` to print the production migrations that are still pending.
The command is intentionally linked-project-only and does not read Vault values.

Run `pnpm verify` to execute formatting, linting, type checks, unit tests, the
Next.js build, and the Cloudflare adapter build. Run `pnpm test:rls` whenever a
migration or policy changes; it needs a local PostgreSQL reachable by `psql`.

## Release

Run `pnpm deploy:production`. It performs the full code verification first,
applies pending Supabase migrations second, and deploys the application and
`www` redirect Workers last. If migration application fails, the Worker is not
deployed. This order prevents UI code from calling tables or RPC functions that
production does not yet have.

After deployment, sign in with a non-production test account and smoke-test
Home, Family invitations, the fixed Family thread, Inbox, Calendar, and VAULT.
Provider connections cannot pass end-to-end tests until their real OAuth
credentials, consent configuration, and test accounts exist.
