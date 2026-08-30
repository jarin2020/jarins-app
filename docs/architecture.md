# Architecture decisions

## Calm-first UI

Today is the control surface. The interface limits daily outcomes to three, explains its “5 of 7 essentials” status transparently, and never computes a hidden productivity score.

## Data boundaries

Shared family/home data is scoped to a household. Self, learning, goals, and career data remain user-owned. High-sensitivity documents remain uploader-only even inside a household. Storage buckets are private and use user-prefixed object paths.

## Deployment

The web app is portable across a Next.js-compatible platform. Supabase should be provisioned in Frankfurt (`eu-central-1`). Cloudflare Workers and DNS serve `jarins.com`; no account IDs or secrets are committed.

## Privacy

Do not log form values, document metadata, child notes, auth tokens, or signed URLs. AI processing is off by default for sensitive data. Analytics events carry event names and coarse module identifiers only.

## Why there is no root `loading.tsx`

A `loading.tsx` at the app root makes Next flush the streaming shell before the
page component runs, which commits HTTP 200. `notFound()` then renders the
not-found body but can no longer set a 404 status — verified against a
production build: unknown routes answered 200 with the file present and 404
without it.

Screens carry their own loading states instead (`useLifeRecords()` exposes
`loading`), which is also better than a blank full-page shell. If a route
segment ever needs a `loading.tsx`, add it to that segment rather than the root,
and keep it off `app/[...slug]`.
