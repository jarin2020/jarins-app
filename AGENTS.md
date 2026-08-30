# AGENTS.md

Instructions for coding agents working in this repository. Read this first, then
`PROMPT.md` (the short brief) and `HANDOFF.md` (the detail behind it).

## What this project is

**jarins** — a private "life OS" for one family in Germany: family, home, self,
learning, career, money, documents, future. pnpm + Turborepo monorepo, Next.js 16
App Router, Supabase (Postgres + Auth + private Storage), deployed to Cloudflare
Workers through the OpenNext adapter.

```
apps/web            Next.js app (App Router, all screens)
apps/www-redirect   Worker that 308s www.jarins.com -> jarins.com
packages/domain     Framework-independent planning rules
supabase/migrations Schema, RLS, storage policies
supabase/tests      RLS assertions against a real PostgreSQL
docs/               Architecture decisions
```

## Before you change anything

Check whether `apps/web/.env.local` exists.

- **If it does not**, Supabase has not been connected. The app runs in local demo
  mode and the entire auth and sync layer is unverified. This blocks every other
  task. Say so and stop rather than starting feature work — see Task 1 in
  `PROMPT.md`.
- **If it does**, work through the verification checklist in `HANDOFF.md` before
  building anything new.

## Verification — run before claiming anything is done

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:rls    # 13 RLS assertions; needs a local postgres reachable by psql
```

`pnpm lint` runs with `--max-warnings=0`, so warnings fail. Run `pnpm test:rls`
whenever you touch a policy or migration: RLS bugs are invisible to unit tests
because the code is correct and the boundary is wrong. Three of them survived in
this repo undetected that way.

State plainly what you verified and what you did not. The last author's biggest
near-miss was a Content-Security-Policy that passed every local check and would
have shipped a blank home screen — caught only by loading a production build in a
real browser.

## Constraints — do not "clean these up"

Each looks like clutter. Each is load-bearing, and the reasons are recorded under
Landmines in `HANDOFF.md`.

- **No root `app/loading.tsx`.** It flushes the streaming shell and commits HTTP
  200 before the page runs, so `notFound()` returns 200 with not-found content.
- **`export const dynamic = "force-dynamic"` in `app/layout.tsx` stays.** Static
  HTML is baked at build time and cannot carry the per-request CSP nonce; with
  `'strict-dynamic'` its scripts are then refused. This white-screened `/today`
  in production once already.
- **Middleware must copy cookies onto redirect responses**, or a user whose token
  just rotated is bounced to `/login` on every request.
- **`getUser()`, never `getSession()`**, for any authorization decision.
  `getSession()` only reads the cookie and does not revalidate.
- **The `service_role` key never enters `apps/web`.** It bypasses RLS. Its only
  home is the reminders worker, as a Wrangler secret. The anon key is public by
  design and belongs in the client.
- **Keep prettier away from `pnpm-lock.yaml`** — see `.prettierignore`.
- `cancel` and `close` do not bubble, so React's `onCancel`/`onClose` props never
  fire on `<dialog>`. Listeners are attached to the element directly.

## Conventions

- Small, reviewable commits; put the reasoning in the message. Match the existing
  history — `git log` is the style guide.
- Never commit secrets. `.env.local` is gitignored; keep it that way.
- Data model: records live in `life_records`, shaped to match the interface. The
  other 28 tables are mostly not wired to any screen yet — promote a module to
  its specialised table when a feature needs the structure, not speculatively.
  `HANDOFF.md` explains why several of them cannot hold today's records at all.
