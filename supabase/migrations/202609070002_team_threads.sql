-- ---------------------------------------------------------------------------
-- A team is a conversation, not a mailing list with a settings page
--
-- Teams and threads were two unrelated things that happened to share a modal.
-- Selecting a team offered a rename box and a member list; talking to that
-- same group of people meant leaving, creating a thread, picking the team out
-- of a list, and naming it something — after which the team and its
-- conversation drifted apart on their own.
--
-- Every team gets one thread, the way every household already gets a Family
-- one, and its membership follows the team's. The Teams tab can then show the
-- conversation rather than a form, and Threads goes back to being what it is
-- useful for: the groups that do not correspond to a team at all.
-- ---------------------------------------------------------------------------

alter table public.message_threads
  add column team_id uuid references public.message_teams(id) on delete cascade;

create unique index message_threads_one_per_team
  on public.message_threads (team_id)
  where team_id is not null;

-- A team's thread belongs to the professional side, the way Family belongs to
-- the personal one. Both are structural rather than chosen, so both are held by
-- a constraint instead of a convention.
alter table public.message_threads
  add constraint message_threads_team_is_professional
    check (team_id is null or workspace = 'professional');

/**
 * The thread for a team, created on demand and kept in step with its members.
 *
 * Additive on people, like the family equivalent, plus a removal pass — a team
 * you have left should not keep talking in your ear.
 */
create or replace function public.ensure_team_message_thread(target_team uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  team_row public.message_teams%rowtype;
  team_thread uuid;
begin
  select * into team_row from public.message_teams where id = target_team;
  if team_row.id is null then return null; end if;
  if not public.is_message_team_member(target_team)
     and not public.can_manage_message_team(target_team) then
    raise exception 'You are not in that team';
  end if;

  select id into team_thread
  from public.message_threads where team_id = target_team;

  if team_thread is null then
    insert into public.message_threads
      (household_id, title, created_by, workspace, team_id)
    values (team_row.household_id, team_row.name, team_row.created_by,
            'professional', target_team)
    returning id into team_thread;
  else
    -- The thread is the team's, so it carries the team's name.
    update public.message_threads
    set title = team_row.name
    where id = team_thread and title is distinct from team_row.name;
  end if;

  insert into public.message_thread_members
    (thread_id, user_id, member_role, direct_member, added_by)
  select team_thread, m.user_id,
         case when m.member_role = 'owner'
           then 'owner'::public.message_member_role
           else 'member'::public.message_member_role end,
         true, team_row.created_by
  from public.message_team_members m
  where m.team_id = target_team
  on conflict (thread_id, user_id) do update
    set member_role = excluded.member_role, direct_member = true;

  delete from public.message_thread_members tm
  where tm.thread_id = team_thread
    and not exists (
      select 1 from public.message_team_members m
      where m.team_id = target_team and m.user_id = tm.user_id
    );

  return team_thread;
end $$;

revoke execute on function public.ensure_team_message_thread(uuid) from public, anon;
grant execute on function public.ensure_team_message_thread(uuid) to authenticated;

-- A team's thread is as structural as the Family one, so it gets the same
-- protection: it cannot be renamed away from the team or deleted while the team
-- exists. Extended rather than duplicated, because one trigger already guards
-- this table and two would have to agree with each other forever.
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
    if old.team_id is not null and exists (
      select 1 from public.message_teams where id = old.team_id
    ) then
      raise exception 'A team''s conversation belongs to the team. Delete the team instead.';
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

  if old.team_id is distinct from new.team_id then
    raise exception 'A conversation cannot change which team it belongs to';
  end if;

  return new;
end $$;

-- Renaming a team renames its conversation with it.
create or replace function public.sync_team_thread_name()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.message_threads
  set title = new.name
  where team_id = new.id and title is distinct from new.name;
  return new;
end $$;

create trigger message_teams_rename_thread
  after update of name on public.message_teams
  for each row execute function public.sync_team_thread_name();
