# Architecture decisions

## Calm-first UI

Today is the control surface. The interface limits daily outcomes to three, explains its “5 of 7 essentials” status transparently, and never computes a hidden productivity score.

## Data boundaries

Shared family/home data is scoped to a household. Self, learning, goals, and career data remain user-owned. High-sensitivity documents remain uploader-only even inside a household. Storage buckets are private and use user-prefixed object paths.

## Household messaging

Signed-in messaging is stored in dedicated Supabase tables rather than
`life_records`. A user can read a thread only through an explicit
`message_thread_members` row. Teams are reusable household groups; linking a
team to a thread expands its verified accounts into effective thread
membership, and removing a team member removes indirect access when no other
membership source remains.

Invitations use a random 256-bit bearer token. Only its SHA-256 hash is stored,
the invited account email must match, and Supabase must report that email as
confirmed before the household membership is created. Invitation links are
shown to the household owner for out-of-band delivery; no service-role key or
auth-admin operation runs in the web app.

Messages, effective membership, notifications, and attachment metadata are in
the `supabase_realtime` publication. Postgres Changes are suitable here because
this is a small family workspace and RLS authorizes every delivered row.
Attachments live in the private `message-attachments-private` bucket under
`<household>/<thread>/<uploader>/<random-id>` and are opened with short-lived
signed URLs. Read state is a per-member timestamp, while each incoming message
also creates an in-app notification row for unread counts.

## Connected email

Email accounts are private to one authenticated user, including when that user
shares a household. Gmail/Google Workspace and Outlook/Hotmail/Microsoft 365 use
OAuth authorization-code flow with PKCE and offline refresh tokens. Other
domains use IMAP for reading/actions and SMTP submission for sending. The
custom-mail connection verifies both servers before it is saved.

Provider refresh tokens and IMAP/SMTP passwords are AES-256-GCM encrypted by the
web Worker with `INTEGRATION_TOKEN_ENCRYPTION_KEY`; the key itself is a Cloudflare
secret and never enters Postgres or the browser. Supabase stores account
settings plus the newest inbox metadata for fast, cross-device tabs and
realtime unread counts. Full bodies and attachment bytes remain at Google,
Microsoft, or the IMAP server and are fetched through an authenticated,
no-store route only when the owner opens or downloads them.

Production requires these Worker secrets:

- `INTEGRATION_TOKEN_ENCRYPTION_KEY` — exactly 32 random bytes encoded as base64
  (`EMAIL_TOKEN_ENCRYPTION_KEY` remains a compatibility fallback).
- `GOOGLE_EMAIL_CLIENT_ID` and `GOOGLE_EMAIL_CLIENT_SECRET`.
- `MICROSOFT_EMAIL_CLIENT_ID` and `MICROSOFT_EMAIL_CLIENT_SECRET`.
- `EMAIL_OAUTH_REDIRECT_ORIGIN` — `https://jarins.com` in production.

Register these exact OAuth redirects with the providers:

- `https://jarins.com/api/email/oauth/gmail/callback`
- `https://jarins.com/api/email/oauth/outlook/callback`

The Google consent screen needs `openid`, `email`, `gmail.modify`, and
`gmail.send`; Microsoft needs `openid`, `profile`, `email`, `offline_access`,
`User.Read`, `Mail.ReadWrite`, and `Mail.Send`. Google classifies mailbox access
as restricted, so a public OAuth application that stores or transmits this data
may require Google verification and a security assessment. Keep the app in the
appropriate internal/testing mode until that review is complete.

Inbox sync is owner-triggered on mailbox open and by the Sync button. Supabase
Realtime distributes cached metadata changes across signed-in devices. A later
background sync worker can call the same provider adapters; Gmail push would
also require Google Cloud Pub/Sub and renewal of each mailbox watch before its
seven-day expiry.

## Connected calendars

Google Calendar and Microsoft Calendar use authorization-code OAuth with PKCE,
offline access, and the narrow read-only or read/write scope selected during
connection. Apple Calendar and custom domains use HTTPS CalDAV discovery;
iCloud requires an Apple app-specific password. OAuth tokens and CalDAV
passwords use the same AES-256-GCM integration secret as connected email.

Accounts, credentials, and source-calendar names are owner-private. Normalized
event rows are cached in Supabase for a fast unified view and realtime updates.
An event is household-readable only when its owner enables family sharing; RLS
still prevents other household members from updating or deleting it. Selected
sources feed Jarins Calendar, while explicitly shared events also feed the
per-person Family Calendar columns.

Provider writes happen before the local cache changes. Google updates use
etags to avoid overwriting a concurrent provider edit, and CalDAV uses
`If-Match`. Google sync persists incremental sync tokens and resets correctly
after a provider `410`; Microsoft and CalDAV refresh the configured date window
on each sync. Opening a freshly authorized connection performs its first sync,
and every account exposes an explicit Sync action.

Production additionally requires:

- `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`.
- `MICROSOFT_CALENDAR_CLIENT_ID` and `MICROSOFT_CALENDAR_CLIENT_SECRET`.
- `CALENDAR_OAUTH_REDIRECT_ORIGIN` — `https://jarins.com` in production.

The email OAuth client values are accepted as fallbacks when the same provider
application is intentionally used for both features. Register these redirects:

- `https://jarins.com/api/calendar/oauth/google/callback`
- `https://jarins.com/api/calendar/oauth/microsoft/callback`

## VAULT external storage

VAULT connects Google Drive, Microsoft OneDrive, Dropbox, and HTTPS WebDAV.
OAuth providers use authorization-code flow with PKCE and offline refresh
tokens; WebDAV uses an app password. Credentials are AES-256-GCM encrypted with
`INTEGRATION_TOKEN_ENCRYPTION_KEY` before they enter the owner-only Supabase
table. File bytes remain entirely with the provider. Supabase holds a private
metadata index (filename, path, type, size, and modification time) for fast
cross-device tabs and search.

Downloads are streamed through an authenticated, no-store route and uploads are
streamed directly to the provider, capped at 100 MB to match Cloudflare's
smallest zone request limit. Provider writes complete before the metadata index
is refreshed. Google Drive and OneDrive use their recycle bin/trash behavior;
Dropbox follows its recoverable deletion semantics; WebDAV `DELETE` may be
permanent and the UI says so before confirmation. Custom WebDAV URLs must use
HTTPS and cannot target loopback, literal IP, `.local`, or private-network
hosts, reducing SSRF exposure.

Production additionally requires:

- `STORAGE_OAUTH_REDIRECT_ORIGIN` — `https://jarins.com` in production.
- `GOOGLE_STORAGE_CLIENT_ID` and `GOOGLE_STORAGE_CLIENT_SECRET` (calendar/email
  Google values are accepted as fallbacks).
- `MICROSOFT_STORAGE_CLIENT_ID` and `MICROSOFT_STORAGE_CLIENT_SECRET`
  (calendar/email Microsoft values are accepted as fallbacks).
- `DROPBOX_STORAGE_CLIENT_ID` and `DROPBOX_STORAGE_CLIENT_SECRET`.

Register these redirects:

- `https://jarins.com/api/storage/oauth/google-drive/callback`
- `https://jarins.com/api/storage/oauth/onedrive/callback`
- `https://jarins.com/api/storage/oauth/dropbox/callback`

Google's all-files Drive scopes are restricted and may require OAuth app
verification. Dropbox must be configured for Full Dropbox with the read scopes,
and with metadata/content write scopes when Manage mode is offered. OneDrive
uses delegated `Files.Read` or `Files.ReadWrite` plus `offline_access`.

## Deployment

The web app is portable across a Next.js-compatible platform. Supabase should be provisioned in Frankfurt (`eu-central-1`). Cloudflare Workers and DNS serve `jarins.com`; no account IDs or secrets are committed. Production releases use `pnpm deploy:production`, which verifies the repository, applies linked Supabase migrations, and only then deploys the Workers. The operator checklist is in [production-runbook.md](production-runbook.md).

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
