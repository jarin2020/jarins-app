-- ---------------------------------------------------------------------------
-- A person is a conversation too
--
-- Family and each team now open as the conversation they are, but the People
-- tab still showed a verification card: to say one thing to one person you had
-- to make a thread, name it, and pick them out of a list. So the obvious case
-- was the awkward one, and every private word between two people left a
-- differently-named thread behind.
--
-- A pair gets one conversation, the same way a team does. It is keyed on the
-- pair rather than on who started it, so both sides open the same one, and
-- neither can rename it, delete it, or add a third person to it — a direct
-- message that can quietly become a group message is not a direct message.
-- ---------------------------------------------------------------------------

alter table public.message_threads add column direct_key text;

create unique index message_threads_one_per_pair
  on public.message_threads (household_id, workspace, direct_key)
  where direct_key is not null;

-- A direct conversation is neither the household's nor a team's.
alter table public.message_threads
  add constraint message_threads_direct_is_its_own_kind
    check (direct_key is null or (team_id is null and not is_family_thread));

/**
 * The conversation between the caller and one other person, made on demand.
 *
 * Keyed on the ordered pair, so it does not matter who asks first or who asks
 * again — there is one, and both of them are in it. Per workspace, because
 * Personal and Professional are separate places to talk rather than one place
 * with a filter.
 */
create function public.ensure_direct_message_thread(
  target_user uuid,
  thread_workspace text default 'personal'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.assert_current_household_collaborator();
  pair_key text;
  direct_thread uuid;
begin
  if thread_workspace not in ('personal', 'professional') then
    raise exception 'Unknown workspace';
  end if;
  if target_user = auth.uid() then
    raise exception 'You cannot start a conversation with yourself';
  end if;
  if not public.is_verified_household_user(target_household, target_user) then
    raise exception 'You can only message verified people in your household';
  end if;

  pair_key := least(auth.uid()::text, target_user::text)
              || ':' || greatest(auth.uid()::text, target_user::text);

  select id into direct_thread
  from public.message_threads
  where household_id = target_household
    and workspace = thread_workspace
    and direct_key = pair_key;
  if direct_thread is not null then return direct_thread; end if;

  insert into public.message_threads
    (household_id, title, created_by, workspace, direct_key)
  values (target_household, 'Direct message', auth.uid(),
          thread_workspace, pair_key)
  returning id into direct_thread;

  -- Both plain members: `can_manage_message_thread` is what gates renaming,
  -- deleting and adding people, so a pair conversation stays a pair
  -- conversation without a single extra guard being written.
  insert into public.message_thread_members
    (thread_id, user_id, member_role, direct_member, added_by, last_read_at)
  values (direct_thread, auth.uid(), 'member', true, auth.uid(), now()),
         (direct_thread, target_user, 'member', true, auth.uid(), null);

  return direct_thread;
end $$;

revoke execute on function public.ensure_direct_message_thread(uuid, text)
  from public, anon;
grant execute on function public.ensure_direct_message_thread(uuid, text)
  to authenticated;

-- The pair is the identity of the conversation, so it cannot be edited into
-- somebody else's. Extended rather than duplicated: one trigger already guards
-- this table, and two would have to agree with each other forever.
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
    if old.direct_key is not null and exists (
      select 1 from public.households where id = old.household_id
    ) then
      raise exception 'A direct conversation belongs to both people in it';
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

  if old.direct_key is distinct from new.direct_key then
    raise exception 'A conversation cannot change who it is between';
  end if;

  return new;
end $$;
