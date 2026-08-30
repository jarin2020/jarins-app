-- Phase 1: close the RLS holes found in the readiness audit, add the triggers the
-- schema assumed but never had, and introduce the life_records table the app
-- actually stores its data in.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A malformed storage path must deny access, not abort the query. A bare
-- `::uuid` cast on a non-uuid folder name raises, which surfaces as a 500
-- rather than a clean denial.
create or replace function public.safe_uuid(value text) returns uuid
language plpgsql immutable as $$
begin
  return value::uuid;
exception when others then
  return null;
end $$;

-- The household a signed-in user belongs to. Used as a column default so the
-- client never has to thread household_id through every insert.
create or replace function public.current_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select hm.household_id from public.household_members hm
      where hm.user_id = auth.uid() order by hm.created_at limit 1),
    (select h.id from public.households h
      where h.owner_user_id = auth.uid() order by h.created_at limit 1)
  )
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- S3 — life_areas: any authenticated user could delete global rows
--
-- The old policy was FOR ALL USING (household_id is null or is_member(...)).
-- For DELETE and UPDATE only USING is evaluated, so the null branch that was
-- meant to make global defaults *readable* also made them writable by anyone.
-- ---------------------------------------------------------------------------

drop policy if exists "life areas household access" on public.life_areas;

create policy "life areas readable" on public.life_areas
  for select using (household_id is null or public.is_household_member(household_id));

create policy "life areas insertable" on public.life_areas
  for insert with check (household_id is not null and public.is_household_member(household_id));

create policy "life areas updatable" on public.life_areas
  for update using (household_id is not null and public.is_household_member(household_id))
  with check (household_id is not null and public.is_household_member(household_id));

create policy "life areas deletable" on public.life_areas
  for delete using (household_id is not null and public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- S4 — household members could not edit each other's rows
--
-- creator_user_id / user_id belong in an immutability trigger, not in WITH
-- CHECK: WITH CHECK also runs on UPDATE, so it blocked a partner from ticking
-- off a shared task.
-- ---------------------------------------------------------------------------

drop policy if exists "household tasks" on public.tasks;

create policy "tasks readable" on public.tasks
  for select using (public.is_household_member(household_id));
create policy "tasks insertable" on public.tasks
  for insert with check (public.is_household_member(household_id) and creator_user_id = auth.uid());
create policy "tasks updatable" on public.tasks
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "tasks deletable" on public.tasks
  for delete using (public.is_household_member(household_id));

create or replace function public.freeze_task_creator() returns trigger
language plpgsql as $$
begin
  new.creator_user_id := old.creator_user_id;
  return new;
end $$;

create trigger tasks_freeze_creator before update on public.tasks
  for each row execute function public.freeze_task_creator();

drop policy if exists "household projects" on public.projects;

create policy "projects readable" on public.projects
  for select using (public.is_household_member(household_id));
create policy "projects insertable" on public.projects
  for insert with check (public.is_household_member(household_id) and user_id = auth.uid());
create policy "projects updatable" on public.projects
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "projects deletable" on public.projects
  for delete using (public.is_household_member(household_id));

create or replace function public.freeze_project_owner() returns trigger
language plpgsql as $$
begin
  new.user_id := old.user_id;
  return new;
end $$;

create trigger projects_freeze_owner before update on public.projects
  for each row execute function public.freeze_project_owner();

-- ---------------------------------------------------------------------------
-- S5 — document rows were household-visible but the files were uploader-only
--
-- Path conventions from here on:
--   documents-private/<household_id>/<sensitivity>/<uuid>.<ext>
--   memories-private/<household_id>/<uuid>.<ext>
--   avatars/<household_id>/<uuid>.<ext>
--   career-evidence-private/<user_id>/<uuid>.<ext>   (user-owned, per docs/architecture.md)
-- ---------------------------------------------------------------------------

drop policy if exists "owners read own storage" on storage.objects;
drop policy if exists "owners upload own storage" on storage.objects;
drop policy if exists "owners delete own storage" on storage.objects;

-- Documents: household-readable unless marked high sensitivity, which stays
-- uploader-only to match the "private documents" row policy.
create policy "documents readable" on storage.objects for select using (
  bucket_id = 'documents-private'
  and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
  and (
    (storage.foldername(name))[2] is distinct from 'high'
    or exists (
      select 1 from public.documents d
      where d.storage_path = name and d.uploaded_by_user_id = auth.uid()
    )
  )
);

create policy "documents writable" on storage.objects for insert with check (
  bucket_id = 'documents-private'
  and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
);

create policy "documents removable" on storage.objects for delete using (
  bucket_id = 'documents-private'
  and exists (
    select 1 from public.documents d
    where d.storage_path = name and d.uploaded_by_user_id = auth.uid()
  )
);

-- Avatars and memories: shared across the household, no sensitivity tier.
create policy "household media readable" on storage.objects for select using (
  bucket_id in ('avatars','memories-private')
  and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
);

create policy "household media writable" on storage.objects for insert with check (
  bucket_id in ('avatars','memories-private')
  and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
);

create policy "household media removable" on storage.objects for delete using (
  bucket_id in ('avatars','memories-private')
  and public.is_household_member(public.safe_uuid((storage.foldername(name))[1]))
);

-- Career evidence stays user-owned.
create policy "career evidence readable" on storage.objects for select using (
  bucket_id = 'career-evidence-private' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "career evidence writable" on storage.objects for insert with check (
  bucket_id = 'career-evidence-private' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "career evidence removable" on storage.objects for delete using (
  bucket_id = 'career-evidence-private' and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- S8 — nothing created a profile, and updated_at was never maintained
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_household uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  -- Every life_record hangs off a household, so a user without one cannot save
  -- anything. Create it in the same transaction as the account.
  insert into public.households (name, owner_user_id)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'household_name', ''), 'My household'),
    new.id
  )
  returning id into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household, new.id, 'owner');

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare t text;
begin
  foreach t in array array['profiles','households','people','goals','projects','tasks','documents']
  loop
    execute format(
      'create trigger %I_touch before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The records table the application actually uses
--
-- Deliberately shaped like the client model rather than the normalised tables:
-- several of those cannot hold today's records at all (documents.storage_path
-- is NOT NULL, learning_sessions.program_id is NOT NULL, and clothing, packing
-- lists, memories, maintenance and job readiness have no table). Modules get
-- promoted to their specialised tables as their features mature.
--
-- Three corrections against the localStorage model: money is integer cents
-- rather than a float, search is a generated tsvector rather than a client-side
-- substring scan, and lengths are bounded.
-- ---------------------------------------------------------------------------

create type public.record_status as enum ('open','in-progress','done','paused');

create table public.life_records (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.current_household()
                  references public.households(id) on delete cascade,
  created_by    uuid not null default auth.uid() references auth.users(id),
  module        text not null check (module in ('family','home','self','learning',
                                                'career','money','documents','future')),
  kind          text not null check (length(kind) between 1 and 60),
  title         text not null check (length(title) between 1 and 200),
  detail        text not null default '' check (length(detail) <= 4000),
  date          date,
  status        public.record_status not null default 'open',
  amount_cents  bigint check (amount_cents >= 0),
  currency      text not null default 'EUR',
  progress      smallint check (progress between 0 and 100),
  essential     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (
                  to_tsvector('simple', title || ' ' || detail || ' ' || kind)) stored
);

create index life_records_lookup on public.life_records (household_id, module, date);
create index life_records_essential on public.life_records (household_id) where essential;
create index life_records_search on public.life_records using gin (search);

alter table public.life_records enable row level security;

create policy "records readable" on public.life_records
  for select using (public.is_household_member(household_id));
create policy "records insertable" on public.life_records
  for insert with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "records updatable" on public.life_records
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "records deletable" on public.life_records
  for delete using (public.is_household_member(household_id));

create trigger life_records_touch before update on public.life_records
  for each row execute function public.set_updated_at();

-- created_by is evidence of authorship, not an editable field.
create or replace function public.freeze_record_author() returns trigger
language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.household_id := old.household_id;
  return new;
end $$;

create trigger life_records_freeze_author before update on public.life_records
  for each row execute function public.freeze_record_author();

-- ---------------------------------------------------------------------------
-- S9 — the audit log had no writer, so it was permanently empty
-- ---------------------------------------------------------------------------

create or replace function public.record_audit_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    -- Deliberately no titles, notes or file names: docs/architecture.md forbids
    -- logging document metadata and child notes.
    jsonb_build_object('at', now())
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function public.record_audit_event();
create trigger evidence_audit after insert or update or delete on public.evidence_items
  for each row execute function public.record_audit_event();
create trigger household_members_audit after insert or update or delete on public.household_members
  for each row execute function public.record_audit_event();
