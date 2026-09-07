
-- The 'authenticated' role is created by run.sh; it is cluster-wide and outlives
-- the throwaway test database. It is not the table owner, so RLS applies to it.
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;

-- Two unrelated accounts. The trigger gives each a profile, a household and an
-- owner membership.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'faria@example.test', now(), '{"display_name":"Faria"}'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@example.test', now(), '{}');

-- A third account joined to Faria's household, to test collaboration.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'partner@example.test', now(), '{}'),
  ('44444444-4444-4444-4444-444444444444', 'invitee@example.test', now(), '{"display_name":"Invitee"}'),
  ('55555555-5555-5555-5555-555555555555', 'unverified@example.test', null, '{}');
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
  perform public.set_active_household(faria_household);
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

-- ============ private connected email accounts ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  created_account_id uuid;
  blocked boolean := false;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.email_accounts
    (provider, address, label, status, provider_account_id)
  values ('gmail', 'faria@example.test', 'Personal', 'active', 'provider-faria')
  returning id into created_account_id;

  insert into public.email_credentials
    (account_id, user_id, ciphertext, iv)
  values (created_account_id, faria, repeat('c', 40), repeat('i', 16));

  perform public.claim_email_send_slot(created_account_id);
  select count(*) into n from public.email_send_events
  where account_id = created_account_id;
  if n <> 0 then
    raise exception 'FAIL: direct access exposed internal email rate-limit events';
  end if;

  insert into public.email_messages
    (account_id, user_id, provider_message_id, subject, sender_address,
     received_at, snippet)
  values
    (created_account_id, faria, 'provider-message-1', 'Private mail',
     'sender@example.test', now(), 'Only the mailbox owner can read this');

  select count(*) into n from public.email_messages where account_id = created_account_id;
  if n <> 1 then raise exception 'FAIL: mailbox owner cannot read cached email metadata'; end if;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.email_accounts where id = created_account_id;
  if n <> 0 then raise exception 'FAIL: household partner read a private email account'; end if;
  select count(*) into n from public.email_credentials where account_id = created_account_id;
  if n <> 0 then raise exception 'FAIL: household partner read encrypted email credentials'; end if;
  select count(*) into n from public.email_messages where account_id = created_account_id;
  if n <> 0 then raise exception 'FAIL: household partner read private email metadata'; end if;
  raise notice 'PASS     connected email accounts stay private to their owner';

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    perform public.claim_email_send_slot(created_account_id);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: another user claimed an email send slot'; end if;
  begin
    insert into public.email_messages
      (account_id, user_id, provider_message_id, received_at)
    values (created_account_id, faria, 'spoofed', now());
    raise exception 'FAIL: another user spoofed email metadata ownership';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     email writes cannot spoof another account owner';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.email_accounts
  set user_id = stranger, provider = 'outlook', address = 'changed@example.test'
  where id = created_account_id;
  select count(*) into n from public.email_accounts
  where id = created_account_id and user_id = faria and provider = 'gmail'
    and address = 'faria@example.test';
  if n <> 1 then raise exception 'FAIL: email account identity was mutable'; end if;
  raise notice 'PASS     email account ownership and provider identity are frozen';

  reset role;
end $$;

-- ============ connected calendar privacy + family sharing ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  faria_household uuid;
  created_calendar_account uuid;
  created_calendar_source uuid;
  created_calendar_event uuid;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.calendar_accounts
    (household_id, provider, address, label, status, share_with_household)
  values
    (faria_household, 'google', 'faria@example.test', 'Personal', 'active', true)
  returning id into created_calendar_account;
  insert into public.calendar_credentials
    (account_id, user_id, ciphertext, iv)
  values (created_calendar_account, faria, repeat('c', 40), repeat('i', 16));
  insert into public.calendar_sources
    (account_id, user_id, provider_calendar_id, name, is_primary)
  values (created_calendar_account, faria, 'primary', 'Personal', true)
  returning id into created_calendar_source;
  insert into public.calendar_events
    (source_id, account_id, owner_user_id, household_id, provider_event_id,
     source_name, owner_name, title, starts_at, ends_at)
  values
    (created_calendar_source, created_calendar_account, faria, faria_household, 'provider-event-1',
     'Personal', 'Faria', 'Shared appointment', now(), now() + interval '1 hour')
  returning id into created_calendar_event;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.calendar_events where id = created_calendar_event;
  if n <> 1 then raise exception 'FAIL: household partner could not read a shared calendar event'; end if;
  select count(*) into n from public.calendar_accounts where id = created_calendar_account;
  if n <> 0 then raise exception 'FAIL: household partner read a private calendar account'; end if;
  select count(*) into n from public.calendar_credentials where account_id = created_calendar_account;
  if n <> 0 then raise exception 'FAIL: household partner read calendar credentials'; end if;
  select count(*) into n from public.calendar_sources where id = created_calendar_source;
  if n <> 0 then raise exception 'FAIL: household partner read private calendar source metadata'; end if;
  update public.calendar_events set title = 'hijacked' where id = created_calendar_event;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: household partner edited an external event'; end if;
  raise notice 'PASS     shared calendar events are readable but not editable by household members';

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.calendar_events where id = created_calendar_event;
  if n <> 0 then raise exception 'FAIL: shared calendar event leaked outside its household'; end if;
  begin
    insert into public.calendar_events
      (source_id, account_id, owner_user_id, provider_event_id, source_name,
       owner_name, title, starts_at, ends_at)
    values
      (created_calendar_source, created_calendar_account, faria, 'spoofed', 'Personal', 'Faria', 'Spoofed',
       now(), now() + interval '1 hour');
    raise exception 'FAIL: stranger spoofed calendar event ownership';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     calendar events remain isolated from other households';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.calendar_accounts
  set user_id = stranger, provider = 'microsoft', address = 'changed@example.test'
  where id = created_calendar_account;
  select count(*) into n from public.calendar_accounts
  where id = created_calendar_account and user_id = faria and provider = 'google'
    and address = 'faria@example.test';
  if n <> 1 then raise exception 'FAIL: calendar account identity was mutable'; end if;
  raise notice 'PASS     calendar account ownership and provider identity are frozen';

  reset role;
end $$;

-- ============ private VAULT storage accounts + metadata ==========
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  created_storage_account uuid;
  created_storage_item uuid;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.storage_accounts
    (provider, address, label, status, access_mode, provider_account_id,
     root_provider_item_id)
  values
    ('google-drive', 'faria@example.test', 'Family Drive', 'active', 'manage',
     'provider-faria', 'root')
  returning id into created_storage_account;
  insert into public.storage_credentials
    (account_id, user_id, ciphertext, iv)
  values (created_storage_account, faria, repeat('c', 40), repeat('i', 16));
  insert into public.storage_items
    (account_id, user_id, provider_item_id, parent_provider_item_id, path,
     name, item_kind, mime_type, size_bytes, can_edit)
  values
    (created_storage_account, faria, 'provider-file-1', 'root',
     'Family/Passport scan.pdf', 'Passport scan.pdf', 'file',
     'application/pdf', 1024, true)
  returning id into created_storage_item;

  select count(*) into n from public.storage_items
  where search_vector @@ websearch_to_tsquery('simple', 'passport');
  if n <> 1 then raise exception 'FAIL: VAULT filename search did not match'; end if;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.storage_accounts where id = created_storage_account;
  if n <> 0 then raise exception 'FAIL: household partner read a private VAULT account'; end if;
  select count(*) into n from public.storage_credentials where account_id = created_storage_account;
  if n <> 0 then raise exception 'FAIL: household partner read encrypted VAULT credentials'; end if;
  select count(*) into n from public.storage_items where id = created_storage_item;
  if n <> 0 then raise exception 'FAIL: household partner read private VAULT filenames'; end if;
  raise notice 'PASS     VAULT accounts, credentials and filenames stay owner-private';

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    insert into public.storage_items
      (account_id, user_id, provider_item_id, path, name, item_kind)
    values
      (created_storage_account, faria, 'spoofed', 'Private.txt', 'Private.txt', 'file');
    raise exception 'FAIL: stranger spoofed VAULT metadata ownership';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     VAULT metadata ownership cannot be spoofed';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.storage_accounts
  set user_id = stranger, provider = 'dropbox', address = 'changed@example.test',
      provider_account_id = 'changed-provider'
  where id = created_storage_account;
  select count(*) into n from public.storage_accounts
  where id = created_storage_account and user_id = faria
    and provider = 'google-drive' and address = 'faria@example.test'
    and provider_account_id = 'provider-faria';
  if n <> 1 then raise exception 'FAIL: VAULT account identity was mutable'; end if;
  raise notice 'PASS     VAULT account ownership and provider identity are frozen';

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

-- ============ personal modules + read-only household viewers ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  faria_household uuid;
  private_record uuid;
  shared_record uuid;
  family_thread uuid;
  blocked boolean := false;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  -- This user is the fixture's verified household partner. Viewer must retain
  -- read access while losing every household mutation path.
  update public.household_members
  set role = 'viewer'
  where household_id = faria_household and user_id = partner;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  insert into public.life_records (module, kind, title)
  values ('self', 'Private note', 'Owner-only reflection') returning id into private_record;
  insert into public.life_records (module, kind, title)
  values ('home', 'Shared task', 'Replace the light') returning id into shared_record;
  select id into family_thread from public.message_threads
  where household_id = faria_household and is_family_thread;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.life_records where id = private_record;
  if n <> 0 then raise exception 'FAIL: a partner could read another author''s private module'; end if;
  select count(*) into n from public.life_records where id = shared_record;
  if n <> 1 then raise exception 'FAIL: a Viewer could not read shared Home data'; end if;

  update public.life_records set title = 'Viewer edit' where id = shared_record;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a Viewer edited shared life records'; end if;

  blocked := false;
  begin
    insert into public.life_records (household_id, module, kind, title)
    values (faria_household, 'home', 'Shared task', 'Viewer insert');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a Viewer inserted shared life records'; end if;

  blocked := false;
  begin
    perform public.create_message_team('Viewer team', array[]::uuid[]);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a Viewer created a message team'; end if;

  blocked := false;
  begin
    insert into public.messages (household_id, thread_id, body)
    values (faria_household, family_thread, 'Viewer message');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a Viewer sent a message'; end if;
  raise notice 'PASS     personal records are author-only and Viewer access is read-only';

  reset role;
  update public.household_members
  set role = 'adult'
  where household_id = faria_household and user_id = partner;
end $$;

-- ============ household invitations + messaging ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  invitee uuid := '44444444-4444-4444-4444-444444444444';
  unverified uuid := '55555555-5555-5555-5555-555555555555';
  faria_household uuid;
  invitation_token text;
  created_team_id uuid;
  created_thread_id uuid;
  family_thread_id uuid;
  first_message uuid;
  file_message uuid;
  unverified_token text;
  blocked boolean := false;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  select created.invitation_token into invitation_token
  from public.create_household_invitation('invitee@example.test', 'adult') created;
  if invitation_token is null or length(invitation_token) <> 64 then
    raise exception 'FAIL: invitation did not return a strong bearer token';
  end if;

  perform set_config('request.jwt.claim.sub', invitee::text, true);
  perform public.accept_household_invitation(invitation_token);
  if public.current_household() is distinct from faria_household then
    raise exception 'FAIL: accepting an invitation did not switch the active household';
  end if;
  raise notice 'PASS     verified invitation joins and activates the shared household';

  select id into family_thread_id
  from public.message_threads
  where household_id = faria_household and is_family_thread;
  select count(*) into n
  from public.message_thread_members
  where thread_id = family_thread_id;
  if family_thread_id is null or n <> 3 then
    raise exception 'FAIL: Family thread did not include all three household members (saw %)', n;
  end if;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  blocked := false;
  begin
    delete from public.message_threads where id = family_thread_id;
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: fixed Family thread could be deleted'; end if;
  raise notice 'PASS     Family thread is fixed and automatically includes new members';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  select created.invitation_token into unverified_token
  from public.create_household_invitation('unverified@example.test', 'adult') created;
  perform set_config('request.jwt.claim.sub', unverified::text, true);
  blocked := false;
  begin
    perform public.accept_household_invitation(unverified_token);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an unverified account accepted an invitation'; end if;
  raise notice 'PASS     unverified accounts cannot accept household invitations';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  created_team_id := public.create_message_team('Parents', array[invitee]);
  created_thread_id := public.create_message_thread(
    'Family plans', array[]::uuid[], array[created_team_id]
  );
  select count(*) into n from public.message_thread_members
  where thread_id = created_thread_id;
  if n <> 2 then raise exception 'FAIL: team did not expand to two thread members (saw %)', n; end if;

  insert into public.messages (household_id, thread_id, body)
  values (faria_household, created_thread_id, 'Dinner at six') returning id into first_message;

  perform set_config('request.jwt.claim.sub', invitee::text, true);
  select count(*) into n from public.messages where id = first_message;
  if n <> 1 then raise exception 'FAIL: invited participant did not receive the message'; end if;
  select count(*) into n from public.message_notifications
  where message_id = first_message and read_at is null;
  if n <> 1 then raise exception 'FAIL: recipient did not receive one unread notification'; end if;
  perform public.mark_message_thread_read(created_thread_id);
  select count(*) into n from public.message_notifications
  where message_id = first_message and read_at is null;
  if n <> 0 then raise exception 'FAIL: marking the thread read left an unread notification'; end if;
  raise notice 'PASS     delivery, notifications and read receipts are persisted';

  insert into public.messages (household_id, thread_id, body)
  values (faria_household, created_thread_id, 'The itinerary is attached')
  returning id into file_message;
  insert into storage.objects (bucket_id, name)
  values ('message-attachments-private',
          faria_household || '/' || created_thread_id || '/' || invitee || '/attachment-id');
  insert into public.message_attachments
    (household_id, message_id, uploader_user_id, storage_path, file_name, mime_type, size_bytes)
  values
    (faria_household, file_message, invitee,
     faria_household || '/' || created_thread_id || '/' || invitee || '/attachment-id',
     'itinerary.pdf', 'application/pdf', 1024);
  select count(*) into n from storage.objects
  where bucket_id = 'message-attachments-private';
  if n <> 1 then raise exception 'FAIL: thread member could not access attachment storage'; end if;

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.messages where id = first_message;
  if n <> 0 then raise exception 'FAIL: a different household read a private message'; end if;
  select count(*) into n from storage.objects
  where bucket_id = 'message-attachments-private';
  if n <> 0 then raise exception 'FAIL: a different household read a private attachment'; end if;
  begin
    insert into public.messages (household_id, thread_id, body)
    values (faria_household, created_thread_id, 'intrusion');
    raise exception 'FAIL: a non-member inserted a message';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     message and attachment policies isolate households';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  blocked := false;
  begin
    insert into public.message_thread_members
      (thread_id, user_id, member_role, direct_member, added_by)
    values (created_thread_id, unverified, 'member', true, faria);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: direct membership bypassed account verification'; end if;
  raise notice 'PASS     thread membership rejects unverified accounts at the policy boundary';

  delete from public.message_team_members
  where team_id = created_team_id and user_id = invitee;
  select count(*) into n from public.message_thread_members
  where thread_id = created_thread_id and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: removed team member retained indirect thread access'; end if;
  raise notice 'PASS     team membership changes update thread access';

  insert into public.message_team_members (team_id, user_id, added_by)
  values (created_team_id, invitee, faria);
  delete from public.message_teams where id = created_team_id;
  select count(*) into n from public.message_thread_members
  where thread_id = created_thread_id and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: deleted team retained indirect thread access'; end if;
  select count(*) into n from public.message_thread_teams
  where thread_id = created_thread_id and team_id = created_team_id;
  if n <> 0 then raise exception 'FAIL: deleted team remained linked to its thread'; end if;
  raise notice 'PASS     deleting a team revokes its indirect thread access';

  reset role;
end $$;

-- ============ household directory management ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  invitee uuid := '44444444-4444-4444-4444-444444444444';
  faria_household uuid;
  removal_thread uuid;
  blocked boolean := false;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', faria::text, true);
  perform public.update_household_member_role(partner, 'viewer');
  select count(*) into n from public.household_members
  where household_id = faria_household and user_id = partner and role = 'viewer';
  if n <> 1 then raise exception 'FAIL: owner could not update a household member role'; end if;

  blocked := false;
  begin
    perform public.remove_household_member(faria);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: household owner removed their own membership'; end if;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  blocked := false;
  begin
    perform public.update_household_member_role(invitee, 'viewer');
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: non-owner changed household member access'; end if;

  perform set_config('request.jwt.claim.sub', faria::text, true);
  removal_thread := public.create_message_thread(
    'Removal boundary', array[invitee], array[]::uuid[]
  );
  perform public.remove_household_member(invitee);
  select count(*) into n from public.household_members
  where household_id = faria_household and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: owner could not remove a household member'; end if;
  select count(*) into n from public.message_thread_members
  where thread_id = removal_thread and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: removed member retained direct message access'; end if;
  select count(*) into n
  from public.message_thread_members as member
  join public.message_threads as thread on thread.id = member.thread_id
  where thread.household_id = faria_household
    and thread.is_family_thread
    and member.user_id = invitee;
  if n <> 0 then raise exception 'FAIL: removed member retained Family thread access'; end if;
  raise notice 'PASS     family directory role and removal controls are owner-only';

  reset role;
end $$;

-- ============ profile details and the contact-sharing switch ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  faria_household uuid;
  directory record;
  blocked boolean;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  update public.profiles set
    avatar_path = faria_household || '/' || gen_random_uuid() || '.webp',
    phone = '+49 151 0000000',
    pronouns = 'she/her',
    headline = 'German B2, then marketing',
    location = 'Frankfurt',
    birthday = '1992-04-17',
    accent_color = 'terracotta',
    emergency_contact_name = 'Zaman',
    emergency_contact_phone = '+49 151 1111111',
    emergency_contact_relation = 'Partner',
    links = '[{"platform":"linkedin","url":"https://www.linkedin.com/in/faria","label":"LinkedIn"}]'::jsonb
  where id = faria;

  -- ---- the shape checks are the boundary, not the form ----
  blocked := false;
  begin
    update public.profiles set avatar_path = '../../etc/passwd' where id = faria;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an avatar path outside the household folder was accepted'; end if;

  blocked := false;
  begin
    update public.profiles set accent_color = 'hotpink' where id = faria;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an unknown accent colour was accepted'; end if;

  blocked := false;
  begin
    update public.profiles set links = '[{"platform":"linkedin","url":"javascript:alert(1)"}]'::jsonb
    where id = faria;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a non-http link URL was accepted'; end if;

  blocked := false;
  begin
    update public.profiles set links = (
      select jsonb_agg(jsonb_build_object('platform', 'website', 'url', 'https://example.test/' || i))
      from generate_series(1, 11) i
    ) where id = faria;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: more than ten links were accepted'; end if;

  blocked := false;
  begin
    update public.profiles set links = '{"platform":"website"}'::jsonb where id = faria;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a links value that is not an array was accepted'; end if;

  update public.profiles set links = '[]'::jsonb where id = faria;
  update public.profiles set
    links = '[{"platform":"linkedin","url":"https://www.linkedin.com/in/faria","label":"LinkedIn"}]'::jsonb
  where id = faria;
  raise notice 'PASS     profile detail shape is enforced at the database, not the form';

  -- ---- a household member reads the shared fields ----
  perform set_config('request.jwt.claim.sub', partner::text, true);
  select * into directory from public.list_household_users() where user_id = faria;
  if directory.phone is null or directory.birthday is null
     or directory.emergency_contact_name is null
     or jsonb_array_length(directory.links) <> 1 then
    raise exception 'FAIL: published contact details were withheld from a household member';
  end if;
  if directory.avatar_path is null or directory.headline is null then
    raise exception 'FAIL: identity fields were withheld from a household member';
  end if;
  raise notice 'PASS     published profile details reach the rest of the household';

  -- ---- switching sharing off withholds contact, but not identity ----
  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.profiles set share_contact_with_household = false where id = faria;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select * into directory from public.list_household_users() where user_id = faria;
  if directory.phone is not null or directory.location is not null
     or directory.birthday is not null or directory.bio is not null
     or directory.emergency_contact_name is not null
     or directory.emergency_contact_phone is not null
     or jsonb_array_length(directory.links) <> 0 then
    raise exception 'FAIL: contact details leaked after sharing was switched off';
  end if;
  if directory.display_name is null or directory.avatar_path is null
     or directory.headline is null or directory.accent_color is null then
    raise exception 'FAIL: identity fields disappeared with the contact switch';
  end if;
  raise notice 'PASS     the contact switch withholds contact details and keeps identity';

  -- ---- but the author still reads their own row whole ----
  perform set_config('request.jwt.claim.sub', faria::text, true);
  select * into directory from public.list_household_users() where user_id = faria;
  if directory.phone is null or directory.emergency_contact_phone is null then
    raise exception 'FAIL: a member could not see their own withheld details';
  end if;
  raise notice 'PASS     a member always reads their own directory row whole';

  -- ---- and none of it reaches another household ----
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.list_household_users() where user_id = faria;
  if n <> 0 then raise exception 'FAIL: another household read % directory row(s)', n; end if;
  select count(*) into n from public.profiles where id = faria;
  if n <> 0 then raise exception 'FAIL: profiles are readable outside their owner'; end if;
  raise notice 'PASS     profile details stay inside the household';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.profiles set share_contact_with_household = true where id = faria;
  reset role;
end $$;

-- ============ the professional workspace's modules ============
do $$
declare
  faria   uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  work_record uuid;
  blocked boolean;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  -- All four new modules are accepted where the old constraint refused them.
  insert into public.life_records (module, kind, title) values
    ('work', 'Deadline', 'Ship the onboarding revamp'),
    ('pipeline', 'Application', 'Product marketing, Frankfurt'),
    ('portfolio', 'Case study', 'Reduced churn by a third'),
    ('network', 'Follow-up', 'Coffee with the ex-colleague');
  select id into work_record from public.life_records where module = 'work';
  raise notice 'PASS     professional modules are accepted by life_records';

  blocked := false;
  begin
    insert into public.life_records (module, kind, title)
    values ('astrology', 'Task', 'Not a module');
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an unknown module was accepted'; end if;
  raise notice 'PASS     the module list is still closed';

  -- The point of the split: work is yours, not the household's. Family and Home
  -- stay shared; everything else is author-only, and these four are no
  -- exception just because they are new.
  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.life_records
  where module in ('work', 'pipeline', 'portfolio', 'network');
  if n <> 0 then
    raise exception 'FAIL: a household member read % professional record(s)', n;
  end if;

  update public.life_records set title = 'hijacked' where id = work_record;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a household member wrote to a work record'; end if;
  raise notice 'PASS     professional records are author-only, not household-shared';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  delete from public.life_records
  where module in ('work', 'pipeline', 'portfolio', 'network');
  reset role;
end $$;

-- ============ teams as a place to work ============
do $$
declare
  faria    uuid := '11111111-1111-1111-1111-111111111111';
  partner  uuid := '33333333-3333-3333-3333-333333333333';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  pod uuid;
  task_id uuid;
  solo_id uuid;
  blocked boolean;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  pod := public.create_message_team('Growth pod', array[partner]);

  -- ---- the creator is an owner, the person added is not ----
  select count(*) into n from public.message_team_members
  where team_id = pod and user_id = faria and member_role = 'owner';
  if n <> 1 then raise exception 'FAIL: the team creator is not an owner'; end if;
  select count(*) into n from public.message_team_members
  where team_id = pod and user_id = partner and member_role = 'member';
  if n <> 1 then raise exception 'FAIL: an added person did not default to member'; end if;
  raise notice 'PASS     a team creator owns it and the people added are members';

  -- ---- assigned work reaches the assignee; unassigned work does not ----
  insert into public.life_records (module, kind, title, team_id, assignee_user_id)
  values ('work', 'Deliverable', 'Ship the pricing page', pod, partner)
  returning id into task_id;
  insert into public.life_records (module, kind, title)
  values ('work', 'Focus', 'My own private note')
  returning id into solo_id;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.life_records where id = task_id;
  if n <> 1 then raise exception 'FAIL: an assignee cannot read the task assigned to them'; end if;
  select count(*) into n from public.life_records where id = solo_id;
  if n <> 0 then raise exception 'FAIL: a team-mate read a record with no team on it'; end if;
  raise notice 'PASS     team work is visible to the team, private work stays private';

  -- ---- a member may finish their own task ----
  update public.life_records set status = 'done' where id = task_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: an assignee could not complete their own task'; end if;
  raise notice 'PASS     an assignee can move their own task along';

  -- ---- but not manage the team, nor delete the work ----
  blocked := false;
  begin
    perform public.set_message_team_role(pod, faria, 'member');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a plain member changed a team role'; end if;

  delete from public.life_records where id = task_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a plain member deleted team work'; end if;
  raise notice 'PASS     a plain member cannot manage the team or delete its work';

  -- ---- a team cannot be left with nobody who can manage it ----
  perform set_config('request.jwt.claim.sub', faria::text, true);
  blocked := false;
  begin
    perform public.set_message_team_role(pod, faria, 'member');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: the last owner demoted themselves'; end if;

  perform public.set_message_team_role(pod, partner, 'owner');
  perform public.set_message_team_role(pod, faria, 'member');
  select count(*) into n from public.message_team_members
  where team_id = pod and member_role = 'owner';
  if n <> 1 then raise exception 'FAIL: handing the role on did not work (owners: %)', n; end if;
  raise notice 'PASS     ownership can be handed on, but never dropped entirely';

  -- ---- and none of it crosses the household ----
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.life_records where id = task_id;
  if n <> 0 then raise exception 'FAIL: another household read team work'; end if;
  select count(*) into n from public.message_teams where id = pod;
  if n <> 0 then raise exception 'FAIL: another household saw the team'; end if;
  raise notice 'PASS     teams and their work stay inside the household';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  delete from public.life_records where id in (task_id, solo_id);
  reset role;
end $$;

-- ============ conversations belong to a workspace ============
do $$
declare
  faria   uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  faria_household uuid;
  work_thread uuid;
  home_thread uuid;
  blocked boolean;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  home_thread := public.create_message_thread('Kitchen', array[partner], array[]::uuid[]);
  work_thread := public.create_message_thread(
    'Launch', array[partner], array[]::uuid[], 'professional'
  );

  select count(*) into n from public.message_threads
  where id = home_thread and workspace = 'personal';
  if n <> 1 then raise exception 'FAIL: a thread did not default to the personal workspace'; end if;
  select count(*) into n from public.message_threads
  where id = work_thread and workspace = 'professional';
  if n <> 1 then raise exception 'FAIL: a professional thread was not recorded as one'; end if;
  raise notice 'PASS     a thread records the workspace it was started in';

  blocked := false;
  begin
    perform public.create_message_thread('Nowhere', array[partner], array[]::uuid[], 'astrology');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an unknown workspace was accepted'; end if;
  raise notice 'PASS     the workspace list is closed';

  -- The Family thread is the household's, so it cannot be moved to work.
  blocked := false;
  begin
    update public.message_threads set workspace = 'professional'
    where household_id = faria_household and is_family_thread;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: the Family thread was moved out of Personal'; end if;
  raise notice 'PASS     the Family thread cannot leave the personal workspace';

  -- ---- one Family, with the household's members and nobody else ----
  select count(*) into n from public.message_threads
  where household_id = faria_household and is_family_thread;
  if n <> 1 then raise exception 'FAIL: % family threads for one household', n; end if;

  perform public.sync_family_message_thread();
  select count(*) into n
  from public.message_thread_members m
  join public.message_threads t on t.id = m.thread_id
  where t.household_id = faria_household and t.is_family_thread
    and not exists (
      select 1 from public.household_members hm
      where hm.household_id = faria_household and hm.user_id = m.user_id
    );
  if n <> 0 then raise exception 'FAIL: % stranger(s) left in the Family thread', n; end if;
  raise notice 'PASS     syncing Family leaves exactly the household in it';

  delete from public.message_threads where id in (home_thread, work_thread);
  reset role;
end $$;

-- ============ inviting somebody straight into a team ============
do $$
declare
  faria   uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  newcomer uuid := '66666666-6666-6666-6666-666666666666';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  pod uuid;
  foreign_pod uuid;
  token text;
  blocked boolean;
  n int;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (newcomer, 'newcomer@example.test', now(), '{}')
  on conflict (id) do nothing;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  pod := public.create_message_team('Marketing and Sales', array[]::uuid[]);

  select i.invitation_token into token
  from public.create_household_invitation(
    'newcomer@example.test', 'adult', pod, 'owner'
  ) i;
  if token is null then raise exception 'FAIL: no invitation was issued'; end if;

  select count(*) into n from public.household_invitations
  where team_id = pod and team_role = 'owner' and accepted_at is null;
  if n <> 1 then raise exception 'FAIL: the invitation did not record its team'; end if;
  raise notice 'PASS     an invitation carries the team and the role it was issued for';

  -- A team from another household cannot be named. Created as its owner,
  -- because RLS would otherwise hide it from Faria and the id would be null —
  -- which proves nothing.
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  foreign_pod := public.create_message_team('Someone else''s pod', array[]::uuid[]);
  perform set_config('request.jwt.claim.sub', faria::text, true);
  blocked := false;
  begin
    perform public.create_household_invitation(
      'someone@example.test', 'adult', foreign_pod, 'member'
    );
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: invited into another household''s team'; end if;
  raise notice 'PASS     an invitation cannot name another household''s team';

  -- Accepting joins the household and the team, in the role named.
  perform set_config('request.jwt.claim.sub', newcomer::text, true);
  perform public.accept_household_invitation(token);

  select count(*) into n from public.household_members
  where user_id = newcomer and household_id = (
    select household_id from public.message_teams where id = pod
  );
  if n <> 1 then raise exception 'FAIL: accepting did not join the household'; end if;

  select count(*) into n from public.message_team_members
  where team_id = pod and user_id = newcomer and member_role = 'owner';
  if n <> 1 then raise exception 'FAIL: accepting did not join the team in its role'; end if;
  raise notice 'PASS     accepting joins the household and the team in one step';

  -- The access level came from the invitation, so it manages the team now.
  perform public.set_message_team_role(pod, newcomer, 'member');
  select count(*) into n from public.message_team_members
  where team_id = pod and user_id = newcomer and member_role = 'member';
  if n <> 1 then raise exception 'FAIL: the invited owner could not use its access'; end if;
  raise notice 'PASS     the access level chosen at invite time is the one granted';

  -- A plain member cannot invite into the team.
  perform set_config('request.jwt.claim.sub', partner::text, true);
  blocked := false;
  begin
    perform public.create_team_invitation('other@example.test', pod, 'member');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a non-owner invited into a team'; end if;
  raise notice 'PASS     only a team owner can invite into their team';

  -- Owning a team is not the same as being allowed to admit a stranger to the
  -- household that contains it.
  perform set_config('request.jwt.claim.sub', faria::text, true);
  insert into public.message_team_members (team_id, user_id, added_by, member_role)
  values (pod, partner, faria, 'owner')
  on conflict (team_id, user_id) do update set member_role = 'owner';
  perform set_config('request.jwt.claim.sub', partner::text, true);
  blocked := false;
  begin
    perform public.create_team_invitation('outsider@example.test', pod, 'member');
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL: a team owner who is not the household owner admitted a stranger';
  end if;
  raise notice 'PASS     admitting someone new stays with the household owner';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  delete from public.message_teams where id = pod;
  reset role;
end $$;

-- ============ a team is a conversation ============
do $$
declare
  faria   uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  pod uuid;
  pod_thread uuid;
  again uuid;
  blocked boolean;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  pod := public.create_message_team('Marketing', array[partner]);

  pod_thread := public.ensure_team_message_thread(pod);
  if pod_thread is null then raise exception 'FAIL: no thread was made for the team'; end if;

  -- Asking twice does not make two.
  again := public.ensure_team_message_thread(pod);
  if again <> pod_thread then raise exception 'FAIL: a second thread was created'; end if;
  select count(*) into n from public.message_threads where team_id = pod;
  if n <> 1 then raise exception 'FAIL: % threads for one team', n; end if;
  raise notice 'PASS     a team has exactly one conversation, however often it is asked for';

  -- It carries the team's name and its people.
  select count(*) into n from public.message_threads
  where id = pod_thread and title = 'Marketing' and workspace = 'professional';
  if n <> 1 then raise exception 'FAIL: the team thread is misnamed or in the wrong workspace'; end if;
  select count(*) into n from public.message_thread_members where thread_id = pod_thread;
  if n <> 2 then raise exception 'FAIL: the team thread has % members, expected 2', n; end if;
  raise notice 'PASS     it carries the team''s name, workspace and people';

  -- Renaming the team renames the conversation.
  perform public.update_message_team(pod, 'Marketing and Sales', array[faria, partner]);
  select count(*) into n from public.message_threads
  where id = pod_thread and title = 'Marketing and Sales';
  if n <> 1 then raise exception 'FAIL: renaming the team did not rename its conversation'; end if;
  raise notice 'PASS     renaming a team renames its conversation';

  -- Leaving the team leaves the conversation.
  perform public.update_message_team(pod, 'Marketing and Sales', array[faria]);
  perform public.ensure_team_message_thread(pod);
  select count(*) into n from public.message_thread_members
  where thread_id = pod_thread and user_id = partner;
  if n <> 0 then raise exception 'FAIL: somebody removed from the team kept talking in it'; end if;
  raise notice 'PASS     leaving the team leaves its conversation';

  -- Somebody outside cannot conjure one.
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  blocked := false;
  begin
    perform public.ensure_team_message_thread(pod);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an outsider opened a team conversation'; end if;

  -- And the conversation cannot be deleted out from under the team.
  perform set_config('request.jwt.claim.sub', faria::text, true);
  blocked := false;
  begin
    delete from public.message_threads where id = pod_thread;
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a team conversation was deleted while the team lived'; end if;
  raise notice 'PASS     a team conversation is the team''s, and outsiders cannot reach it';

  -- Deleting the team takes the conversation with it.
  delete from public.message_teams where id = pod;
  select count(*) into n from public.message_threads where id = pod_thread;
  if n <> 0 then raise exception 'FAIL: the conversation outlived its team'; end if;
  raise notice 'PASS     deleting a team takes its conversation with it';

  reset role;
end $$;
