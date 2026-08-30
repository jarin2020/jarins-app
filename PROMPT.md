# Prompt for the next developer

You are picking up **jarins** — a private "life OS" for one family in Germany
(family, home, self, learning, career, money, documents, future). Repo:
`github.com/jarin2020/jarins-app`, branch `main`. pnpm + Turborepo monorepo,
Next.js 16 App Router, Supabase, deployed to Cloudflare Workers via OpenNext.

**Read `HANDOFF.md` at the repo root before touching anything.** It has the full
picture; this is the short version.

## Where things stand

Until recently the app was a convincing prototype: every screen worked, and all
of it ran on five `localStorage` keys. A 28-table PostgreSQL schema with RLS and
private buckets existed and **no application code ever used it**.

The last body of work connected the two: route-guarding middleware, a working
PKCE auth callback, sign-up/sign-out, three RLS holes closed, a Supabase-backed
repository behind the existing `useLifeRecords()` hook, CSP and HSTS, plus 13 RLS
assertions that run against a real PostgreSQL.

**All of it is verified locally and none of it has ever run against a live
Supabase project, because none exists.** That is your first job, and nothing else
can be verified before it.

## Your first task

Supabase is not connected yet. Do this before anything else.

Prerequisite the human handles once: `npx supabase login`.

```bash
npx supabase orgs list                     # pick the org id
npx supabase projects create jarins \
  --org-id <ORG_ID> --region eu-central-1 \
  --db-password "<GENERATE ONE>"           # give it to the human for their password manager
npx supabase link --project-ref <REF>
npx supabase db push                       # runs both migrations in order
npx supabase projects api-keys --project-ref <REF> --output-format json
```

`--region eu-central-1` is not optional. This database holds children's names,
insurance records and identity documents, and the region is fixed at creation.

Then write `apps/web/.env.local` from `apps/web/.env.example`, using the project
URL and the **anon** key (`publishable`/`anon`, never `service_role`), and set the
auth redirect URLs to `http://localhost:3000/auth/callback` and
`https://jarins.com/auth/callback` — magic links fail silently without them.
`supabase/config.toml` already lists both, so `npx supabase config push` may do it.

Finally, restart the dev server and work through the six-item verification
checklist in `HANDOFF.md`. Treat this one as most likely to fail:
`public.handle_new_user()` is a trigger on `auth.users` that creates the profile,
household and owner membership. It passes against local PostgreSQL, but hosted
`auth.users` is owned by `supabase_auth_admin`. If it does not fire, accounts
cannot save anything, because every record hangs off `household_id`.

CLI flags were verified against Supabase CLI 2.116.0; check `--help` if yours
differs.

## Then, in order

2. Deploy with `NEXT_PUBLIC_*` present in the **build** environment (they are
   inlined at build time — this is why production previously shipped with
   Supabase silently disabled).
3. German translations via `next-intl`. Biggest remaining usability gap: Settings
   offers Deutsch but every string is hard-coded English, for a household working
   toward B2. ~200 strings, mostly in `components/module-view.tsx`.
4. Document upload — schema, buckets and storage policies are ready and tested;
   no UI exists.
5. Finish the subnav sections that currently lead nowhere.
6. Reminders, as a **separate** Cron Trigger Worker (the app worker must never
   hold the service-role key).
7. Service worker / PWA icons — only after the data layer settles.

## Constraints — do not undo these

- **No root `app/loading.tsx`.** It commits HTTP 200 before the page runs, so
  `notFound()` returns 200 with not-found content.
- **`force-dynamic` in `app/layout.tsx` is load-bearing.** Static HTML cannot
  carry the per-request CSP nonce; with `'strict-dynamic'` its scripts are
  refused. This white-screened `/today` in production once already.
- **Middleware must copy cookies onto redirect responses**, or rotated tokens
  bounce users to `/login` forever.
- **`getUser()`, never `getSession()`**, for any authorization decision.
- **The `service_role` key never enters `apps/web`.**
- Keep prettier away from `pnpm-lock.yaml` (see `.prettierignore`).

## How to verify your work

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:rls    # 13 RLS assertions; needs a local postgres reachable by psql
```

Run `pnpm test:rls` whenever you touch a policy. RLS bugs are invisible to unit
tests — the code is correct and the boundary is wrong. That is how three of them
survived in this repo undetected.

## Known unverified

Everything in the Task 1 checklist, plus: Escape-closing the two `<dialog>`
modals was never tested (the browser automation could not dispatch key events).
Focus trapping and close-state sync were verified. Thirty seconds of manual
checking.

## How to work here

Small, reviewable commits with the reasoning in the message — match the existing
history. State plainly what you verified and what you did not; the previous
author's biggest near-miss was a CSP that passed every local check and would have
shipped a blank page, caught only by loading a production build in a browser.
