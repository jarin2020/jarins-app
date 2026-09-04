-- Private connected mailboxes. Provider credentials are encrypted by the web
-- worker before they reach Postgres; message bodies and attachment bytes stay
-- at the provider and are fetched only when the owner opens them.

create type public.email_provider as enum ('gmail', 'outlook', 'custom');
create type public.email_connection_status as enum
  ('connecting', 'active', 'syncing', 'error');

create table public.email_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid()
                          references auth.users(id) on delete cascade,
  provider              public.email_provider not null,
  address               text not null
                          check (length(address) between 3 and 320
                            and address = lower(trim(address))
                            and position('@' in address) > 1),
  label                 text not null check (length(trim(label)) between 1 and 80),
  status                public.email_connection_status not null default 'connecting',
  provider_account_id   text,
  connection_config     jsonb not null default '{}',
  sync_cursor           text,
  last_synced_at        timestamptz,
  last_error            text check (last_error is null or length(last_error) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, provider, address)
);

create table public.email_credentials (
  account_id        uuid primary key,
  user_id           uuid not null,
  ciphertext        text not null check (length(ciphertext) > 20),
  iv                text not null check (length(iv) > 8),
  key_version       smallint not null default 1 check (key_version > 0),
  updated_at        timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.email_accounts(id, user_id) on delete cascade
);

create table public.email_oauth_states (
  state_hash        text primary key check (length(state_hash) = 64),
  user_id           uuid not null default auth.uid()
                      references auth.users(id) on delete cascade,
  provider          public.email_provider not null check (provider <> 'custom'),
  label             text not null check (length(trim(label)) between 1 and 80),
  expected_address  text,
  verifier_ciphertext text not null,
  verifier_iv       text not null,
  expires_at        timestamptz not null default (now() + interval '10 minutes'),
  used_at           timestamptz,
  created_at        timestamptz not null default now()
);

create table public.email_messages (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null,
  user_id               uuid not null,
  provider_message_id   text not null,
  provider_thread_id    text,
  internet_message_id   text,
  subject               text not null default '',
  sender_name           text not null default '',
  sender_address        text not null default '',
  recipients            jsonb not null default '[]',
  received_at           timestamptz not null,
  snippet               text not null default '',
  is_read               boolean not null default false,
  is_starred            boolean not null default false,
  has_attachments       boolean not null default false,
  provider_labels       text[] not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.email_accounts(id, user_id) on delete cascade,
  unique (account_id, provider_message_id)
);

create table public.email_send_events (
  id          bigint generated always as identity primary key,
  account_id  uuid not null,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.email_accounts(id, user_id) on delete cascade
);

create index email_accounts_owner_updated
  on public.email_accounts (user_id, updated_at desc);
create index email_messages_mailbox_received
  on public.email_messages (account_id, received_at desc);
create index email_oauth_states_expiry
  on public.email_oauth_states (expires_at);
create index email_send_events_owner_recent
  on public.email_send_events (user_id, created_at desc);

alter table public.email_accounts enable row level security;
alter table public.email_credentials enable row level security;
alter table public.email_oauth_states enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_send_events enable row level security;

create policy "owners manage email accounts" on public.email_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage encrypted email credentials" on public.email_credentials
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage email oauth states" on public.email_oauth_states
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage cached email metadata" on public.email_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.claim_email_send_slot(target_account uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare recent_count int;
begin
  if auth.uid() is null or not exists (
    select 1 from public.email_accounts a
    where a.id = target_account and a.user_id = auth.uid()
  ) then raise exception 'Email account not found'; end if;

  -- Serialize the small per-user counter so concurrent requests cannot race
  -- past the limit. Twenty sends per hour is ample for this private family app.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(auth.uid()::text)
  );
  delete from public.email_send_events
  where user_id = auth.uid() and created_at < now() - interval '24 hours';
  select count(*) into recent_count
  from public.email_send_events
  where user_id = auth.uid() and created_at >= now() - interval '1 hour';
  if recent_count >= 20 then
    raise exception 'Email send limit reached. Try again later';
  end if;
  insert into public.email_send_events (account_id, user_id)
  values (target_account, auth.uid());
end $$;

create or replace function public.freeze_email_account_identity() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.provider := old.provider;
  new.address := old.address;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger email_accounts_freeze_identity before update on public.email_accounts
  for each row execute function public.freeze_email_account_identity();

create or replace function public.freeze_email_credential_identity() returns trigger
language plpgsql as $$
begin
  new.account_id := old.account_id;
  new.user_id := old.user_id;
  new.updated_at := now();
  return new;
end $$;

create trigger email_credentials_freeze_identity before update on public.email_credentials
  for each row execute function public.freeze_email_credential_identity();

create or replace function public.freeze_email_message_identity() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.account_id := old.account_id;
  new.user_id := old.user_id;
  new.provider_message_id := old.provider_message_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger email_messages_freeze_identity before update on public.email_messages
  for each row execute function public.freeze_email_message_identity();

alter publication supabase_realtime add table public.email_accounts;
alter publication supabase_realtime add table public.email_messages;

grant select, insert, update, delete on public.email_accounts to authenticated;
grant select, insert, update, delete on public.email_credentials to authenticated;
grant select, insert, update, delete on public.email_oauth_states to authenticated;
grant select, insert, update, delete on public.email_messages to authenticated;

revoke execute on function public.claim_email_send_slot(uuid) from public, anon;
grant execute on function public.claim_email_send_slot(uuid) to authenticated;
