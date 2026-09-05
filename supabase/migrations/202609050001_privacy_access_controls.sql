-- Make the documented privacy model enforceable at the database boundary.
-- Family and Home records are household-shared; every other life-record module
-- is private to its author. A Viewer can read shared data but cannot mutate it.

create or replace function public.can_collaborate_in_household(
  target_household uuid,
  target_user uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members member
    where member.household_id = target_household
      and member.user_id = target_user
      and member.role <> 'viewer'
  ) or exists (
    select 1
    from public.households household
    where household.id = target_household
      and household.owner_user_id = target_user
  )
$$;

revoke execute on function public.can_collaborate_in_household(uuid, uuid)
  from public, anon;
grant execute on function public.can_collaborate_in_household(uuid, uuid)
  to authenticated;

drop policy if exists "records readable" on public.life_records;
drop policy if exists "records insertable" on public.life_records;
drop policy if exists "records updatable" on public.life_records;
drop policy if exists "records deletable" on public.life_records;

create policy "records readable" on public.life_records for select using (
  (module in ('family', 'home') and public.is_household_member(household_id))
  or (module not in ('family', 'home') and created_by = auth.uid())
);
create policy "records insertable" on public.life_records for insert with check (
  created_by = auth.uid()
  and public.is_household_member(household_id)
  and (
    module not in ('family', 'home')
    or public.can_collaborate_in_household(household_id)
  )
);
create policy "records updatable" on public.life_records for update using (
  (module in ('family', 'home') and public.can_collaborate_in_household(household_id))
  or (module not in ('family', 'home') and created_by = auth.uid())
) with check (
  (module in ('family', 'home') and public.can_collaborate_in_household(household_id))
  or (module not in ('family', 'home') and created_by = auth.uid())
);
create policy "records deletable" on public.life_records for delete using (
  (module in ('family', 'home') and public.can_collaborate_in_household(household_id))
  or (module not in ('family', 'home') and created_by = auth.uid())
);

-- Household-backed legacy tables are not the main screen store yet, but their
-- policies must agree with the same Viewer contract before modules adopt them.
drop policy if exists "people household access" on public.people;
create policy "people readable" on public.people for select
  using (public.is_household_member(household_id));
create policy "people insertable" on public.people for insert
  with check (public.can_collaborate_in_household(household_id));
create policy "people updatable" on public.people for update
  using (public.can_collaborate_in_household(household_id))
  with check (public.can_collaborate_in_household(household_id));
create policy "people deletable" on public.people for delete
  using (public.can_collaborate_in_household(household_id));

drop policy if exists "life areas insertable" on public.life_areas;
drop policy if exists "life areas updatable" on public.life_areas;
drop policy if exists "life areas deletable" on public.life_areas;
create policy "life areas insertable" on public.life_areas for insert
  with check (household_id is not null and public.can_collaborate_in_household(household_id));
create policy "life areas updatable" on public.life_areas for update
  using (household_id is not null and public.can_collaborate_in_household(household_id))
  with check (household_id is not null and public.can_collaborate_in_household(household_id));
create policy "life areas deletable" on public.life_areas for delete
  using (household_id is not null and public.can_collaborate_in_household(household_id));

drop policy if exists "tasks insertable" on public.tasks;
drop policy if exists "tasks updatable" on public.tasks;
drop policy if exists "tasks deletable" on public.tasks;
create policy "tasks insertable" on public.tasks for insert with check (
  public.can_collaborate_in_household(household_id) and creator_user_id = auth.uid()
);
create policy "tasks updatable" on public.tasks for update
  using (public.can_collaborate_in_household(household_id))
  with check (public.can_collaborate_in_household(household_id));
create policy "tasks deletable" on public.tasks for delete
  using (public.can_collaborate_in_household(household_id));

drop policy if exists "projects insertable" on public.projects;
drop policy if exists "projects updatable" on public.projects;
drop policy if exists "projects deletable" on public.projects;
create policy "projects insertable" on public.projects for insert with check (
  public.can_collaborate_in_household(household_id) and user_id = auth.uid()
);
create policy "projects updatable" on public.projects for update
  using (public.can_collaborate_in_household(household_id))
  with check (public.can_collaborate_in_household(household_id));
create policy "projects deletable" on public.projects for delete
  using (public.can_collaborate_in_household(household_id));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'events', 'routines', 'meal_plans', 'grocery_lists', 'financial_items'
  ] loop
    execute format('drop policy if exists %I on public.%I',
      case table_name
        when 'events' then 'household events'
        when 'routines' then 'household routines'
        when 'meal_plans' then 'household meals'
        when 'grocery_lists' then 'household groceries'
        when 'financial_items' then 'household finances'
      end,
      table_name
    );
    execute format('create policy %I on public.%I for select using (public.is_household_member(household_id))',
      table_name || ' readable', table_name);
    execute format('create policy %I on public.%I for insert with check (public.can_collaborate_in_household(household_id))',
      table_name || ' insertable', table_name);
    execute format('create policy %I on public.%I for update using (public.can_collaborate_in_household(household_id)) with check (public.can_collaborate_in_household(household_id))',
      table_name || ' updatable', table_name);
    execute format('create policy %I on public.%I for delete using (public.can_collaborate_in_household(household_id))',
      table_name || ' deletable', table_name);
  end loop;
end $$;

drop policy if exists "task recurrence through task" on public.task_recurrences;
create policy "task recurrences readable" on public.task_recurrences for select using (
  exists (select 1 from public.tasks task where task.id = task_id
    and public.is_household_member(task.household_id))
);
create policy "task recurrences writable" on public.task_recurrences for all using (
  exists (select 1 from public.tasks task where task.id = task_id
    and public.can_collaborate_in_household(task.household_id))
) with check (
  exists (select 1 from public.tasks task where task.id = task_id
    and public.can_collaborate_in_household(task.household_id))
);

drop policy if exists "routine logs through routine" on public.routine_logs;
create policy "routine logs readable" on public.routine_logs for select using (
  exists (select 1 from public.routines routine where routine.id = routine_id
    and public.is_household_member(routine.household_id))
);
create policy "routine logs writable" on public.routine_logs for all using (
  exists (select 1 from public.routines routine where routine.id = routine_id
    and public.can_collaborate_in_household(routine.household_id))
) with check (
  exists (select 1 from public.routines routine where routine.id = routine_id
    and public.can_collaborate_in_household(routine.household_id))
);

drop policy if exists "grocery items through list" on public.grocery_items;
create policy "grocery items readable" on public.grocery_items for select using (
  exists (select 1 from public.grocery_lists list where list.id = list_id
    and public.is_household_member(list.household_id))
);
create policy "grocery items writable" on public.grocery_items for all using (
  exists (select 1 from public.grocery_lists list where list.id = list_id
    and public.can_collaborate_in_household(list.household_id))
) with check (
  exists (select 1 from public.grocery_lists list where list.id = list_id
    and public.can_collaborate_in_household(list.household_id))
);

-- A Viewer may read normal shared document metadata, but may not upload files.
drop policy if exists "upload documents" on public.documents;
create policy "upload documents" on public.documents for insert with check (
  uploaded_by_user_id = auth.uid()
  and public.can_collaborate_in_household(household_id)
);
drop policy if exists "documents writable" on storage.objects;
create policy "documents writable" on storage.objects for insert with check (
  bucket_id = 'documents-private'
  and public.can_collaborate_in_household(public.safe_uuid((storage.foldername(name))[1]))
);
drop policy if exists "household media writable" on storage.objects;
create policy "household media writable" on storage.objects for insert with check (
  bucket_id in ('avatars','memories-private')
  and public.can_collaborate_in_household(public.safe_uuid((storage.foldername(name))[1]))
);

-- Messaging remains readable to explicitly enrolled Viewers, while all content
-- and membership mutations require collaborative household access.
create or replace function public.can_manage_message_thread(target_thread uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.message_thread_members member
    join public.message_threads thread on thread.id = member.thread_id
    where member.thread_id = target_thread
      and member.user_id = auth.uid()
      and member.member_role = 'owner'
      and public.can_collaborate_in_household(thread.household_id)
  )
$$;

create or replace function public.can_manage_message_team(target_team uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_teams team
    where team.id = target_team
      and (team.created_by = auth.uid() or public.is_household_owner(team.household_id))
      and public.can_collaborate_in_household(team.household_id)
  )
$$;

drop policy if exists "household creates message teams" on public.message_teams;
create policy "household creates message teams" on public.message_teams for insert
  with check (public.can_collaborate_in_household(household_id) and created_by = auth.uid());
drop policy if exists "household creates threads" on public.message_threads;
create policy "household creates threads" on public.message_threads for insert
  with check (public.can_collaborate_in_household(household_id) and created_by = auth.uid());
drop policy if exists "thread members send messages" on public.messages;
create policy "thread members send messages" on public.messages for insert with check (
  sender_user_id = auth.uid()
  and public.is_message_thread_member(thread_id)
  and public.can_collaborate_in_household(household_id)
  and exists (select 1 from public.message_threads thread
              where thread.id = thread_id and thread.household_id = household_id)
);
drop policy if exists "senders edit messages" on public.messages;
create policy "senders edit messages" on public.messages for update
  using (sender_user_id = auth.uid() and public.is_message_thread_member(thread_id)
         and public.can_collaborate_in_household(household_id))
  with check (sender_user_id = auth.uid() and public.is_message_thread_member(thread_id)
              and public.can_collaborate_in_household(household_id));
drop policy if exists "senders delete messages" on public.messages;
create policy "senders delete messages" on public.messages for delete
  using (sender_user_id = auth.uid() and public.is_message_thread_member(thread_id)
         and public.can_collaborate_in_household(household_id));
drop policy if exists "senders add attachments" on public.message_attachments;
create policy "senders add attachments" on public.message_attachments for insert with check (
  uploader_user_id = auth.uid()
  and public.can_collaborate_in_household(household_id)
  and exists (select 1 from public.messages message
              where message.id = message_id and message.sender_user_id = auth.uid()
                and message.household_id = household_id
                and public.is_message_thread_member(message.thread_id))
);
drop policy if exists "thread members upload message files" on storage.objects;
create policy "thread members upload message files" on storage.objects for insert with check (
  bucket_id = 'message-attachments-private'
  and (storage.foldername(name))[3] = auth.uid()::text
  and public.is_message_thread_member(public.safe_uuid((storage.foldername(name))[2]))
  and public.can_collaborate_in_household(public.safe_uuid((storage.foldername(name))[1]))
  and exists (select 1 from public.message_threads thread
              where thread.id = public.safe_uuid((storage.foldername(name))[2])
                and thread.household_id = public.safe_uuid((storage.foldername(name))[1]))
);

-- Security-definer RPCs bypass caller RLS, so they need the same explicit role
-- check as the table policies.
create or replace function public.assert_current_household_collaborator()
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare target_household uuid := public.current_household();
begin
  if auth.uid() is null or target_household is null then
    raise exception 'Sign in first';
  end if;
  if not public.can_collaborate_in_household(target_household) then
    raise exception 'Viewer access is read only';
  end if;
  return target_household;
end $$;

revoke execute on function public.assert_current_household_collaborator()
  from public, anon, authenticated;

-- Rebuild the two creation RPCs with an early collaborator assertion while
-- keeping their public signatures stable for the client and PostgREST cache.
create or replace function public.create_message_team(team_name text, member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
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
  insert into public.message_team_members (team_id, user_id, added_by)
  select new_team, selected.user_id, auth.uid()
  from (select distinct unnest(coalesce(member_ids, array[]::uuid[])) as user_id) selected;
  return new_team;
end $$;

create or replace function public.create_message_thread(
  thread_title text, participant_ids uuid[], team_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.assert_current_household_collaborator();
  new_thread uuid;
begin
  if length(trim(thread_title)) not between 1 and 100 then raise exception 'Enter a thread name'; end if;
  if exists (
    select 1 from unnest(coalesce(participant_ids, array[]::uuid[])) selected(user_id)
    where not public.is_verified_household_user(target_household, selected.user_id)
  ) then raise exception 'Every participant must be a verified household account'; end if;
  if exists (
    select 1 from unnest(coalesce(team_ids, array[]::uuid[])) selected(team_id)
    where not exists (select 1 from public.message_teams team
                      where team.id = selected.team_id and team.household_id = target_household)
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

grant execute on function public.create_message_team(text, uuid[]) to authenticated;
grant execute on function public.create_message_thread(text, uuid[], uuid[]) to authenticated;

-- Existing cached email snippets contain message content. Erase them and keep
-- only envelope metadata; full content remains at the provider until opened.
update public.email_messages set snippet = '' where snippet <> '';

notify pgrst, 'reload schema';
