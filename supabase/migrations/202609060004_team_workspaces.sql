-- ---------------------------------------------------------------------------
-- Teams as a place to work, not just a list to message
--
-- `message_teams` existed to address several people at once. It had no roles of
-- its own — "who can manage this team" meant the creator or the household
-- owner — and nothing could be assigned to a team, so a team was a mailing list
-- with a name.
--
-- Three things change.
--
-- 1. Membership carries a role. 'owner' can add and remove people, hand the
--    role on, and assign work; 'member' can see the team and finish what is
--    theirs. The existing implicit rule is preserved exactly: whoever created a
--    team, and the household owner, still manage it — the stored role is an
--    addition to that, not a replacement, so nobody loses access.
--
-- 2. A life record can belong to a team and name an assignee.
--
-- 3. The record policies learn about both. Until now every module outside
--    ('family','home') was author-only, which is right for a private pipeline
--    and wrong for work handed to somebody: an assignee who cannot read the
--    task has not been assigned anything.
-- ---------------------------------------------------------------------------

alter table public.message_team_members
  add column member_role public.message_member_role not null default 'member';

-- Whoever made a team is its owner. Without this every existing team would have
-- members but no owner, and the new role checks would answer "nobody".
update public.message_team_members tm
set member_role = 'owner'
from public.message_teams t
where t.id = tm.team_id and t.created_by = tm.user_id;

create or replace function public.is_message_team_member(target_team uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_team_members m
    where m.team_id = target_team and m.user_id = auth.uid()
  )
$$;

-- Extended, not replaced: creator and household owner keep the access they had,
-- and a stored 'owner' role is a third way in rather than the only one.
create or replace function public.can_manage_message_team(target_team uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_teams t
    where t.id = target_team
      and (t.created_by = auth.uid() or public.is_household_owner(t.household_id))
  ) or exists (
    select 1 from public.message_team_members m
    where m.team_id = target_team
      and m.user_id = auth.uid()
      and m.member_role = 'owner'
  )
$$;

revoke execute on function public.is_message_team_member(uuid) from public, anon;
grant execute on function public.is_message_team_member(uuid) to authenticated;

-- An owner changes roles through this rather than through the table, so the
-- last owner cannot be demoted and a team left with nobody who can manage it.
create or replace function public.set_message_team_role(
  target_team uuid,
  target_user uuid,
  target_role public.message_member_role
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  remaining integer;
begin
  if not public.can_manage_message_team(target_team) then
    raise exception 'Only a team owner can change roles';
  end if;
  if target_role = 'member' then
    select count(*) into remaining
    from public.message_team_members
    where team_id = target_team and member_role = 'owner' and user_id <> target_user;
    if remaining = 0 then
      raise exception 'A team needs at least one owner';
    end if;
  end if;
  update public.message_team_members
  set member_role = target_role
  where team_id = target_team and user_id = target_user;
  if not found then raise exception 'That person is not in this team'; end if;
end $$;

revoke execute on function public.set_message_team_role(uuid, uuid, public.message_member_role)
  from public, anon;
grant execute on function public.set_message_team_role(uuid, uuid, public.message_member_role)
  to authenticated;

-- The creator of a team owns it. The backfill above fixes the teams that
-- already exist; this is what keeps it true for the ones made from now on,
-- and it is why a team is never created without somebody who can manage it.
create or replace function public.create_message_team(team_name text, member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  -- Keeps the Viewer guard from 202609050001: a Viewer cannot create a team.
  target_household uuid := public.assert_current_household_collaborator();
  new_team uuid;
begin
  if length(trim(team_name)) not between 1 and 100 then raise exception 'Enter a team name'; end if;
  if exists (
    select 1 from unnest(coalesce(member_ids, array[]::uuid[])) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every team member must be a verified household account'; end if;
  insert into public.message_teams (household_id, name, created_by)
  values (target_household, trim(team_name), auth.uid()) returning id into new_team;
  insert into public.message_team_members (team_id, user_id, added_by, member_role)
  select new_team, selected.user_id, auth.uid(),
         case when selected.user_id = auth.uid() then 'owner' else 'member' end::public.message_member_role
  from (select distinct unnest(coalesce(member_ids, array[]::uuid[])) as user_id) selected;
  -- The creator belongs to the team whether or not they listed themselves.
  insert into public.message_team_members (team_id, user_id, added_by, member_role)
  values (new_team, auth.uid(), auth.uid(), 'owner')
  on conflict (team_id, user_id) do update set member_role = 'owner';
  return new_team;
end $$;

-- `update_message_team` replaces the member list wholesale, which would drop
-- the roles it does not know about. Preserve them, and never let the edit
-- remove the last owner.
create or replace function public.update_message_team(
  target_team uuid,
  team_name text,
  member_ids uuid[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid;
  kept uuid[] := coalesce(member_ids, array[]::uuid[]);
begin
  if not public.can_manage_message_team(target_team) then
    raise exception 'Only a team owner can change this team';
  end if;
  if length(trim(team_name)) not between 1 and 100 then raise exception 'Enter a team name'; end if;
  select household_id into target_household from public.message_teams where id = target_team;
  if exists (
    select 1 from unnest(kept) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every team member must be a verified household account'; end if;
  if not exists (
    select 1 from public.message_team_members m
    where m.team_id = target_team and m.member_role = 'owner'
      and m.user_id = any(kept)
  ) then raise exception 'A team needs at least one owner'; end if;

  update public.message_teams
  set name = trim(team_name), updated_at = now()
  where id = target_team;
  delete from public.message_team_members
  where team_id = target_team and not (user_id = any(kept));
  insert into public.message_team_members (team_id, user_id, added_by)
  select target_team, selected.user_id, auth.uid()
  from (select distinct unnest(kept) as user_id) selected
  on conflict (team_id, user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Work that belongs to a team
-- ---------------------------------------------------------------------------

alter table public.life_records
  add column team_id uuid references public.message_teams(id) on delete set null,
  add column assignee_user_id uuid references auth.users(id) on delete set null;

create index life_records_team_idx on public.life_records(team_id)
  where team_id is not null;
create index life_records_assignee_idx on public.life_records(assignee_user_id)
  where assignee_user_id is not null;

drop policy if exists "records readable" on public.life_records;
drop policy if exists "records insertable" on public.life_records;
drop policy if exists "records updatable" on public.life_records;
drop policy if exists "records deletable" on public.life_records;

create policy "records readable" on public.life_records for select using (
  (module in ('family', 'home') and public.is_household_member(household_id))
  or (module not in ('family', 'home') and (
        created_by = auth.uid()
        -- Assigned work has to be legible to the team it was assigned to.
        or (team_id is not null and public.is_message_team_member(team_id))
      ))
);

create policy "records insertable" on public.life_records for insert with check (
  created_by = auth.uid()
  and public.is_household_member(household_id)
  and (
    module not in ('family', 'home')
    or public.can_collaborate_in_household(household_id)
  )
  -- You cannot file work into a team you are not in.
  and (team_id is null or public.is_message_team_member(team_id))
);

create policy "records updatable" on public.life_records for update using (
  (module in ('family', 'home') and public.can_collaborate_in_household(household_id))
  or (module not in ('family', 'home') and (
        created_by = auth.uid()
        -- The assignee can move their own task along; a team owner can move
        -- anybody's. A plain member cannot rewrite someone else's work.
        or assignee_user_id = auth.uid()
        or (team_id is not null and public.can_manage_message_team(team_id))
      ))
) with check (
  (module in ('family', 'home') and public.can_collaborate_in_household(household_id))
  or (module not in ('family', 'home') and (
        created_by = auth.uid()
        or assignee_user_id = auth.uid()
        or (team_id is not null and public.can_manage_message_team(team_id))
      ))
);

create policy "records deletable" on public.life_records for delete using (
  (module in ('family', 'home') and public.can_collaborate_in_household(household_id))
  or (module not in ('family', 'home') and (
        created_by = auth.uid()
        or (team_id is not null and public.can_manage_message_team(team_id))
      ))
);
