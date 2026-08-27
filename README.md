# jarins — Life OS

A calm, private life operating system for family, home, self, learning, career, money, documents and long-term direction.

## Run locally

Requirements: Node 22+, pnpm 10+, and optionally the Supabase CLI/Docker for the local backend.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Copy `apps/web/.env.example` to `apps/web/.env.local` when connecting a Supabase project.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:cloudflare
```

## Cloudflare Workers deployment

The app uses Cloudflare's OpenNext adapter, Workers Static Assets, generated binding types, and Workers observability. `apps/web/wrangler.jsonc` routes the existing proxied `jarins.com` DNS through the app Worker; a separate minimal Worker permanently redirects `www.jarins.com` while preserving paths and query strings.

```bash
pnpm cf-typegen
pnpm build:cloudflare
pnpm deploy:cloudflare
```

The deployment uses Wrangler OAuth locally. CI deployments should use a scoped `CLOUDFLARE_API_TOKEN` secret rather than committing credentials.

## Architecture

- `apps/web`: Next.js App Router responsive web/PWA
- `packages/domain`: framework-independent planning rules
- `supabase/migrations`: PostgreSQL schema, RLS and private storage policies
- `docs`: privacy and architecture decisions

The interface works with local demo state before Supabase credentials exist. Production data paths must use Supabase Auth, RLS, and private buckets.
