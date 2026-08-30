# jarins — Life OS

A calm, private life operating system for family, home, self, learning, career, money, documents and long-term direction.

Picking this up cold? Start with [PROMPT.md](PROMPT.md) for the short brief,
then [HANDOFF.md](HANDOFF.md) for the detail — current state, what is verified,
what is not, and the ordered next steps. Coding agents should read
[AGENTS.md](AGENTS.md) first; in Claude Code, `/pickup` loads all three.

## Run locally

Requirements: Node 22+ and pnpm 11+ (`packageManager` pins the exact version). A local PostgreSQL is needed only for `pnpm test:rls`.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Jarins runs in two modes. With no Supabase credentials it is a **local demo**:
every screen works, data lives in that browser, and no route is guarded. Copy
`apps/web/.env.example` to `apps/web/.env.local` to switch it into **account
mode**, where middleware guards every route and records live in Postgres behind
row-level security. Anything captured before signing up is carried into the
account on first authenticated load.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:cloudflare
```

Row-level security is verified separately, against a real PostgreSQL rather than
mocks — policy bugs are invisible to unit tests because the code is correct and
the boundary is wrong:

```bash
pnpm test:rls
```

It needs a local `postgres` reachable by `psql`; no Docker or Supabase CLI. See
`supabase/tests/README.md` for what it asserts.

## Cloudflare Workers deployment

The app uses Cloudflare's OpenNext adapter, Workers Static Assets, generated binding types, and Workers observability. `apps/web/wrangler.jsonc` routes the existing proxied `jarins.com` DNS through the app Worker; a separate minimal Worker permanently redirects `www.jarins.com` while preserving paths and query strings.

```bash
pnpm cf-typegen
pnpm build:cloudflare
pnpm deploy:cloudflare
```

The deployment uses Wrangler OAuth locally. CI deployments should use a scoped `CLOUDFLARE_API_TOKEN` secret rather than committing credentials.

## Architecture

- `apps/web`: Next.js App Router responsive web app
- `packages/domain`: framework-independent planning rules
- `supabase/migrations`: PostgreSQL schema, RLS and private storage policies
- `supabase/tests`: row-level security assertions
- `docs`: privacy and architecture decisions

Records are stored in `life_records`, shaped to match the interface. The
normalised tables alongside it (`tasks`, `documents`, `events`, and the rest) are
not yet wired to any screen — modules move onto them as their features mature.
See `docs/architecture.md` for why.
