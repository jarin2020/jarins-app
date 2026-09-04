-- Every household has one fixed Family thread. Membership follows verified
-- household membership automatically, so no client can forget to add someone.

alter table public.message_threads
  add column is_family_thread boolean not null default false;

create unique index message_threads_one_family_per_household
  on public.message_threads (household_id)
  where is_family_thread;

create or replace function public.ensure_family_message_thread(
  target_household uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  household_owner uuid;
  family_thread uuid;
begin
  select owner_user_id into household_owner
  from public.households
  where id = target_household;

  if household_owner is null then
    return null;
  end if;

  select id into family_thread
  from public.message_threads
  where household_id = target_household and is_family_thread;

  if family_thread is null then
    insert into public.message_threads
      (household_id, title, created_by, is_family_thread)
    values (target_household, 'Family', household_owner, true)
    on conflict (household_id) where is_family_thread
      do update set title = excluded.title
    returning id into family_thread;
  end if;

  insert into public.message_thread_members
    (thread_id, user_id, member_role, direct_member, added_by)
  select
    family_thread,
    member.user_id,
    case
      when member.user_id = household_owner
        then 'owner'::public.message_member_role
      else 'member'::public.message_member_role
    end,
    true,
    household_owner
  from public.household_members as member
  where member.household_id = target_household
  on conflict (thread_id, user_id) do update
    set member_role = excluded.member_role,
        direct_member = true;

  return family_thread;
end $$;

create or replace function public.protect_family_message_thread()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_family_thread and exists (
      select 1 from public.households where id = old.household_id
    ) then
      raise exception 'The Family thread is a permanent part of the household';
    end if;
    return old;
  end if;

  if old.is_family_thread and (
    new.title is distinct from old.title
    or new.is_family_thread is distinct from old.is_family_thread
  ) then
    raise exception 'The Family thread name and type are fixed';
  end if;

  if not old.is_family_thread and new.is_family_thread then
    raise exception 'Only the system can create a Family thread';
  end if;

  return new;
end $$;

create trigger message_threads_protect_family
  before update or delete on public.message_threads
  for each row execute function public.protect_family_message_thread();

create or replace function public.protect_family_message_membership()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1
    from public.message_threads as thread
    join public.household_members as member
      on member.household_id = thread.household_id
     and member.user_id = old.user_id
    where thread.id = old.thread_id and thread.is_family_thread
  ) then
    raise exception 'Family thread membership follows household membership';
  end if;
  return old;
end $$;

create trigger message_thread_members_protect_family
  before delete on public.message_thread_members
  for each row execute function public.protect_family_message_membership();

create or replace function public.sync_family_message_thread_membership()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.ensure_family_message_thread(new.household_id);
    return new;
  end if;

  delete from public.message_thread_members as member
  using public.message_threads as thread
  where member.thread_id = thread.id
    and thread.household_id = old.household_id
    and thread.is_family_thread
    and member.user_id = old.user_id;
  return old;
end $$;

create trigger household_members_sync_family_thread
  after insert or delete on public.household_members
  for each row execute function public.sync_family_message_thread_membership();

-- Backfill existing households and their current verified members.
do $$
declare
  household record;
begin
  for household in select id from public.households loop
    perform public.ensure_family_message_thread(household.id);
  end loop;
end $$;

-- Remove the household row first so the membership trigger can safely remove
-- the account from the fixed Family thread, then revoke all other message access.
create or replace function public.remove_household_member(target_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.current_household();
  household_owner uuid;
  affected integer;
begin
  if target_household is null or not public.is_household_owner(target_household) then
    raise exception 'Only the household owner can remove members';
  end if;
  select owner_user_id into household_owner
  from public.households where id = target_household;
  if target_user = household_owner then
    raise exception 'The household owner cannot be removed';
  end if;

  delete from public.household_members
  where household_id = target_household and user_id = target_user;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Household member not found'; end if;

  delete from public.message_team_members as team_member
  using public.message_teams as team
  where team_member.team_id = team.id
    and team.household_id = target_household
    and team_member.user_id = target_user;
  delete from public.message_thread_members as thread_member
  using public.message_threads as thread
  where thread_member.thread_id = thread.id
    and thread.household_id = target_household
    and thread_member.user_id = target_user;

  update public.profiles as profile
  set active_household_id = coalesce(
    (
      select member.household_id
      from public.household_members as member
      where member.user_id = target_user
      order by member.created_at
      limit 1
    ),
    (
      select household.id
      from public.households as household
      where household.owner_user_id = target_user
      order by household.created_at
      limit 1
    )
  )
  where profile.id = target_user
    and profile.active_household_id = target_household;
end $$;

-- Unlink a team while its member rows still exist. PostgreSQL does not promise
-- an order for separate cascading foreign keys, so relying on both cascades to
-- clean indirect thread membership can otherwise leave stale access behind.
create or replace function public.unlink_message_team_before_delete()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_thread_teams where team_id = old.id;
  return old;
end $$;

create trigger message_teams_unlink_before_delete
  before delete on public.message_teams
  for each row execute function public.unlink_message_team_before_delete();

revoke execute on function public.ensure_family_message_thread(uuid)
  from public, anon, authenticated;
revoke execute on function public.protect_family_message_thread()
  from public, anon, authenticated;
revoke execute on function public.protect_family_message_membership()
  from public, anon, authenticated;
revoke execute on function public.sync_family_message_thread_membership()
  from public, anon, authenticated;
revoke execute on function public.unlink_message_team_before_delete()
  from public, anon, authenticated;

-- Make newly added columns and RPC functions visible to PostgREST immediately.
notify pgrst, 'reload schema';
