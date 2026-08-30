# Handoff — jarins Life OS

Branch `dev-zaman`. This document is written to be handed to a developer (or an
AI coding agent) picking the work up cold. It assumes you have the accesses
listed below; the previous author did not.

---

## Where this stands in one paragraph

Jarins was a high-fidelity prototype: every screen worked, and all of it ran on
five `localStorage` keys. A 28-table PostgreSQL schema with RLS and private
buckets existed and **no line of application code ever read or wrote it**. This
branch closes that gap — auth, route guarding, a Supabase-backed data layer, RLS
fixes and security headers. It is all verified locally against a real PostgreSQL
and a production build. **None of it has run against a live Supabase project,**
because none exists yet. That is task 1.

---

## Accesses you need

| Access                              | Needed for                     | Notes                                                                                                  |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Supabase project (owner)            | Everything below               | Create in **Frankfurt / eu-central-1** — this holds children's names, insurance and identity documents |
| Supabase dashboard                  | SQL editor, auth redirect URLs |                                                                                                        |
| Cloudflare account for `jarins.com` | Deploy                         | Wrangler OAuth locally; a scoped `CLOUDFLARE_API_TOKEN` for CI                                         |
| GitHub repo write                   | Push, CI                       |                                                                                                        |

The `service_role` key must never enter `apps/web`. Its only home is the
reminders worker (task 6), as a Wrangler secret.

---

## Task 1 — Stand up Supabase. Nothing else can be verified first.

1. Create a project in **eu-central-1**.
2. SQL Editor → paste both migrations **in order**, once, against the empty
   database. They are not idempotent:
   - `supabase/migrations/202608270001_initial_schema.sql`
   - `supabase/migrations/202608300001_harden_and_records.sql`
3. Authentication → URL Configuration:
   - Site URL `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://jarins.com/auth/callback`
   - Magic links fail silently without these.
4. `cp apps/web/.env.example apps/web/.env.local` and fill in the project URL and
   the **anon** key. The anon key is public by design — it ships in the browser
   bundle, and authorization comes from RLS.
5. Restart the dev server. The app switches from local-demo to account mode.

### Then verify, in this order — none of it has ever run live

- [ ] **Sign-up creates a profile, a household and an owner membership.**
      `public.handle_new_user()` is a trigger on `auth.users`. It passes against
      local PostgreSQL, but hosted `auth.users` is owned by `supabase_auth_admin`
      and this is the single most likely thing to behave differently. Check
      `select * from profiles, households, household_members` after your first
      sign-up. If the trigger did not fire, the account cannot save anything,
      because every record hangs off `household_id`.
- [ ] **Magic link completes.** Request one, click it, confirm you land signed in
      at `/today` and not back at `/login`.
- [ ] **Local records migrate.** Add items while signed out, then sign up. They
      should appear in the account. The demo seed must _not_ be uploaded —
      `apps/web/lib/records/migrate.ts`.
- [ ] **Sign out locks the routes.** Signed out, `/family` must redirect to
      `/login`, not render.
- [ ] **Two households cannot see each other.** Sign up a second account and
      confirm the record lists are disjoint.
- [ ] **The cloud repository works at all.**
      `apps/web/lib/records/cloud-repository.ts` has unit tests for its money
      conversion, but has never issued a real PostgREST query.

---

## Tasks 2–7, in order

2. **Deploy with the env vars present.** `NEXT_PUBLIC_*` are inlined at _build_
   time, so they must exist in the Cloudflare build environment and in CI — not
   just at runtime. This is why production previously shipped with Supabase
   silently disabled. Add them, then `pnpm build:cloudflare && pnpm deploy:cloudflare`.

3. **German translations.** The largest remaining usability gap. Settings offers
   English/Deutsch but only `Intl.DateTimeFormat` consumes it — every string is
   hard-coded English, for a household in Germany working toward B2. Use
   `next-intl`; roughly 200 strings, most of them in `components/module-view.tsx`.
   Read the locale from the profile rather than `localStorage` so it follows the
   user across devices.

4. **Document upload.** The schema, the private buckets and the storage policies
   are ready and tested; no UI exists. Paths are
   `documents-private/<household_id>/<sensitivity>/<uuid>.<ext>` — the policies
   depend on that shape, see the migration.

5. **Finish the subnav.** Documents → Expiring and Categories, and Money →
   Upcoming, are advertised in `module-view.tsx` but have no entry in
   `subsectionKinds` (`components/records-workspace.tsx`), so they fall through
   to unfiltered views. Either map them or remove the tabs.

6. **Reminders.** `reminders` and `notification_preferences` exist; nothing
   sends anything, so an expiring passport passes its date silently. Build it as
   a **separate Worker** with a Cron Trigger, following `apps/www-redirect` —
   the OpenNext worker serves the app and must never hold the service-role key.

7. **Service worker / PWA.** The README calls it a PWA; there is a manifest and
   no service worker, so no offline support, and only an SVG icon (Android wants
   192/512 PNG + maskable). Do this _after_ the data layer settles — offline
   caching over a live session produces bugs that are miserable to reproduce.

---

## Landmines — things that cost real time to rediscover

- **Never add a root `app/loading.tsx`.** It flushes the streaming shell and
  commits HTTP 200 before the page runs, so `notFound()` renders the not-found
  body with a 200 status. Measured both ways against a production build.

- **Never make a page statically prerendered.** `export const dynamic =
"force-dynamic"` in `app/layout.tsx` is load-bearing. Static HTML is baked at
  build time and cannot carry the per-request CSP nonce; with `'strict-dynamic'`
  its scripts are then refused, which white-screened `/today` in production while
  every dynamic route worked.

- **Copy cookies onto redirect responses in middleware.** A fresh
  `NextResponse.redirect()` does not carry the refreshed auth cookies, so a user
  whose token just rotated is bounced to `/login` on every request. Handled in
  `middleware.ts`; do not "simplify" it away.

- **`getUser()`, never `getSession()`, for authorization.** `getSession()` only
  reads the cookie and does not revalidate.

- **`cancel` and `close` do not bubble**, so React's `onCancel`/`onClose` props
  never fire on `<dialog>`. Listeners are attached to the element itself.

- **`style-src` still needs `'unsafe-inline'`** because two progress bars set
  width through the `style` attribute (`records-workspace.tsx`,
  `today-view.tsx`). Move those to a class-driven custom property and the flag
  can go. `script-src` is fully locked down.

- **Don't let prettier near `pnpm-lock.yaml`** — see `.prettierignore`.
  Reformatting it produced a 6,500-line diff and risks `--frozen-lockfile`.

---

## Known-unverified

- **Escape-closing the modals.** The browser automation used could not dispatch
  observable key events, so this was never tested. Focus trapping and
  close-state sync _were_ verified. Thirty seconds of manual checking.
- **Everything in the Task 1 checklist.**

---

## Why `life_records` exists next to 28 unused tables

The interface's model cannot be stored in those tables, and not for want of
effort — several mappings are structurally impossible. `documents.storage_path`,
`mime_type` and `size_bytes` are `NOT NULL`, but today's document records are
index cards with no file. `learning_sessions.program_id` is `NOT NULL`, so a
standalone study session has nowhere to go. Family kinds _Clothing_, _Packing
list_ and _Memory_, home's _Maintenance_ and _Contract_, and career's _Job
readiness_ have no table at all.

So `life_records` is shaped like the model the UI actually uses, with three
corrections: money as integer cents, search as a generated `tsvector`, and
bounded lengths. Promote a module to its specialised table when a feature needs
the structure — `documents` at task 4, `events` when calendar sync lands. Don't
do it speculatively; building tables for features that don't exist is what
produced this gap.

---

## Verification

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:rls     # 13 RLS assertions against a real PostgreSQL; needs local psql
```

`pnpm test:rls` is the one that matters most when touching policies: RLS bugs are
invisible to unit tests, because the code is correct and the boundary is wrong.
See `supabase/tests/README.md`.
