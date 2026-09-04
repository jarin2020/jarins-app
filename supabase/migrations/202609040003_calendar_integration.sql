-- Connected calendars. Provider credentials are AES-GCM encrypted by the web
-- worker. Accounts and calendar names stay private to their owner; cached event
-- details become household-readable only when the owner explicitly shares them.

create type public.calendar_provider as enum
  ('google', 'microsoft', 'apple', 'caldav');
create type public.calendar_connection_status as enum
  ('connecting', 'active', 'syncing', 'error');
create type public.calendar_sync_mode as enum ('two-way', 'read-only');

create table public.calendar_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid()
                          references auth.users(id) on delete cascade,
  household_id          uuid not null default public.current_household()
                          references public.households(id) on delete cascade,
  provider              public.calendar_provider not null,
  address               text not null
                          check (length(trim(address)) between 1 and 320),
  label                 text not null check (length(trim(label)) between 1 and 80),
  status                public.calendar_connection_status not null default 'connecting',
  sync_mode             public.calendar_sync_mode not null default 'two-way',
  included              boolean not null default true,
  share_with_household  boolean not null default false,
  provider_account_id   text,
  connection_config     jsonb not null default '{}',
  last_synced_at        timestamptz,
  last_error            text check (last_error is null or length(last_error) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, provider, address)
);

create table public.calendar_credentials (
  account_id        uuid primary key,
  user_id           uuid not null,
  ciphertext        text not null check (length(ciphertext) > 20),
  iv                text not null check (length(iv) > 8),
  key_version       smallint not null default 1 check (key_version > 0),
  updated_at        timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.calendar_accounts(id, user_id) on delete cascade
);

create table public.calendar_oauth_states (
  state_hash          text primary key check (length(state_hash) = 64),
  user_id             uuid not null default auth.uid()
                        references auth.users(id) on delete cascade,
  provider            public.calendar_provider not null
                        check (provider in ('google', 'microsoft')),
  label               text not null check (length(trim(label)) between 1 and 80),
  expected_address    text,
  sync_mode           public.calendar_sync_mode not null default 'two-way',
  included            boolean not null default true,
  share_with_household boolean not null default false,
  verifier_ciphertext text not null,
  verifier_iv         text not null,
  expires_at          timestamptz not null default (now() + interval '10 minutes'),
  used_at             timestamptz,
  created_at          timestamptz not null default now()
);

create table public.calendar_sources (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null,
  user_id               uuid not null,
  provider_calendar_id  text not null,
  name                  text not null check (length(trim(name)) between 1 and 160),
  color                 text check (color is null or length(color) <= 32),
  is_primary            boolean not null default false,
  can_write             boolean not null default true,
  selected              boolean not null default true,
  sync_cursor           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.calendar_accounts(id, user_id) on delete cascade,
  unique (id, user_id),
  unique (account_id, provider_calendar_id)
);

create table public.calendar_events (
  id                    uuid primary key default gen_random_uuid(),
  source_id             uuid not null,
  account_id            uuid not null,
  owner_user_id         uuid not null,
  household_id          uuid references public.households(id) on delete cascade,
  provider_event_id     text not null,
  source_name           text not null check (length(trim(source_name)) between 1 and 160),
  owner_name            text not null check (length(trim(owner_name)) between 1 and 80),
  title                 text not null default '' check (length(title) <= 500),
  description           text not null default '' check (length(description) <= 20000),
  location              text not null default '' check (length(location) <= 1000),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  all_day               boolean not null default false,
  timezone              text not null default 'UTC' check (length(timezone) <= 100),
  status                text not null default 'confirmed'
                          check (status in ('confirmed', 'tentative', 'cancelled')),
  organizer             jsonb,
  attendees             jsonb not null default '[]',
  recurrence            jsonb not null default '[]',
  provider_etag         text,
  provider_url          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (source_id, owner_user_id)
    references public.calendar_sources(id, user_id) on delete cascade,
  foreign key (account_id, owner_user_id)
    references public.calendar_accounts(id, user_id) on delete cascade,
  unique (source_id, provider_event_id),
  check (ends_at >= starts_at)
);

create index calendar_accounts_owner_updated
  on public.calendar_accounts (user_id, updated_at desc);
create index calendar_sources_account_selected
  on public.calendar_sources (account_id, selected);
create index calendar_events_owner_range
  on public.calendar_events (owner_user_id, starts_at, ends_at);
create index calendar_events_household_range
  on public.calendar_events (household_id, starts_at, ends_at)
  where household_id is not null;
create index calendar_oauth_states_expiry
  on public.calendar_oauth_states (expires_at);

alter table public.calendar_accounts enable row level security;
alter table public.calendar_credentials enable row level security;
alter table public.calendar_oauth_states enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.calendar_events enable row level security;

create policy "owners manage calendar accounts" on public.calendar_accounts
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));
create policy "owners manage encrypted calendar credentials" on public.calendar_credentials
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage calendar oauth states" on public.calendar_oauth_states
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage calendar sources" on public.calendar_sources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners and household read shared calendar events" on public.calendar_events
  for select using (
    owner_user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
create policy "owners create calendar events" on public.calendar_events
  for insert with check (
    owner_user_id = auth.uid()
    and (household_id is null or public.is_household_member(household_id))
  );
create policy "owners update calendar events" on public.calendar_events
  for update using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and (household_id is null or public.is_household_member(household_id))
  );
create policy "owners delete calendar events" on public.calendar_events
  for delete using (owner_user_id = auth.uid());

create or replace function public.freeze_calendar_account_identity() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.household_id := old.household_id;
  new.provider := old.provider;
  new.address := old.address;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger calendar_accounts_freeze_identity
before update on public.calendar_accounts for each row
execute function public.freeze_calendar_account_identity();

create or replace function public.freeze_calendar_credential_identity() returns trigger
language plpgsql as $$
begin
  new.account_id := old.account_id;
  new.user_id := old.user_id;
  new.updated_at := now();
  return new;
end $$;

create trigger calendar_credentials_freeze_identity
before update on public.calendar_credentials for each row
execute function public.freeze_calendar_credential_identity();

create or replace function public.freeze_calendar_source_identity() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.account_id := old.account_id;
  new.user_id := old.user_id;
  new.provider_calendar_id := old.provider_calendar_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger calendar_sources_freeze_identity
before update on public.calendar_sources for each row
execute function public.freeze_calendar_source_identity();

create or replace function public.freeze_calendar_event_identity() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.source_id := old.source_id;
  new.account_id := old.account_id;
  new.owner_user_id := old.owner_user_id;
  new.provider_event_id := old.provider_event_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger calendar_events_freeze_identity
before update on public.calendar_events for each row
execute function public.freeze_calendar_event_identity();

alter publication supabase_realtime add table public.calendar_accounts;
alter publication supabase_realtime add table public.calendar_sources;
alter publication supabase_realtime add table public.calendar_events;

grant select, insert, update, delete on public.calendar_accounts to authenticated;
grant select, insert, update, delete on public.calendar_credentials to authenticated;
grant select, insert, update, delete on public.calendar_oauth_states to authenticated;
grant select, insert, update, delete on public.calendar_sources to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
