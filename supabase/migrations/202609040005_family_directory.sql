-- Household directory management used by the Family overview. Owners can
-- change non-owner account roles or remove an account; ownership itself is
-- deliberately immutable through these functions.

create or replace function public.update_household_member_role(
  target_user uuid,
  target_role public.household_role
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.current_household();
  household_owner uuid;
  affected integer;
begin
  if target_household is null or not public.is_household_owner(target_household) then
    raise exception 'Only the household owner can change member access';
  end if;
  select owner_user_id into household_owner
  from public.households where id = target_household;
  if target_user = household_owner or target_role = 'owner' then
    raise exception 'Household ownership cannot be changed here';
  end if;
  if target_role not in ('adult', 'viewer') then
    raise exception 'Account members can use adult or viewer access';
  end if;
  update public.household_members
  set role = target_role
  where household_id = target_household and user_id = target_user;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Household member not found'; end if;
end $$;

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
  -- Household removal is an authorization boundary. Revoke both team-derived
  -- and direct conversation access before removing the household membership.
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
  delete from public.household_members
  where household_id = target_household and user_id = target_user;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Household member not found'; end if;
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

revoke execute on function public.update_household_member_role(uuid, public.household_role)
  from public, anon;
revoke execute on function public.remove_household_member(uuid)
  from public, anon;
grant execute on function public.update_household_member_role(uuid, public.household_role)
  to authenticated;
grant execute on function public.remove_household_member(uuid)
  to authenticated;

-- Postgres does not support ALTER PUBLICATION ... ADD TABLE IF NOT EXISTS.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_members'
  ) then
    alter publication supabase_realtime add table public.household_members;
  end if;
end $$;
