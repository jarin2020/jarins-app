
-- The 'authenticated' role is created by run.sh; it is cluster-wide and outlives
-- the throwaway test database. It is not the table owner, so RLS applies to it.
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;

-- Two unrelated accounts. The trigger gives each a profile, a household and an
-- owner membership.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'faria@example.test', '{"display_name":"Faria"}'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@example.test', '{}');

-- A third account joined to Faria's household, to test collaboration.
insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'partner@example.test', '{}');
insert into public.household_members (household_id, user_id, role)
  select id, '33333333-3333-3333-3333-333333333333', 'adult'
  from public.households where owner_user_id = '11111111-1111-1111-1111-111111111111';

-- A global life area, the kind S3 let anyone delete.
insert into public.life_areas (household_id, slug, name, color_token, icon)
  values (null, 'family', 'Family', 'green', 'baby');

do $$
declare
  faria    uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner  uuid := '33333333-3333-3333-3333-333333333333';
  n int;
  record_id uuid;
  task_id uuid;
  faria_household uuid;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  -- ============ profile + household bootstrap (S8) ============
  select count(*) into n from public.profiles where id = faria;
  if n <> 1 then raise exception 'FAIL S8: no profile created for new user'; end if;
  select count(*) into n from public.households where owner_user_id = faria;
  if n <> 1 then raise exception 'FAIL S8: no household created for new user'; end if;
  raise notice 'PASS S8  profile and household bootstrap on signup';

  -- ============ life_records isolation ============
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.life_records (module, kind, title, detail, essential)
    values ('family', 'Routine', 'Prepare Kita bags', 'Water bottle and spare clothes', true)
    returning id into record_id;

  select count(*) into n from public.life_records;
  if n <> 1 then raise exception 'FAIL: owner cannot see own record (saw %)', n; end if;

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.life_records;
  if n <> 0 then raise exception 'FAIL: another household leaked % record(s)', n; end if;
  raise notice 'PASS     life_records are invisible across households';

  -- a stranger must not be able to update or delete either
  update public.life_records set title = 'hijacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger updated % row(s)', n; end if;
  delete from public.life_records;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger deleted % row(s)', n; end if;
  raise notice 'PASS     strangers cannot write to another household''s records';

  -- ============ S3: global life areas are read-only ============
  select count(*) into n from public.life_areas where household_id is null;
  if n <> 1 then raise exception 'FAIL S3: global life area not readable (saw %)', n; end if;

  delete from public.life_areas where household_id is null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL S3: stranger deleted % global life area(s)', n; end if;

  update public.life_areas set name = 'hijacked' where household_id is null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL S3: stranger updated % global life area(s)', n; end if;
  raise notice 'PASS S3  global life areas are readable but not writable';

  -- ============ S4: a partner can complete a shared task ============
  perform set_config('request.jwt.claim.sub', faria::text, true);
  insert into public.tasks (household_id, creator_user_id, title)
    values (faria_household, faria, 'Book the Kita appointment')
    returning id into task_id;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  update public.tasks set status = 'done' where id = task_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL S4: partner could not complete a shared task'; end if;
  raise notice 'PASS S4  household members can complete each other''s tasks';

  -- …but cannot rewrite authorship
  update public.tasks set creator_user_id = partner where id = task_id;
  select count(*) into n from public.tasks where id = task_id and creator_user_id = faria;
  if n <> 1 then raise exception 'FAIL S4: creator_user_id was reassignable'; end if;
  raise notice 'PASS S4  creator_user_id is frozen against reassignment';

  -- the same must hold for life_records authorship
  perform set_config('request.jwt.claim.sub', partner::text, true);
  update public.life_records set created_by = partner where id = record_id;
  select count(*) into n from public.life_records where id = record_id and created_by = faria;
  if n <> 1 then raise exception 'FAIL: life_records.created_by was reassignable'; end if;
  raise notice 'PASS     life_records authorship is frozen';

  reset role;
end $$;

-- ============ S5: storage paths agree with the row policies ============
do $$
declare
  faria    uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner  uuid := '33333333-3333-3333-3333-333333333333';
  faria_household uuid;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  insert into storage.objects (bucket_id, name) values
    ('documents-private', faria_household || '/normal/passport-scan.pdf'),
    ('documents-private', faria_household || '/high/tax-id.pdf');

  insert into public.documents
    (household_id, uploaded_by_user_id, title, category, storage_path, mime_type, size_bytes, sensitivity)
  values
    (faria_household, faria, 'Insurance policy', 'Insurance',
     faria_household || '/normal/passport-scan.pdf', 'application/pdf', 1024, 'normal'),
    (faria_household, faria, 'Tax identification', 'Identity',
     faria_household || '/high/tax-id.pdf', 'application/pdf', 2048, 'high');

  set local role authenticated;

  -- the partner shares the household: normal yes, high no
  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from storage.objects where bucket_id = 'documents-private';
  if n <> 1 then raise exception 'FAIL S5: household member saw % objects, expected 1 (normal only)', n; end if;
  raise notice 'PASS S5  household members read normal documents but not high-sensitivity ones';

  -- the uploader sees both
  perform set_config('request.jwt.claim.sub', faria::text, true);
  select count(*) into n from storage.objects where bucket_id = 'documents-private';
  if n <> 2 then raise exception 'FAIL S5: uploader saw % objects, expected 2', n; end if;
  raise notice 'PASS S5  the uploader still reads their own high-sensitivity documents';

  -- a stranger sees nothing
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from storage.objects where bucket_id = 'documents-private';
  if n <> 0 then raise exception 'FAIL S5: stranger saw % document object(s)', n; end if;
  raise notice 'PASS S5  strangers read no documents at all';

  -- a malformed path must deny rather than raise
  reset role;
  insert into storage.objects (bucket_id, name) values ('documents-private', 'not-a-uuid/normal/x.pdf');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  select count(*) into n from storage.objects where name like 'not-a-uuid%';
  if n <> 0 then raise exception 'FAIL S5: malformed path was readable'; end if;
  raise notice 'PASS S5  a malformed storage path denies instead of erroring';

  reset role;
end $$;

-- ============ S9: the audit log now has a writer ============
do $$
declare n int;
begin
  select count(*) into n from public.audit_events where entity_type = 'documents';
  if n < 2 then raise exception 'FAIL S9: audit log recorded % document events, expected >= 2', n; end if;
  select count(*) into n from public.audit_events
    where metadata::text like '%passport%' or metadata::text like '%tax%';
  if n <> 0 then raise exception 'FAIL S9: audit metadata leaked document titles'; end if;
  raise notice 'PASS S9  audit events are written and carry no document metadata';
end $$;

-- ============ generated search vector ============
do $$
declare n int;
begin
  select count(*) into n from public.life_records
    where search @@ to_tsquery('simple', 'kita');
  if n <> 1 then raise exception 'FAIL: full-text search matched % rows, expected 1', n; end if;
  raise notice 'PASS     generated tsvector search works';
end $$;
