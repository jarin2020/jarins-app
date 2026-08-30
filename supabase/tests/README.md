# Row-level security tests

RLS bugs are the class of defect unit tests never catch: the code is correct,
the policy is wrong, and nothing fails until one household can read another's
documents. These tests assert the boundary directly.

They run against a plain PostgreSQL 17 rather than a full Supabase stack.
`00_supabase_stubs.sql` provides the minimum Supabase surface the migrations
touch — `auth.users`, `auth.uid()`, `storage.objects`, `storage.foldername()` —
so the suite needs no Docker and no Supabase CLI.

```bash
pnpm test:rls          # requires a local postgres on the default socket
```

What is asserted:

| Ref | Assertion                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------- |
| S3  | Global life areas are readable by all, writable by none                                                               |
| S4  | Household members can complete each other's tasks, but cannot reassign authorship                                     |
| S5  | Household members read normal documents; high-sensitivity stays uploader-only; malformed paths deny rather than error |
| S8  | Signing up creates a profile, a household and an owner membership                                                     |
| S9  | Audit events are written, and carry no titles or file names                                                           |
| —   | `life_records` are invisible and unwritable across households                                                         |
| —   | The generated `tsvector` search column matches                                                                        |
