-- Household messaging: verified invitations, teams, realtime threads, read
-- receipts, in-app notifications and private attachments.

-- ---------------------------------------------------------------------------
-- Active household + invitations
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column active_household_id uuid references public.households(id) on delete set null;

update public.profiles p
set active_household_id = coalesce(
  (select hm.household_id from public.household_members hm
   where hm.user_id = p.id order by hm.created_at limit 1),
  (select h.id from public.households h
   where h.owner_user_id = p.id order by h.created_at limit 1)
);

create or replace function public.current_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.active_household_id
     from public.profiles p
     where p.id = auth.uid()
       and public.is_household_member(p.active_household_id)),
    (select hm.household_id from public.household_members hm
      where hm.user_id = auth.uid() order by hm.created_at limit 1),
    (select h.id from public.households h
      where h.owner_user_id = auth.uid() order by h.created_at limit 1)
  )
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_household uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  insert into public.households (name, owner_user_id)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'household_name', ''), 'My household'),
    new.id
  )
  returning id into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household, new.id, 'owner');

  update public.profiles
  set active_household_id = new_household
  where id = new.id;

  return new;
end $$;

create table public.household_invitations (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  invited_by      uuid not null references auth.users(id),
  email           text not null check (length(email) between 3 and 320 and email = lower(email)),
  role            public.household_role not null check (role in ('adult', 'viewer')),
  token_hash      bytea not null unique,
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_by     uuid references auth.users(id),
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  check ((accepted_by is null) = (accepted_at is null))
);

create index household_invitations_pending
  on public.household_invitations (household_id, created_at desc)
  where accepted_at is null and revoked_at is null;

alter table public.household_invitations enable row level security;

create policy "owners read invitations" on public.household_invitations
  for select using (public.is_household_owner(household_id));
create or replace function public.create_household_invitation(
  invitee_email text,
  invitee_role public.household_role default 'adult'
) returns table (
  invitation_id uuid,
  invitation_token text,
  email text,
  expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.current_household();
  normalized_email text := lower(trim(invitee_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  created public.household_invitations%rowtype;
begin
  if auth.uid() is null or target_household is null
     or not public.is_household_owner(target_household) then
    raise exception 'Only a household owner can invite participants';
  end if;
  if invitee_role not in ('adult', 'viewer') then
    raise exception 'Invitations can only use adult or viewer access';
  end if;
  if length(normalized_email) not between 3 and 320
     or position('@' in normalized_email) < 2 then
    raise exception 'Enter a valid email address';
  end if;
  if exists (
    select 1 from public.household_members hm
    join auth.users u on u.id = hm.user_id
    where hm.household_id = target_household and lower(u.email) = normalized_email
  ) then raise exception 'That verified account already belongs to this household'; end if;

  update public.household_invitations i
  set revoked_at = now()
  where i.household_id = target_household
    and i.email = normalized_email
    and i.accepted_at is null
    and i.revoked_at is null;

  insert into public.household_invitations
    (household_id, invited_by, email, role, token_hash)
  values
    (target_household, auth.uid(), normalized_email, invitee_role,
     extensions.digest(raw_token, 'sha256'))
  returning * into created;

  return query select created.id, raw_token, created.email, created.expires_at;
end $$;

create or replace function public.revoke_household_invitation(target_invitation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.household_invitations i
    where i.id = target_invitation and public.is_household_owner(i.household_id)
  ) then raise exception 'Only the household owner can revoke this invitation'; end if;
  update public.household_invitations set revoked_at = now()
  where id = target_invitation and accepted_at is null;
end $$;

create or replace function public.get_household_invitation(invitation_token text)
returns table (
  household_name text,
  email text,
  role public.household_role,
  expires_at timestamptz,
  is_available boolean
)
language sql stable security definer set search_path = '' as $$
  select h.name, i.email, i.role, i.expires_at,
         i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  from public.household_invitations i
  join public.households h on h.id = i.household_id
  where length(invitation_token) = 64
    and i.token_hash = extensions.digest(invitation_token, 'sha256')
  limit 1
$$;

create or replace function public.accept_household_invitation(invitation_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invitation public.household_invitations%rowtype;
  account_email text;
  confirmed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to accept this invitation'; end if;

  select lower(u.email), u.email_confirmed_at
  into account_email, confirmed_at
  from auth.users u where u.id = auth.uid();

  if confirmed_at is null then raise exception 'Verify your email before joining'; end if;

  select * into invitation
  from public.household_invitations i
  where length(invitation_token) = 64
    and i.token_hash = extensions.digest(invitation_token, 'sha256')
  for update;

  if invitation.id is null or invitation.accepted_at is not null
     or invitation.revoked_at is not null or invitation.expires_at <= now() then
    raise exception 'This invitation is invalid or no longer available';
  end if;
  if account_email is distinct from invitation.email then
    raise exception 'Sign in with the email address this invitation was sent to';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, auth.uid(), invitation.role)
  on conflict (household_id, user_id) where user_id is not null
  do nothing;

  update public.profiles
  set active_household_id = invitation.household_id
  where id = auth.uid();

  update public.household_invitations
  set accepted_by = auth.uid(), accepted_at = now()
  where id = invitation.id;

  return invitation.household_id;
end $$;

create or replace function public.set_active_household(target_household uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_household_member(target_household) then
    raise exception 'You do not belong to that household';
  end if;
  update public.profiles set active_household_id = target_household where id = auth.uid();
end $$;

create or replace function public.list_household_users()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role public.household_role
)
language sql stable security definer set search_path = '' as $$
  select u.id,
         coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
         u.email,
         hm.role
  from public.household_members hm
  join auth.users u on u.id = hm.user_id and u.email_confirmed_at is not null
  join public.profiles p on p.id = u.id
  where hm.household_id = public.current_household()
    and public.is_household_member(hm.household_id)
  order by lower(coalesce(nullif(p.display_name, ''), u.email))
$$;

-- ---------------------------------------------------------------------------
-- Teams and threads
-- ---------------------------------------------------------------------------

create type public.message_member_role as enum ('owner', 'member');

create table public.message_teams (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.current_household()
                  references public.households(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 100),
  created_by    uuid not null default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.message_team_members (
  team_id       uuid not null references public.message_teams(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  added_by      uuid not null default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.message_threads (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.current_household()
                  references public.households(id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 100),
  created_by    uuid not null default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.message_thread_members (
  thread_id             uuid not null references public.message_threads(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  member_role           public.message_member_role not null default 'member',
  direct_member         boolean not null default true,
  added_by              uuid not null default auth.uid() references auth.users(id),
  last_read_at          timestamptz,
  notifications_enabled boolean not null default true,
  created_at            timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table public.message_thread_teams (
  thread_id    uuid not null references public.message_threads(id) on delete cascade,
  team_id      uuid not null references public.message_teams(id) on delete cascade,
  added_by     uuid not null default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now(),
  primary key (thread_id, team_id)
);

create or replace function public.is_message_thread_member(
  target_thread uuid,
  target_user uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_thread_members m
    where m.thread_id = target_thread and m.user_id = target_user
  )
$$;

create or replace function public.can_manage_message_thread(target_thread uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_thread_members m
    where m.thread_id = target_thread and m.user_id = auth.uid()
      and m.member_role = 'owner'
  )
$$;

create or replace function public.can_manage_message_team(target_team uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_teams t
    where t.id = target_team
      and (t.created_by = auth.uid() or public.is_household_owner(t.household_id))
  )
$$;

create or replace function public.is_verified_household_user(
  target_household uuid,
  target_user uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members hm
    join auth.users u on u.id = hm.user_id
    where hm.household_id = target_household and hm.user_id = target_user
      and u.email_confirmed_at is not null
  )
$$;

alter table public.message_teams enable row level security;
alter table public.message_team_members enable row level security;
alter table public.message_threads enable row level security;
alter table public.message_thread_members enable row level security;
alter table public.message_thread_teams enable row level security;

create policy "household reads message teams" on public.message_teams
  for select using (public.is_household_member(household_id));
create policy "household creates message teams" on public.message_teams
  for insert with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "team managers update message teams" on public.message_teams
  for update using (public.can_manage_message_team(id))
  with check (public.is_household_member(household_id));
create policy "team managers delete message teams" on public.message_teams
  for delete using (public.can_manage_message_team(id));

create policy "household reads message team members" on public.message_team_members
  for select using (exists (
    select 1 from public.message_teams t where t.id = team_id
      and public.is_household_member(t.household_id)
  ));
create policy "team managers add message team members" on public.message_team_members
  for insert with check (public.can_manage_message_team(team_id));
create policy "team managers remove message team members" on public.message_team_members
  for delete using (public.can_manage_message_team(team_id));

create policy "thread members read threads" on public.message_threads
  for select using (public.is_message_thread_member(id));
create policy "household creates threads" on public.message_threads
  for insert with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "thread owners update threads" on public.message_threads
  for update using (public.can_manage_message_thread(id))
  with check (public.is_household_member(household_id));
create policy "thread owners delete threads" on public.message_threads
  for delete using (public.can_manage_message_thread(id));

create policy "thread members read membership" on public.message_thread_members
  for select using (public.is_message_thread_member(thread_id));
create policy "thread owners add membership" on public.message_thread_members
  for insert with check (
    public.can_manage_message_thread(thread_id)
    and exists (
      select 1 from public.message_threads t
      where t.id = thread_id
        and public.is_verified_household_user(t.household_id, user_id)
    )
  );
create policy "thread owners update membership" on public.message_thread_members
  for update using (public.can_manage_message_thread(thread_id));
create policy "thread owners remove membership" on public.message_thread_members
  for delete using (public.can_manage_message_thread(thread_id));

create policy "thread members read linked teams" on public.message_thread_teams
  for select using (public.is_message_thread_member(thread_id));
create policy "thread owners add linked teams" on public.message_thread_teams
  for insert with check (public.can_manage_message_thread(thread_id));
create policy "thread owners remove linked teams" on public.message_thread_teams
  for delete using (public.can_manage_message_thread(thread_id));

create trigger message_teams_touch before update on public.message_teams
  for each row execute function public.set_updated_at();
create trigger message_threads_touch before update on public.message_threads
  for each row execute function public.set_updated_at();

create or replace function public.freeze_message_parentage() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'message_teams' then
    new.household_id := old.household_id;
    new.created_by := old.created_by;
  elsif tg_table_name = 'message_threads' then
    new.household_id := old.household_id;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create trigger message_teams_freeze before update on public.message_teams
  for each row execute function public.freeze_message_parentage();
create trigger message_threads_freeze before update on public.message_threads
  for each row execute function public.freeze_message_parentage();

create or replace function public.freeze_message_membership_identity() returns trigger
language plpgsql as $$
begin
  new.thread_id := old.thread_id;
  new.user_id := old.user_id;
  new.added_by := old.added_by;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger message_thread_members_freeze before update
  on public.message_thread_members for each row
  execute function public.freeze_message_membership_identity();

create or replace function public.validate_message_team_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_household uuid;
begin
  select t.household_id into target_household
  from public.message_teams t where t.id = new.team_id;
  if not public.is_verified_household_user(target_household, new.user_id) then
    raise exception 'Team members must be verified accounts in this household';
  end if;
  return new;
end $$;

create trigger message_team_members_validate before insert or update
  on public.message_team_members for each row
  execute function public.validate_message_team_member();

create or replace function public.validate_message_thread_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.message_threads th
    join public.message_teams tm on tm.id = new.team_id
    where th.id = new.thread_id and th.household_id = tm.household_id
  ) then
    raise exception 'The team and thread must belong to the same household';
  end if;
  return new;
end $$;

create trigger message_thread_teams_validate before insert or update
  on public.message_thread_teams for each row
  execute function public.validate_message_thread_team();

create or replace function public.sync_team_member_to_threads() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.message_thread_members
      (thread_id, user_id, member_role, direct_member, added_by)
    select tt.thread_id, new.user_id, 'member', false, new.added_by
    from public.message_thread_teams tt where tt.team_id = new.team_id
    on conflict (thread_id, user_id) do nothing;
    return new;
  end if;

  delete from public.message_thread_members m
  using public.message_thread_teams affected
  where affected.team_id = old.team_id
    and m.thread_id = affected.thread_id
    and m.user_id = old.user_id
    and m.member_role = 'member'
    and not m.direct_member
    and not exists (
      select 1 from public.message_thread_teams other_link
      join public.message_team_members other_member
        on other_member.team_id = other_link.team_id
       and other_member.user_id = old.user_id
      where other_link.thread_id = m.thread_id
        and other_link.team_id <> old.team_id
    );
  return old;
end $$;

create trigger message_team_members_sync after insert or delete
  on public.message_team_members for each row
  execute function public.sync_team_member_to_threads();

create or replace function public.sync_thread_team_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.message_thread_members
      (thread_id, user_id, member_role, direct_member, added_by)
    select new.thread_id, tm.user_id, 'member', false, new.added_by
    from public.message_team_members tm where tm.team_id = new.team_id
    on conflict (thread_id, user_id) do nothing;
    return new;
  end if;

  delete from public.message_thread_members m
  where m.thread_id = old.thread_id
    and m.member_role = 'member'
    and not m.direct_member
    and exists (
      select 1 from public.message_team_members removed
      where removed.team_id = old.team_id and removed.user_id = m.user_id
    )
    and not exists (
      select 1 from public.message_thread_teams remaining_link
      join public.message_team_members remaining_member
        on remaining_member.team_id = remaining_link.team_id
       and remaining_member.user_id = m.user_id
      where remaining_link.thread_id = old.thread_id
    );
  return old;
end $$;

create trigger message_thread_teams_sync after insert or delete
  on public.message_thread_teams for each row
  execute function public.sync_thread_team_membership();

create or replace function public.create_message_team(team_name text, member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.current_household();
  new_team uuid;
begin
  if auth.uid() is null or target_household is null then raise exception 'Sign in first'; end if;
  if length(trim(team_name)) not between 1 and 100 then raise exception 'Enter a team name'; end if;
  if exists (
    select 1 from unnest(coalesce(member_ids, array[]::uuid[])) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every team member must be a verified household account'; end if;

  insert into public.message_teams (household_id, name, created_by)
  values (target_household, trim(team_name), auth.uid()) returning id into new_team;
  insert into public.message_team_members (team_id, user_id, added_by)
  select new_team, selected.user_id, auth.uid()
  from (select distinct unnest(coalesce(member_ids, array[]::uuid[])) as user_id) selected;
  return new_team;
end $$;

create or replace function public.update_message_team(
  target_team uuid,
  team_name text,
  member_ids uuid[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare target_household uuid;
begin
  if not public.can_manage_message_team(target_team) then raise exception 'Only a team manager can edit it'; end if;
  select household_id into target_household from public.message_teams where id = target_team;
  if length(trim(team_name)) not between 1 and 100 then raise exception 'Enter a team name'; end if;
  if exists (
    select 1 from unnest(coalesce(member_ids, array[]::uuid[])) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every team member must be a verified household account'; end if;

  update public.message_teams set name = trim(team_name) where id = target_team;
  delete from public.message_team_members
  where team_id = target_team
    and user_id <> all(coalesce(member_ids, array[]::uuid[]));
  insert into public.message_team_members (team_id, user_id, added_by)
  select target_team, selected.user_id, auth.uid()
  from (select distinct unnest(coalesce(member_ids, array[]::uuid[])) as user_id) selected
  on conflict (team_id, user_id) do nothing;
end $$;

create or replace function public.create_message_thread(
  thread_title text,
  participant_ids uuid[],
  team_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.current_household();
  new_thread uuid;
begin
  if auth.uid() is null or target_household is null then raise exception 'Sign in first'; end if;
  if length(trim(thread_title)) not between 1 and 100 then raise exception 'Enter a thread name'; end if;
  if exists (
    select 1 from unnest(coalesce(participant_ids, array[]::uuid[])) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every participant must be a verified household account'; end if;
  if exists (
    select 1 from unnest(coalesce(team_ids, array[]::uuid[])) selected(team_id)
    where not exists (select 1 from public.message_teams t
                      where t.id = selected.team_id and t.household_id = target_household)
  ) then raise exception 'Every team must belong to this household'; end if;

  insert into public.message_threads (household_id, title, created_by)
  values (target_household, trim(thread_title), auth.uid()) returning id into new_thread;
  insert into public.message_thread_members
    (thread_id, user_id, member_role, direct_member, added_by, last_read_at)
  values (new_thread, auth.uid(), 'owner', true, auth.uid(), now());
  insert into public.message_thread_members
    (thread_id, user_id, member_role, direct_member, added_by)
  select new_thread, selected.user_id, 'member', true, auth.uid()
  from (select distinct unnest(coalesce(participant_ids, array[]::uuid[])) as user_id) selected
  where selected.user_id <> auth.uid()
  on conflict (thread_id, user_id) do update set direct_member = true;
  insert into public.message_thread_teams (thread_id, team_id, added_by)
  select new_thread, selected.team_id, auth.uid()
  from (select distinct unnest(coalesce(team_ids, array[]::uuid[])) as team_id) selected;
  return new_thread;
end $$;

create or replace function public.update_message_thread(
  target_thread uuid,
  thread_title text,
  participant_ids uuid[],
  team_ids uuid[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare target_household uuid;
begin
  if not public.can_manage_message_thread(target_thread) then raise exception 'Only the thread owner can edit it'; end if;
  select household_id into target_household from public.message_threads where id = target_thread;
  if length(trim(thread_title)) not between 1 and 100 then raise exception 'Enter a thread name'; end if;
  if exists (
    select 1 from unnest(coalesce(participant_ids, array[]::uuid[])) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every participant must be a verified household account'; end if;
  if exists (
    select 1 from unnest(coalesce(team_ids, array[]::uuid[])) selected(team_id)
    where not exists (select 1 from public.message_teams t
                      where t.id = selected.team_id and t.household_id = target_household)
  ) then raise exception 'Every team must belong to this household'; end if;

  update public.message_threads set title = trim(thread_title) where id = target_thread;
  update public.message_thread_members set direct_member = false
  where thread_id = target_thread and member_role = 'member';
  insert into public.message_thread_members
    (thread_id, user_id, member_role, direct_member, added_by)
  select target_thread, selected.user_id, 'member', true, auth.uid()
  from (select distinct unnest(coalesce(participant_ids, array[]::uuid[])) as user_id) selected
  where selected.user_id <> auth.uid()
  on conflict (thread_id, user_id) do update set direct_member = true;
  insert into public.message_thread_teams (thread_id, team_id, added_by)
  select target_thread, selected.team_id, auth.uid()
  from (select distinct unnest(coalesce(team_ids, array[]::uuid[])) as team_id) selected
  on conflict (thread_id, team_id) do nothing;
  delete from public.message_thread_teams
  where thread_id = target_thread and team_id <> all(coalesce(team_ids, array[]::uuid[]));
  delete from public.message_thread_members m
  where m.thread_id = target_thread and m.member_role = 'member' and not m.direct_member
    and not exists (
      select 1 from public.message_thread_teams tt
      join public.message_team_members tm on tm.team_id = tt.team_id and tm.user_id = m.user_id
      where tt.thread_id = target_thread
    );
end $$;

-- ---------------------------------------------------------------------------
-- Messages, receipts, notifications and attachments
-- ---------------------------------------------------------------------------

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  thread_id       uuid not null references public.message_threads(id) on delete cascade,
  sender_user_id  uuid not null default auth.uid() references auth.users(id),
  body            text not null default '' check (length(body) <= 4000),
  reply_to_id     uuid references public.messages(id) on delete set null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);

create index messages_thread_timeline on public.messages (thread_id, created_at);

create table public.message_attachments (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  message_id      uuid not null references public.messages(id) on delete cascade,
  uploader_user_id uuid not null default auth.uid() references auth.users(id),
  storage_path    text not null unique,
  file_name       text not null check (length(file_name) between 1 and 255),
  mime_type       text not null check (length(mime_type) between 1 and 160),
  size_bytes      bigint not null check (size_bytes between 1 and 20971520),
  created_at      timestamptz not null default now()
);

create table public.message_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  thread_id   uuid not null references public.message_threads(id) on delete cascade,
  message_id  uuid not null references public.messages(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, message_id)
);

create index message_notifications_unread
  on public.message_notifications (user_id, created_at desc) where read_at is null;

alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_notifications enable row level security;

create policy "thread members read messages" on public.messages
  for select using (public.is_message_thread_member(thread_id));
create policy "thread members send messages" on public.messages
  for insert with check (
    sender_user_id = auth.uid()
    and public.is_message_thread_member(thread_id)
    and exists (select 1 from public.message_threads t
                where t.id = thread_id and t.household_id = household_id)
  );
create policy "senders edit messages" on public.messages
  for update using (sender_user_id = auth.uid() and public.is_message_thread_member(thread_id))
  with check (sender_user_id = auth.uid() and public.is_message_thread_member(thread_id));
create policy "senders delete messages" on public.messages
  for delete using (sender_user_id = auth.uid() and public.is_message_thread_member(thread_id));

create policy "thread members read attachments" on public.message_attachments
  for select using (exists (
    select 1 from public.messages m where m.id = message_id
      and public.is_message_thread_member(m.thread_id)
  ));
create policy "senders add attachments" on public.message_attachments
  for insert with check (
    uploader_user_id = auth.uid()
    and exists (select 1 from public.messages m
                where m.id = message_id and m.sender_user_id = auth.uid()
                  and m.household_id = household_id
                  and public.is_message_thread_member(m.thread_id))
  );
create policy "uploaders remove attachments" on public.message_attachments
  for delete using (uploader_user_id = auth.uid());

create policy "users read own message notifications" on public.message_notifications
  for select using (user_id = auth.uid());
create policy "users update own message notifications" on public.message_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own message notifications" on public.message_notifications
  for delete using (user_id = auth.uid());

create or replace function public.validate_message_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.messages parent
    where parent.id = new.reply_to_id and parent.thread_id = new.thread_id
  ) then raise exception 'A reply must reference a message in the same thread'; end if;
  return new;
end $$;

create trigger messages_validate_reply before insert or update on public.messages
  for each row execute function public.validate_message_reply();

create or replace function public.freeze_message_identity() returns trigger
language plpgsql as $$
begin
  new.household_id := old.household_id;
  new.thread_id := old.thread_id;
  new.sender_user_id := old.sender_user_id;
  new.created_at := old.created_at;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;

create trigger messages_freeze_identity before update on public.messages
  for each row execute function public.freeze_message_identity();

create or replace function public.validate_message_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent public.messages%rowtype;
begin
  select * into parent from public.messages where id = new.message_id;
  if parent.id is null
    or new.household_id <> parent.household_id
    or new.uploader_user_id <> parent.sender_user_id
    or (storage.foldername(new.storage_path))[1] <> parent.household_id::text
    or (storage.foldername(new.storage_path))[2] <> parent.thread_id::text
    or (storage.foldername(new.storage_path))[3] <> new.uploader_user_id::text then
    raise exception 'Attachment metadata does not match its message storage path';
  end if;
  return new;
end $$;

create trigger message_attachments_validate before insert or update
  on public.message_attachments for each row
  execute function public.validate_message_attachment();

create or replace function public.freeze_message_notification() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.thread_id := old.thread_id;
  new.message_id := old.message_id;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger message_notifications_freeze before update
  on public.message_notifications for each row
  execute function public.freeze_message_notification();

create or replace function public.deliver_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.message_threads set updated_at = new.created_at where id = new.thread_id;
  insert into public.message_notifications (user_id, thread_id, message_id)
  select tm.user_id, new.thread_id, new.id
  from public.message_thread_members tm
  where tm.thread_id = new.thread_id and tm.user_id <> new.sender_user_id
    and tm.notifications_enabled
  on conflict (user_id, message_id) do nothing;
  return new;
end $$;

create trigger messages_deliver after insert on public.messages
  for each row execute function public.deliver_message();

create or replace function public.mark_message_thread_read(target_thread uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_message_thread_member(target_thread) then
    raise exception 'You do not belong to that thread';
  end if;
  update public.message_thread_members
  set last_read_at = now()
  where thread_id = target_thread and user_id = auth.uid();
  update public.message_notifications
  set read_at = now()
  where thread_id = target_thread and user_id = auth.uid() and read_at is null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments-private',
  'message-attachments-private',
  false,
  20971520,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Path: <household_id>/<thread_id>/<uploader_user_id>/<random_uuid>
create policy "thread members read message files" on storage.objects
  for select using (
    bucket_id = 'message-attachments-private'
    and public.is_message_thread_member(public.safe_uuid((storage.foldername(name))[2]))
    and exists (
      select 1 from public.message_threads t
      where t.id = public.safe_uuid((storage.foldername(name))[2])
        and t.household_id = public.safe_uuid((storage.foldername(name))[1])
    )
  );
create policy "thread members upload message files" on storage.objects
  for insert with check (
    bucket_id = 'message-attachments-private'
    and (storage.foldername(name))[3] = auth.uid()::text
    and public.is_message_thread_member(public.safe_uuid((storage.foldername(name))[2]))
    and exists (
      select 1 from public.message_threads t
      where t.id = public.safe_uuid((storage.foldername(name))[2])
        and t.household_id = public.safe_uuid((storage.foldername(name))[1])
    )
  );
create policy "uploaders remove message files" on storage.objects
  for delete using (
    bucket_id = 'message-attachments-private'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

-- Realtime Postgres Changes still respects each subscriber's RLS policies.
alter publication supabase_realtime add table public.message_teams;
alter publication supabase_realtime add table public.message_team_members;
alter publication supabase_realtime add table public.message_threads;
alter publication supabase_realtime add table public.message_thread_members;
alter publication supabase_realtime add table public.message_thread_teams;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_attachments;
alter publication supabase_realtime add table public.message_notifications;
alter publication supabase_realtime add table public.household_invitations;

grant select on public.household_invitations to authenticated;
grant select, insert, update, delete on public.message_teams to authenticated;
grant select, insert, update, delete on public.message_team_members to authenticated;
grant select, insert, update, delete on public.message_threads to authenticated;
grant select, insert, update, delete on public.message_thread_members to authenticated;
grant select, insert, update, delete on public.message_thread_teams to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.message_attachments to authenticated;
grant select, update, delete on public.message_notifications to authenticated;

revoke execute on function public.create_household_invitation(text, public.household_role) from public, anon;
revoke execute on function public.revoke_household_invitation(uuid) from public, anon;
revoke execute on function public.accept_household_invitation(text) from public, anon;
revoke execute on function public.set_active_household(uuid) from public, anon;
revoke execute on function public.list_household_users() from public, anon;
revoke execute on function public.create_message_team(text, uuid[]) from public, anon;
revoke execute on function public.update_message_team(uuid, text, uuid[]) from public, anon;
revoke execute on function public.create_message_thread(text, uuid[], uuid[]) from public, anon;
revoke execute on function public.update_message_thread(uuid, text, uuid[], uuid[]) from public, anon;
revoke execute on function public.mark_message_thread_read(uuid) from public, anon;

grant execute on function public.create_household_invitation(text, public.household_role) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
grant execute on function public.get_household_invitation(text) to anon, authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
grant execute on function public.set_active_household(uuid) to authenticated;
grant execute on function public.list_household_users() to authenticated;
grant execute on function public.create_message_team(text, uuid[]) to authenticated;
grant execute on function public.update_message_team(uuid, text, uuid[]) to authenticated;
grant execute on function public.create_message_thread(text, uuid[], uuid[]) to authenticated;
grant execute on function public.update_message_thread(uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.mark_message_thread_read(uuid) to authenticated;
