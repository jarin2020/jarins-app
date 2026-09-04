-- Minimal stand-ins for the Supabase-managed schemas so the migrations can be
-- executed against a plain Postgres for syntax and logic verification.
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'
);

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

create publication supabase_realtime;

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
