-- ---------------------------------------------------------------------------
-- Conversations belong to a workspace
--
-- Messages showed every thread you were a member of, in both workspaces at
-- once. Personal and professional talk sat in one list, and the only thing
-- separating a note about the school run from a note about a client was the
-- title somebody happened to give it.
--
-- A thread now carries the workspace it was started in, and the two lists are
-- disjoint. Existing threads are placed rather than guessed at: anything wired
-- to a team is professional, and everything else — including the fixed Family
-- thread — is personal, which is where it has been all along.
-- ---------------------------------------------------------------------------

alter table public.message_threads
  add column workspace text not null default 'personal'
    check (workspace in ('personal', 'professional'));

update public.message_threads t
set workspace = 'professional'
where exists (
  select 1 from public.message_thread_teams tt where tt.thread_id = t.id
) and not t.is_family_thread;

-- The Family thread is the household's, so it is personal by definition. A
-- constraint rather than a convention: it is created by a function that takes
-- no workspace, and nothing should be able to move it later.
alter table public.message_threads
  add constraint message_threads_family_is_personal
    check (not is_family_thread or workspace = 'personal');

-- The signature gains a workspace, so the old function is replaced rather than
-- overloaded — two candidates differing only by a defaulted argument make every
-- existing call ambiguous.
drop function if exists public.create_message_thread(text, uuid[], uuid[]);

create function public.create_message_thread(
  thread_title text,
  participant_ids uuid[],
  team_ids uuid[],
  thread_workspace text default 'personal'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.assert_current_household_collaborator();
  new_thread uuid;
begin
  if length(trim(thread_title)) not between 1 and 100 then raise exception 'Enter a thread name'; end if;
  if thread_workspace not in ('personal', 'professional') then
    raise exception 'Unknown workspace';
  end if;
  if exists (
    select 1 from unnest(coalesce(participant_ids, array[]::uuid[])) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every participant must be a verified household account'; end if;
  if exists (
    select 1 from unnest(coalesce(team_ids, array[]::uuid[])) selected(team_id)
    where not exists (select 1 from public.message_teams team
                      where team.id = selected.team_id and team.household_id = target_household)
  ) then raise exception 'Every team must belong to this household'; end if;
  insert into public.message_threads (household_id, title, created_by, workspace)
  values (target_household, trim(thread_title), auth.uid(), thread_workspace)
  returning id into new_thread;
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

revoke execute on function public.create_message_thread(text, uuid[], uuid[], text)
  from public, anon;
grant execute on function public.create_message_thread(text, uuid[], uuid[], text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- One Family, with the members it should have
--
-- Thread membership outlived leaving a household: a person who signed up (and
-- so got a household of their own) and later joined somebody else's kept a seat
-- in the family thread of the household they left. Two "Family" threads, one of
-- them a ghost.
--
-- `remove_household_member` already clears thread membership, so this is for the
-- rows that predate it — and for households nobody was ever formally removed
-- from. It is safe to re-run.
-- ---------------------------------------------------------------------------

delete from public.message_thread_members m
using public.message_threads t
where m.thread_id = t.id
  and t.is_family_thread
  and not exists (
    select 1 from public.household_members hm
    where hm.household_id = t.household_id and hm.user_id = m.user_id
  );

-- The thread itself is left alone. `protect_family_message_thread` refuses to
-- delete a family thread while its household exists, and rightly so — but with
-- its membership corrected the orphan is already unreachable: every read path
-- goes through `is_message_thread_member`, and it now has no members. Deleting
-- it would mean weakening a guard to tidy away a row nobody can see.

/**
 * Re-syncs the Family thread of the household you are in: adds anyone missing,
 * removes anyone who has left. `ensure_family_message_thread` only ever added,
 * which is why a departure could linger.
 */
create or replace function public.sync_family_message_thread()
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.current_household();
  family_thread uuid;
begin
  if target_household is null or not public.is_household_member(target_household) then
    raise exception 'Join a household first';
  end if;
  family_thread := public.ensure_family_message_thread(target_household);
  delete from public.message_thread_members m
  where m.thread_id = family_thread
    and not exists (
      select 1 from public.household_members hm
      where hm.household_id = target_household and hm.user_id = m.user_id
    );
  return family_thread;
end $$;

revoke execute on function public.sync_family_message_thread() from public, anon;
grant execute on function public.sync_family_message_thread() to authenticated;
