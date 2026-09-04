-- External storage connections. File bytes remain with the provider; Jarins
-- stores only encrypted credentials and a private, searchable metadata index.

create type public.storage_provider as enum
  ('google-drive', 'onedrive', 'dropbox', 'webdav');
create type public.storage_connection_status as enum
  ('connecting', 'active', 'syncing', 'error');
create type public.storage_access_mode as enum ('view', 'manage');
create type public.storage_item_kind as enum ('file', 'folder');

create table public.storage_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid()
                          references auth.users(id) on delete cascade,
  provider              public.storage_provider not null,
  address               text not null
                          check (length(trim(address)) between 1 and 2048),
  label                 text not null check (length(trim(label)) between 1 and 80),
  status                public.storage_connection_status not null default 'connecting',
  access_mode           public.storage_access_mode not null default 'view',
  include_in_search     boolean not null default true,
  provider_account_id   text,
  root_provider_item_id text not null default '',
  connection_config     jsonb not null default '{}',
  sync_cursor           text,
  last_synced_at        timestamptz,
  last_error            text check (last_error is null or length(last_error) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, provider, address)
);

create table public.storage_credentials (
  account_id        uuid primary key,
  user_id           uuid not null,
  ciphertext        text not null check (length(ciphertext) > 20),
  iv                text not null check (length(iv) > 8),
  key_version       smallint not null default 1 check (key_version > 0),
  updated_at        timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.storage_accounts(id, user_id) on delete cascade
);

create table public.storage_oauth_states (
  state_hash          text primary key check (length(state_hash) = 64),
  user_id             uuid not null default auth.uid()
                        references auth.users(id) on delete cascade,
  provider            public.storage_provider not null
                        check (provider in ('google-drive', 'onedrive', 'dropbox')),
  label               text not null check (length(trim(label)) between 1 and 80),
  expected_address    text,
  access_mode         public.storage_access_mode not null default 'view',
  include_in_search   boolean not null default true,
  verifier_ciphertext text not null,
  verifier_iv         text not null,
  expires_at          timestamptz not null default (now() + interval '10 minutes'),
  used_at             timestamptz,
  created_at          timestamptz not null default now()
);

create table public.storage_items (
  id                      uuid primary key default gen_random_uuid(),
  account_id              uuid not null,
  user_id                 uuid not null,
  provider_item_id        text not null,
  parent_provider_item_id text,
  path                    text not null default '' check (length(path) <= 8192),
  name                    text not null check (length(trim(name)) between 1 and 1024),
  item_kind               public.storage_item_kind not null,
  mime_type               text check (mime_type is null or length(mime_type) <= 255),
  size_bytes              bigint check (size_bytes is null or size_bytes >= 0),
  modified_at             timestamptz,
  web_url                 text check (web_url is null or length(web_url) <= 8192),
  provider_etag           text,
  content_hash            text,
  can_download            boolean not null default true,
  can_edit                boolean not null default false,
  search_vector           tsvector generated always as
                            (to_tsvector('simple', name || ' ' || path)) stored,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.storage_accounts(id, user_id) on delete cascade,
  unique (account_id, provider_item_id)
);

create index storage_accounts_owner_updated
  on public.storage_accounts (user_id, updated_at desc);
create index storage_oauth_states_expiry
  on public.storage_oauth_states (expires_at);
create index storage_items_parent
  on public.storage_items (account_id, parent_provider_item_id, item_kind, name);
create index storage_items_owner_modified
  on public.storage_items (user_id, modified_at desc nulls last);
create index storage_items_search on public.storage_items using gin (search_vector);

alter table public.storage_accounts enable row level security;
alter table public.storage_credentials enable row level security;
alter table public.storage_oauth_states enable row level security;
alter table public.storage_items enable row level security;

create policy "owners manage storage accounts" on public.storage_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage encrypted storage credentials" on public.storage_credentials
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage storage oauth states" on public.storage_oauth_states
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage storage metadata" on public.storage_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.freeze_storage_account_identity() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.provider := old.provider;
  new.address := old.address;
  new.provider_account_id := old.provider_account_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger storage_accounts_freeze_identity
before update on public.storage_accounts for each row
execute function public.freeze_storage_account_identity();

create or replace function public.freeze_storage_credential_identity() returns trigger
language plpgsql as $$
begin
  new.account_id := old.account_id;
  new.user_id := old.user_id;
  new.updated_at := now();
  return new;
end $$;

create trigger storage_credentials_freeze_identity
before update on public.storage_credentials for each row
execute function public.freeze_storage_credential_identity();

create or replace function public.freeze_storage_item_identity() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.account_id := old.account_id;
  new.user_id := old.user_id;
  new.provider_item_id := old.provider_item_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger storage_items_freeze_identity
before update on public.storage_items for each row
execute function public.freeze_storage_item_identity();

alter publication supabase_realtime add table public.storage_accounts;
alter publication supabase_realtime add table public.storage_items;

grant select, insert, update, delete on public.storage_accounts to authenticated;
grant select, insert, update, delete on public.storage_credentials to authenticated;
grant select, insert, update, delete on public.storage_oauth_states to authenticated;
grant select, insert, update, delete on public.storage_items to authenticated;
